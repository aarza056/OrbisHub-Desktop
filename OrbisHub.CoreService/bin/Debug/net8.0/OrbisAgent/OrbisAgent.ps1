# OrbisAgent - PowerShell Client
# Communicates with OrbisHub Core Service

param(
    [Parameter(Mandatory=$false)]
    [string]$CoreServiceUrl = "http://localhost:5000",
    
    [Parameter(Mandatory=$false)]
    [int]$HeartbeatIntervalSeconds = 30,
    
    [Parameter(Mandatory=$false)]
    [int]$JobPollIntervalSeconds = 5
)

# Helper function to get or create persistent agent ID (must be defined before use)
function Get-PersistentAgentId {
    # Try to get stored AgentId first
    $agentIdFile = Join-Path $PSScriptRoot "agent-id.txt"
    
    if (Test-Path $agentIdFile) {
        try {
            $storedId = Get-Content $agentIdFile -Raw
            $storedId = $storedId.Trim()
            # Validate it's a valid GUID
            $guid = [Guid]::Parse($storedId)
            Write-Host "Using stored Agent ID: $storedId"
            return $storedId
        } catch {
            Write-Host "Invalid stored Agent ID, generating new one..."
        }
    }
    
    # Generate new AgentId based on machine GUID for persistence across reinstalls
    try {
        $machineGuid = Get-ItemPropertyValue -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name "MachineGuid" -ErrorAction Stop
        # Use machine GUID directly as the agent ID for true persistence
        $agentId = $machineGuid
        Write-Host "Generated new Agent ID from machine GUID: $agentId"
    } catch {
        # Fallback: generate random GUID
        $agentId = [Guid]::NewGuid().ToString()
        Write-Host "Machine GUID unavailable, generated random Agent ID: $agentId"
    }
    
    # Store the AgentId for future use
    try {
        Set-Content -Path $agentIdFile -Value $agentId -NoNewline
        Write-Host "Agent ID saved to: $agentIdFile"
    } catch {
        Write-Host "Warning: Could not save Agent ID to file: $_"
    }
    
    return $agentId
}

# Configuration
# Get or generate persistent AgentId based on machine identity
$script:AgentId = Get-PersistentAgentId
$script:CoreServiceUrl = $CoreServiceUrl
$script:Running = $true
$script:AgentVersion = "1.0.0"

# Log file - use Logs subdirectory if it exists
$logsDir = Join-Path $PSScriptRoot "Logs"
if (Test-Path $logsDir) {
    $script:LogPath = Join-Path $logsDir "OrbisAgent.log"
} else {
    $script:LogPath = Join-Path $PSScriptRoot "OrbisAgent.log"
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path $script:LogPath -Value $logMessage
}

function Get-MachineInfo {
    $ipAddresses = @()
    try {
        # Get only primary Ethernet and WiFi adapters with IPv4 addresses
        $adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
            $_.IPAddress -notlike "127.*" -and 
            $_.IPAddress -notlike "169.254.*" -and
            $_.InterfaceAlias -match "^(Ethernet|Wi-Fi|WiFi|WLAN)$"
        }
        $ipAddresses = $adapters | ForEach-Object { 
            "$($_.InterfaceAlias): $($_.IPAddress)"
        }
    } catch {
        Write-Log "Failed to get IP addresses: $_" "WARN"
    }
    
    # Get currently logged-in user
    $loggedInUser = "No active session"
    try {
        $users = query user 2>$null | Select-Object -Skip 1
        if ($users) {
            # Parse query user output to get active session
            $activeUser = $users | Where-Object { $_ -match 'Active' } | Select-Object -First 1
            if ($activeUser) {
                # Extract username (first field)
                $userName = ($activeUser -split '\s+')[1]
                if ($userName -and $userName -ne '') {
                    $loggedInUser = $userName
                }
            } else {
                # No active session, try to get any logged-in user
                $anyUser = $users | Select-Object -First 1
                if ($anyUser) {
                    $userName = ($anyUser -split '\s+')[1]
                    if ($userName -and $userName -ne '') {
                        $loggedInUser = "$userName (disconnected)"
                    }
                }
            }
        }
    } catch {
        Write-Log "Failed to get logged-in user: $_" "WARN"
    }
    
    return @{
        MachineName = $env:COMPUTERNAME
        IpAddresses = $ipAddresses
        OsVersion = [System.Environment]::OSVersion.VersionString
        AgentVersion = $script:AgentVersion
        LoggedInUser = $loggedInUser
    }
}

