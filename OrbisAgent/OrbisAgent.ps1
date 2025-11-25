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

# Configuration
$script:AgentId = $null
$script:CoreServiceUrl = $CoreServiceUrl
$script:Running = $true
$script:AgentVersion = "1.0.0"

# Log file
$script:LogPath = Join-Path $PSScriptRoot "OrbisAgent.log"

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
        $adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" }
        $ipAddresses = $adapters | ForEach-Object { $_.IPAddress }
    } catch {
        Write-Log "Failed to get IP addresses: $_" "WARN"
    }
    
    return @{
        MachineName = $env:COMPUTERNAME
        IpAddresses = $ipAddresses
        OsVersion = [System.Environment]::OSVersion.VersionString
        AgentVersion = $script:AgentVersion
    }
}

function Get-SystemMetrics {
    try {
        $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
        $mem = Get-CimInstance -ClassName Win32_OperatingSystem
        $memPercent = [math]::Round((($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / $mem.TotalVisibleMemorySize) * 100, 1)
        $disk = Get-PSDrive C | Select-Object @{N='PercentUsed';E={[math]::Round(($_.Used / ($_.Used + $_.Free)) * 100, 1)}}
        
        return @{
            cpuPercent = [math]::Round($cpu, 1)
            memoryPercent = $memPercent
            diskPercent = $disk.PercentUsed
        }
    } catch {
        return @{ cpuPercent = 0; memoryPercent = 0; diskPercent = 0 }
    }
}

function Register-Agent {
    Write-Log "Registering agent with Core Service..."
    
    $machineInfo = Get-MachineInfo
    $body = @{
        machineName = $machineInfo.MachineName
        ipAddresses = $machineInfo.IpAddresses
        osVersion = $machineInfo.OsVersion
        agentVersion = $machineInfo.AgentVersion
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$script:CoreServiceUrl/api/agents/register" `
            -Method Post `
            -Body $body `
            -ContentType "application/json"
        
        $script:AgentId = $response.agentId
        Write-Log "Agent registered successfully. AgentId: $script:AgentId" "SUCCESS"
        return $true
    } catch {
        Write-Log "Failed to register agent: $_" "ERROR"
        return $false
    }
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
        Write-Log "Failed to send heartbeat: $_" "ERROR"
        return $false
    }
}

function Get-NextJob {
    if (-not $script:AgentId) { return $null }
    
    try {
        $response = Invoke-RestMethod -Uri "$script:CoreServiceUrl/api/agents/$script:AgentId/jobs/next" `
            -Method Get
        
        if ($response.job -eq $null -or $response.jobId -eq $null) {
            return $null
        }
        
        return $response
    } catch {
        Write-Log "Failed to get next job: $_" "ERROR"
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
    
    # Register agent
    $registered = Register-Agent
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
                $job = Get-NextJob
                if ($job) {
                    Write-Log "Received job: $($job.jobId)"
                    $result = Invoke-JobExecution -Job $job
                    Send-JobResult -JobId $job.jobId -Result $result | Out-Null
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
