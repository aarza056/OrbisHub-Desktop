# OrbisAgent Client - PowerShell Implementation
# Lightweight agent for Windows machines
# Author: OrbisHub Team
# Created: 2025-11-25
# Version: 1.0.0

<#
.SYNOPSIS
    OrbisAgent - Remote monitoring and script execution agent for OrbisHub

.DESCRIPTION
    This script runs as a background agent that:
    - Registers with OrbisHub central server
    - Sends periodic heartbeats with system metrics
    - Polls for pending jobs/scripts to execute
    - Reports execution results back to OrbisHub

.PARAMETER HubUrl
    URL of the OrbisHub server (e.g., http://hub.company.local:3000)

.PARAMETER AgentId
    Unique identifier for this agent (defaults to computer name)

.PARAMETER PollInterval
    Seconds between job polls (default: 30)

.PARAMETER MetricsInterval
    Seconds between metric reports (default: 60)

.EXAMPLE
    .\agent-client.ps1 -HubUrl "http://orbishub:3000"

.EXAMPLE
    .\agent-client.ps1 -HubUrl "http://192.168.1.100:3000" -AgentId "PROD-WEB-01" -PollInterval 20
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$HubUrl,
    
    [Parameter(Mandatory=$false)]
    [string]$AgentId = $env:COMPUTERNAME,
    
    [Parameter(Mandatory=$false)]
    [int]$PollInterval = 30,
    
    [Parameter(Mandatory=$false)]
    [int]$MetricsInterval = 60
)

# Agent version
$AgentVersion = "1.0.0"

# Ensure TLS 1.2 for HTTPS connections
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Log file path
$LogPath = "$env:TEMP\OrbisAgent_$AgentId.log"

# Function to write logs
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[$Timestamp] [$Level] $Message"
    Write-Host $LogMessage
    Add-Content -Path $LogPath -Value $LogMessage
}

# Function to get system metrics
function Get-SystemMetrics {
    try {
        # CPU usage
        $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
        
        # Memory usage
        $memory = (Get-Counter '\Memory\% Committed Bytes In Use' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
        
        # Disk usage (C: drive)
        $disk = $null
        try {
            $driveInfo = Get-PSDrive C -ErrorAction SilentlyContinue
            if ($driveInfo) {
                $disk = [math]::Round((($driveInfo.Used / ($driveInfo.Used + $driveInfo.Free)) * 100), 2)
            }
        } catch {
            Write-Log "Failed to get disk metrics: $_" "WARN"
        }
        
        return @{
            cpuPercent = [math]::Round($cpu, 2)
            memoryPercent = [math]::Round($memory, 2)
            diskPercent = $disk
            uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
        }
    } catch {
        Write-Log "Failed to collect metrics: $_" "ERROR"
        return @{}
    }
}

# Function to register agent with hub
function Register-Agent {
    try {
        $osInfo = Get-CimInstance Win32_OperatingSystem
        $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike "127.*"} | Select-Object -First 1).IPAddress
        
        $body = @{
            id = $AgentId
            machineName = $env:COMPUTERNAME
            os = "$($osInfo.Caption) $($osInfo.Version)"
            ipAddress = $ipAddress
            status = "online"
            version = $AgentVersion
            metadata = Get-SystemMetrics
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$HubUrl/api/agent/register" -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
        Write-Log "Agent registered successfully with OrbisHub"
        return $true
    } catch {
        Write-Log "Failed to register agent: $_" "ERROR"
        return $false
    }
}

# Function to send heartbeat with metrics
function Send-Heartbeat {
    try {
        $metrics = Get-SystemMetrics
        
        $body = @{
            agentId = $AgentId
        } + $metrics | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$HubUrl/api/agent/metrics" -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop | Out-Null
        Write-Log "Heartbeat sent (CPU: $($metrics.cpuPercent)%, MEM: $($metrics.memoryPercent)%)"
    } catch {
        Write-Log "Failed to send heartbeat: $_" "WARN"
    }
}