function Get-SystemMetrics {
    try {
        $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
        $mem = Get-CimInstance -ClassName Win32_OperatingSystem
        $memPercent = [math]::Round((($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / $mem.TotalVisibleMemorySize) * 100, 1)
        $disk = Get-PSDrive C | Select-Object @{N='PercentUsed';E={[math]::Round(($_.Used / ($_.Used + $_.Free)) * 100, 1)}}
        
        # Uptime calculation
        $uptimeSpan = (Get-Date) - $mem.LastBootUpTime
        $uptimeFormatted = if ($uptimeSpan.TotalHours -gt 24) {
            "$([math]::Floor($uptimeSpan.TotalDays))d $($uptimeSpan.Hours)h"
        } else {
            "$([math]::Floor($uptimeSpan.TotalHours))h $($uptimeSpan.Minutes)m"
        }
        
        return @{
            cpuPercent = [math]::Round($cpu, 1)
            memoryPercent = $memPercent
            diskPercent = $disk.PercentUsed
            uptime = $uptimeFormatted
        }
    } catch {
        return @{ cpuPercent = 0; memoryPercent = 0; diskPercent = 0; uptime = '—' }
    }
}

function Register-Agent {
    param([int]$MaxRetries = -1, [int]$RetryIntervalSeconds = 10)
    
    Write-Log "Registering agent with Core Service..."
    Write-Log "Agent ID: $script:AgentId"
    
    $machineInfo = Get-MachineInfo
    
    # Ensure ipAddresses is always an array (even if empty)
    $ipArray = @()
    if ($machineInfo.IpAddresses) {
        $ipArray = @($machineInfo.IpAddresses)
    }
    
    $body = @{
        agentId = $script:AgentId
        machineName = $machineInfo.MachineName
        ipAddresses = $ipArray
        osVersion = $machineInfo.OsVersion
        agentVersion = $machineInfo.AgentVersion
        loggedInUser = $machineInfo.LoggedInUser
    } | ConvertTo-Json -Depth 10
    
    $attempt = 0
    while ($MaxRetries -lt 0 -or $attempt -lt $MaxRetries) {
        $attempt++
        
        try {
            $response = Invoke-RestMethod -Uri "$script:CoreServiceUrl/api/agents/register" `
                -Method Post `
                -Body $body `
                -ContentType "application/json" `
                -TimeoutSec 10
            
            Write-Log "Agent registered successfully. Status: $($response.status)" "SUCCESS"
            return $true
        } catch {
            $errorDetails = $_.Exception.Message
            if ($_.Exception.Response) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errorBody = $reader.ReadToEnd()
                $errorDetails += " | Response: $errorBody"
            }
            Write-Log "Failed to register agent (attempt $attempt): $errorDetails" "WARN"
            
            if ($MaxRetries -ge 0 -and $attempt -ge $MaxRetries) {
                Write-Log "Max registration attempts reached. Giving up." "ERROR"
                return $false
            }
            
            Write-Log "Retrying in $RetryIntervalSeconds seconds..." "INFO"
            Start-Sleep -Seconds $RetryIntervalSeconds
        }
    }
    
    return $false
}

function Send-Heartbeat {
    if (-not $script:AgentId) { return $false }
    
    $metrics = Get-SystemMetrics
    $body = @{
        agentVersion = $script:AgentVersion
        currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        metadata = ($metrics | ConvertTo-Json -Compress)
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$script:CoreServiceUrl/api/agents/$script:AgentId/heartbeat" `
            -Method Post `
            -Body $body `
            -ContentType "application/json"
        
        Write-Log "Heartbeat sent successfully" "DEBUG"
        return $true
    } catch {
        # If agent not found (404), re-register
        if ($_.Exception.Response.StatusCode.value__ -eq 404) {
            Write-Log "Agent not found in database (404). Re-registering..." "WARN"
            $registered = Register-Agent
            if ($registered) {
                Write-Log "Re-registration successful" "SUCCESS"
                return $true
            }
        }
        Write-Log "Failed to send heartbeat: $_" "ERROR"
        return $false
    }
}

