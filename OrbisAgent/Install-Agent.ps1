# OrbisAgent Installer
# Installs OrbisAgent as a scheduled task that runs on startup

param(
    [Parameter(Mandatory=$false)]
    [string]$CoreServiceUrl = "http://localhost:5000",
    
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\OrbisAgent"
)

# Check for admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

Write-Host "OrbisAgent Installation" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""

# Create installation directory
Write-Host "[1/3] Creating installation directory..." -ForegroundColor Yellow
if (-not (Test-Path $InstallPath)) {
    New-Item -Path $InstallPath -ItemType Directory | Out-Null
}

# Copy agent script
$agentScript = Join-Path $PSScriptRoot "OrbisAgent.ps1"
$targetScript = Join-Path $InstallPath "OrbisAgent.ps1"

if (Test-Path $agentScript) {
    Copy-Item -Path $agentScript -Destination $targetScript -Force
    Write-Host "Agent installed to $InstallPath" -ForegroundColor Green
} else {
    Write-Error "OrbisAgent.ps1 not found in current directory"
    exit 1
}

# Create config file
Write-Host "[2/3] Creating configuration..." -ForegroundColor Yellow
$configContent = @"
# OrbisAgent Configuration
`$CoreServiceUrl = "$CoreServiceUrl"
`$HeartbeatIntervalSeconds = 30
`$JobPollIntervalSeconds = 5
"@

$configPath = Join-Path $InstallPath "config.ps1"
$configContent | Out-File -FilePath $configPath -Encoding UTF8
Write-Host "Configuration created" -ForegroundColor Green

# Create wrapper script that loads config
$wrapperScript = @"
# Load configuration
. (Join-Path `$PSScriptRoot "config.ps1")

# Start agent with configuration
& (Join-Path `$PSScriptRoot "OrbisAgent.ps1") ``
    -CoreServiceUrl `$CoreServiceUrl ``
    -HeartbeatIntervalSeconds `$HeartbeatIntervalSeconds ``
    -JobPollIntervalSeconds `$JobPollIntervalSeconds
"@

$wrapperPath = Join-Path $InstallPath "Start-Agent.ps1"
$wrapperScript | Out-File -FilePath $wrapperPath -Encoding UTF8

# Create scheduled task
Write-Host "[3/3] Creating scheduled task..." -ForegroundColor Yellow

$taskName = "OrbisAgent"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$wrapperPath`""

$trigger = New-ScheduledTaskTrigger -AtStartup

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "OrbisHub Agent - Communicates with OrbisHub Core Service" | Out-Null

Write-Host "Scheduled task created" -ForegroundColor Green

# Start the task
Write-Host "Starting agent..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Task Name: $taskName" -ForegroundColor White
Write-Host "Install Path: $InstallPath" -ForegroundColor White
Write-Host "Core Service: $CoreServiceUrl" -ForegroundColor White
Write-Host ""
Write-Host "Management Commands:" -ForegroundColor Yellow
Write-Host "  Start:  Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host "  Stop:   Stop-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host "  Status: Get-ScheduledTask -TaskName '$taskName' | Select-Object State" -ForegroundColor Gray
Write-Host "  Logs:   Get-Content '$InstallPath\OrbisAgent.log' -Tail 50" -ForegroundColor Gray
Write-Host ""
