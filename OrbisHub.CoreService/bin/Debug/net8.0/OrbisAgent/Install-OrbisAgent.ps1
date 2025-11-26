# Install OrbisAgent as Windows Service
# Run this script as Administrator

param(
    [Parameter(Mandatory=$false)]
    [string]$CoreServiceUrl = "http://127.0.0.1:5000",
    
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\OrbisAgent"
)

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator', then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "=== OrbisAgent Service Installer ===" -ForegroundColor Cyan
Write-Host ""

# Create installation directory
if (-not (Test-Path $InstallPath)) {
    Write-Host "Creating installation directory: $InstallPath" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

# Copy agent files
Write-Host "Copying agent files..." -ForegroundColor Yellow
$sourceFile = Join-Path $PSScriptRoot "OrbisAgent.ps1"
if (-not (Test-Path $sourceFile)) {
    Write-Host "ERROR: OrbisAgent.ps1 not found in current directory!" -ForegroundColor Red
    exit 1
}

Copy-Item -Path $sourceFile -Destination $InstallPath -Force

# Create service wrapper script
$serviceWrapperPath = Join-Path $InstallPath "OrbisAgent-Service.ps1"
$wrapperScript = @"
# OrbisAgent Service Wrapper
# This script runs the agent continuously as a Windows Service

`$ErrorActionPreference = 'Continue'
`$CoreServiceUrl = '$CoreServiceUrl'

# Change to agent directory
Set-Location -Path '$InstallPath'

# Run the agent
& '.\OrbisAgent.ps1' -CoreServiceUrl `$CoreServiceUrl
"@

Set-Content -Path $serviceWrapperPath -Value $wrapperScript -Force

Write-Host "Installing as Scheduled Task (runs as SYSTEM with admin privileges)..." -ForegroundColor Yellow

# Create scheduled task
$taskName = "OrbisAgent"

# Remove existing task if present
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing scheduled task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create action
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$serviceWrapperPath`""

# Create trigger (at startup with 30 second delay)
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365) `
    -RunOnlyIfNetworkAvailable:$false

# Create principal (run as SYSTEM)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register task
Write-Host "Creating scheduled task to run as SYSTEM..." -ForegroundColor Yellow
Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "OrbisHub PowerShell Agent - Executes jobs from OrbisHub Core Service" | Out-Null

# Start the task
Write-Host "Starting OrbisAgent..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 3

# Check if running
$taskInfo = Get-ScheduledTask -TaskName $taskName
if ($taskInfo.State -eq 'Running') {
    Write-Host ""
    Write-Host "[SUCCESS] OrbisAgent installed and started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Service Details:" -ForegroundColor Cyan
    Write-Host "  Name: $taskName" -ForegroundColor White
    Write-Host "  Type: Scheduled Task" -ForegroundColor White
    Write-Host "  User: SYSTEM (Administrator privileges)" -ForegroundColor White
    Write-Host "  Status: Running" -ForegroundColor Green
    Write-Host "  Core Service: $CoreServiceUrl" -ForegroundColor White
    Write-Host "  Install Path: $InstallPath" -ForegroundColor White
    Write-Host ""
    Write-Host "Management Commands:" -ForegroundColor Cyan
    Write-Host "  Stop:    Stop-ScheduledTask -TaskName '$taskName'" -ForegroundColor White
    Write-Host "  Start:   Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor White
    Write-Host "  Remove:  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:$false" -ForegroundColor White
    Write-Host "  Logs:    Get-Content '$InstallPath\OrbisAgent.log' -Tail 50" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[WARNING] Task created but not running. Check Task Scheduler for details." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Installation complete! The agent will now run with SYSTEM privileges." -ForegroundColor Green
Write-Host ""