function Get-NextJob {
    if (-not $script:AgentId) { return $null }
    
    try {
        $response = Invoke-RestMethod -Uri "$script:CoreServiceUrl/api/agents/$script:AgentId/jobs/next" `
            -Method Get
        
        # API returns {job: null} when no jobs, or {jobId, type, payload} when there is a job
        if ($response.job -eq $null -and $response.jobId -eq $null) {
            return $null
        }
        
        # If response has jobId directly, return it
        if ($response.jobId) {
            return $response
        }
        
        # Otherwise check if job property exists
        if ($response.job) {
            return $response.job
        }
        
        return $null
    } catch {
        # If agent not found (404), re-register and retry
        if ($_.Exception.Response.StatusCode.value__ -eq 404) {
            Write-Log "Agent not found when polling for jobs (404). Re-registering..." "WARN"
            $registered = Register-Agent
            if (-not $registered) {
                Write-Log "Re-registration failed" "ERROR"
            }
        } else {
            Write-Log "Failed to get next job: $_" "ERROR"
        }
        return $null
    }
}

function Invoke-JobExecution {
    param($Job)
    
    Write-Log "Executing job $($Job.jobId) of type $($Job.type)"
    
    $result = @{
        status = "Succeeded"
        output = ""
        errorMessage = $null
    }
    
    try {
        switch ($Job.type) {
            "PowerShell" {
                $script = $Job.payload.script
                Write-Log "Running PowerShell script: $script"
                
                $output = Invoke-Expression $script 2>&1 | Out-String
                $result.output = $output
                Write-Log "Script executed successfully"
            }
            
            "RunScript" {
                $script = $Job.payload.script
                $shell = $Job.payload.shell
                
                Write-Log "Running script in $shell : $script"
                
                if ($shell -eq "powershell") {
                    $output = Invoke-Expression $script 2>&1 | Out-String
                } elseif ($shell -eq "cmd") {
                    $output = cmd.exe /c $script 2>&1 | Out-String
                } else {
                    throw "Unsupported shell: $shell"
                }
                
                $result.output = $output
                Write-Log "Script executed successfully"
            }
            
            "GetSystemInfo" {
                $info = @{
                    ComputerName = $env:COMPUTERNAME
                    OSVersion = [System.Environment]::OSVersion.VersionString
                    PowerShellVersion = $PSVersionTable.PSVersion.ToString()
                    Uptime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
                    Memory = (Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize
                    Processor = (Get-CimInstance Win32_Processor).Name
                }
                $result.output = $info | ConvertTo-Json
            }
            
            "GetProcessList" {
                $processes = Get-Process | Select-Object Name, Id, CPU, WorkingSet | ConvertTo-Json
                $result.output = $processes
            }
            
            "GetServiceStatus" {
                $serviceName = $Job.payload.serviceName
                $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
                if ($service) {
                    $result.output = $service | Select-Object Name, Status, StartType | ConvertTo-Json
                } else {
                    throw "Service '$serviceName' not found"
                }
            }
            
            default {
                throw "Unknown job type: $($Job.type)"
            }
        }
    } catch {
        $result.status = "Failed"
        $result.errorMessage = $_.Exception.Message
        $result.output = $_.Exception.ToString()
        Write-Log "Job execution failed: $($_.Exception.Message)" "ERROR"
    }
    
    return $result
}

function Send-JobResult {
    param($JobId, $Result)
    
    $body = $Result | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$script:CoreServiceUrl/api/agents/$script:AgentId/jobs/$JobId/result" `
            -Method Post `
            -Body $body `
            -ContentType "application/json"
        
        Write-Log "Job result sent successfully for job $JobId" "SUCCESS"
        return $true
    } catch {
        Write-Log "Failed to send job result: $_" "ERROR"
        return $false
    }
}

function Start-AgentLoop {
    Write-Log "Starting OrbisAgent..."
    Write-Log "Core Service URL: $script:CoreServiceUrl"
    
    # Register agent with unlimited retries on startup
    Write-Log "Attempting to register with Core Service (will retry until successful)..."
    $registered = Register-Agent -MaxRetries -1 -RetryIntervalSeconds 60
    if (-not $registered) {
        Write-Log "Failed to register agent. Exiting..." "ERROR"
        return
    }
    
    $lastHeartbeat = Get-Date
    $lastJobPoll = Get-Date
    
    Write-Log "Agent loop started. Press Ctrl+C to stop."
    
    while ($script:Running) {
        try {
            $now = Get-Date
            
            # Send heartbeat
            if (($now - $lastHeartbeat).TotalSeconds -ge $HeartbeatIntervalSeconds) {
                Send-Heartbeat | Out-Null
                $lastHeartbeat = $now
            }
            
            # Poll for jobs
            if (($now - $lastJobPoll).TotalSeconds -ge $JobPollIntervalSeconds) {
                Write-Log "Polling for jobs..." "DEBUG"
                $job = Get-NextJob
                if ($job) {
                    Write-Log "Received job: $($job.jobId)"
                    $result = Invoke-JobExecution -Job $job
                    Send-JobResult -JobId $job.jobId -Result $result | Out-Null
                } else {
                    Write-Log "No jobs available" "DEBUG"
                }
                $lastJobPoll = $now
            }
            
            # Sleep for a short interval
            Start-Sleep -Milliseconds 500
            
        } catch {
            Write-Log "Error in agent loop: $_" "ERROR"
            Start-Sleep -Seconds 5
        }
    }
    
    Write-Log "Agent stopped."
}

# Handle Ctrl+C
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    $script:Running = $false
    Write-Log "Shutting down agent..."
}

# Start the agent
Start-AgentLoop
