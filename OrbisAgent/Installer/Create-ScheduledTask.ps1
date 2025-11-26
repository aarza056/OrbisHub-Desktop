# Create OrbisAgent Scheduled Task
# Run this script as Administrator after installing the MSI

$ErrorActionPreference = "Stop"

$taskName = "OrbisAgent"
$installPath = "C:\Program Files (x86)\OrbisAgent"
$scriptPath = Join-Path $installPath "OrbisAgent-Service.ps1"

Write-Host "=== OrbisAgent Scheduled Task Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if files exist
if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Agent script not found at: $scriptPath" -ForegroundColor Red
    Write-Host "Please install the MSI first." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] Removing existing task (if any)..." -ForegroundColor Yellow
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "  [OK] Removed existing task" -ForegroundColor Green
}

Write-Host "[2/3] Creating scheduled task..." -ForegroundColor Yellow

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365)

$principal = New-ScheduledTaskPrincipal `
    -UserId 'SYSTEM' `
    -LogonType ServiceAccount `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'OrbisHub PowerShell Agent - Executes jobs from OrbisHub Core Service' `
    -Force | Out-Null

Write-Host "  [OK] Task created" -ForegroundColor Green

Write-Host "[3/3] Starting agent..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $taskName
Start-Sleep 3

$taskInfo = Get-ScheduledTask -TaskName $taskName
if ($taskInfo.State -eq 'Running') {
    Write-Host "  [OK] Agent is running" -ForegroundColor Green
} else {
    Write-Host "  [WARNING] Task state: $($taskInfo.State)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[SUCCESS] OrbisAgent scheduled task configured!" -ForegroundColor Green
Write-Host ""
Write-Host "Task Details:" -ForegroundColor Cyan
Write-Host "  Name:   $taskName" -ForegroundColor White
Write-Host "  Status: $($taskInfo.State)" -ForegroundColor White
Write-Host "  Script: $scriptPath" -ForegroundColor White
Write-Host "  Logs:   $installPath\Logs\OrbisAgent.log" -ForegroundColor White
Write-Host ""
Write-Host "The agent should now appear in your OrbisHub Desktop application." -ForegroundColor Green
Write-Host ""
