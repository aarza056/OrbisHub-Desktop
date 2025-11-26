# OrbisAgent Bootstrap Script
# This minimal script downloads and runs the latest agent from CoreService
# Version: 1.0.0

param(
    [Parameter(Mandatory=$false)]
    [string]$CoreServiceUrl = "http://127.0.0.1:5000"
)

$ErrorActionPreference = 'Continue'

# Configuration
$installPath = $PSScriptRoot
$agentScriptPath = Join-Path $installPath "OrbisAgent.ps1"
$logsPath = Join-Path $installPath "Logs"
$bootstrapLog = Join-Path $logsPath "bootstrap.log"

# Ensure logs directory exists
if (-not (Test-Path $logsPath)) {
    New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
}

function Write-BootstrapLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path $bootstrapLog -Value $logMessage -ErrorAction SilentlyContinue
}

Write-BootstrapLog "OrbisAgent Bootstrap starting..."
Write-BootstrapLog "Core Service: $CoreServiceUrl"
Write-BootstrapLog "Install Path: $installPath"

# Download latest agent script
try {
    Write-BootstrapLog "Downloading latest agent script from CoreService..."
    
    $downloadUrl = "$CoreServiceUrl/api/agent/download"
    $tempAgentPath = Join-Path $installPath "OrbisAgent.ps1.tmp"
    
    # Download to temp file
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempAgentPath -UseBasicParsing
    
    # Verify download
    if (Test-Path $tempAgentPath) {
        $fileSize = (Get-Item $tempAgentPath).Length
        Write-BootstrapLog "Downloaded agent script: $fileSize bytes"
        
        # Replace existing agent script
        if (Test-Path $agentScriptPath) {
            Remove-Item $agentScriptPath -Force
        }
        Move-Item $tempAgentPath $agentScriptPath -Force
        
        Write-BootstrapLog "Agent script updated successfully" "SUCCESS"
    } else {
        throw "Download failed - temp file not found"
    }
    
} catch {
    Write-BootstrapLog "Failed to download agent script: $_" "ERROR"
    
    # Check if we have a cached version
    if (-not (Test-Path $agentScriptPath)) {
        Write-BootstrapLog "No cached agent script available. Cannot start agent." "ERROR"
        Write-BootstrapLog "Please check CoreService connectivity and try again." "ERROR"
        Start-Sleep 30
        exit 1
    }
    
    Write-BootstrapLog "Using cached agent script" "WARN"
}

# Check if agent script exists
if (-not (Test-Path $agentScriptPath)) {
    Write-BootstrapLog "Agent script not found at: $agentScriptPath" "ERROR"
    Start-Sleep 30
    exit 1
}

# Run the agent
Write-BootstrapLog "Starting OrbisAgent..."
Write-BootstrapLog "================================================================"

try {
    & $agentScriptPath -CoreServiceUrl $CoreServiceUrl
} catch {
    Write-BootstrapLog "Agent execution failed: $_" "ERROR"
    Start-Sleep 30
    exit 1
}

Write-BootstrapLog "Agent stopped."