# Function to poll for pending jobs
function Get-PendingJobs {
    try {
        $response = Invoke-RestMethod -Uri "$HubUrl/api/agent/poll?agentId=$AgentId" -Method Get -ErrorAction Stop
        
        if ($response.jobs -and $response.jobs.Count -gt 0) {
            Write-Log "Received $($response.jobs.Count) pending job(s)"
            return $response.jobs
        }
        
        return @()
    } catch {
        Write-Log "Failed to poll for jobs: $_" "WARN"
        return @()
    }
}

# Function to execute a job
function Invoke-Job {
    param($Job)
    
    Write-Log "Executing job $($Job.id) (type: $($Job.type))"
    
    try {
        # Update job status to running
        Update-JobStatus -JobId $Job.id -Status "running"
        
        # Execute the script
        $output = ""
        $exitCode = 0
        
        try {
            if ($Job.type -eq "script") {
                # Execute as PowerShell script
                $scriptBlock = [scriptblock]::Create($Job.script)
                $output = & $scriptBlock 2>&1 | Out-String
            } else {
                # Execute as command
                $output = Invoke-Expression $Job.script 2>&1 | Out-String
            }
        } catch {
            $output = $_.Exception.Message
            $exitCode = 1
        }
        
        # Prepare result
        $result = @{
            exitCode = $exitCode
            output = $output
            executedAt = (Get-Date).ToUniversalTime().ToString("o")
        } | ConvertTo-Json
        
        # Update job with result
        $status = if ($exitCode -eq 0) { "completed" } else { "failed" }
        Update-JobStatus -JobId $Job.id -Status $status -Result $result
        
        Write-Log "Job $($Job.id) completed with exit code $exitCode"
        
    } catch {
        Write-Log "Job execution failed: $_" "ERROR"
        
        $errorResult = @{
            exitCode = 1
            output = $_.Exception.Message
            error = $_.Exception.ToString()
        } | ConvertTo-Json
        
        Update-JobStatus -JobId $Job.id -Status "failed" -Result $errorResult
    }
}

# Function to update job status
function Update-JobStatus {
    param(
        [string]$JobId,
        [string]$Status,
        [string]$Result = $null
    )
    
    try {
        $body = @{
            jobId = $JobId
            status = $Status
        }
        
        if ($Result) {
            $body.result = $Result
        }
        
        $jsonBody = $body | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$HubUrl/api/agent/job-status" -Method Post -Body $jsonBody -ContentType "application/json" -ErrorAction Stop | Out-Null
        
    } catch {
        Write-Log "Failed to update job status: $_" "ERROR"
    }
}

# Main agent loop
function Start-Agent {
    Write-Log "===== OrbisAgent v$AgentVersion Starting ====="
    Write-Log "Agent ID: $AgentId"
    Write-Log "Hub URL: $HubUrl"
    Write-Log "Poll Interval: $PollInterval seconds"
    Write-Log "Metrics Interval: $MetricsInterval seconds"
    
    # Initial registration
    if (-not (Register-Agent)) {
        Write-Log "Failed to register with OrbisHub. Retrying in 30 seconds..." "ERROR"
        Start-Sleep -Seconds 30
        if (-not (Register-Agent)) {
            Write-Log "Registration failed again. Exiting." "ERROR"
            return
        }
    }
    
    $lastMetricsTime = Get-Date
    
    Write-Log "Agent running. Press Ctrl+C to stop."
    
    while ($true) {
        try {
            # Poll for jobs
            $jobs = Get-PendingJobs
            
            foreach ($job in $jobs) {
                Invoke-Job -Job $job
            }
            
            # Send metrics if interval has elapsed
            $now = Get-Date
            if (($now - $lastMetricsTime).TotalSeconds -ge $MetricsInterval) {
                Send-Heartbeat
                $lastMetricsTime = $now
            }
            
            # Wait before next poll
            Start-Sleep -Seconds $PollInterval
            
        } catch {
            Write-Log "Error in main loop: $_" "ERROR"
            Start-Sleep -Seconds 10
        }
    }
}

# Start the agent
Start-Agent
