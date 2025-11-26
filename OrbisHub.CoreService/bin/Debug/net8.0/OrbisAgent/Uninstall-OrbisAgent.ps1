# Uninstall OrbisAgent Service/Scheduled Task
# Run this script as Administrator

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    exit 1
}

Write-Host "=== OrbisAgent Uninstaller ===" -ForegroundColor Cyan
Write-Host ""

# Check for scheduled task
$taskName = "OrbisAgent"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "Found scheduled task: $taskName" -ForegroundColor Yellow
    Write-Host "Stopping task..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    
    Write-Host "Removing task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    
    Write-Host "✓ Scheduled task removed" -ForegroundColor Green
}

# Check for Windows Service
$serviceName = "OrbisAgent"
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "Found Windows Service: $serviceName" -ForegroundColor Yellow
    Write-Host "Stopping service..." -ForegroundColor Yellow
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    
    # If NSSM is available, use it to remove
    $nssmPath = "C:\Program Files\OrbisAgent\nssm.exe"
    if (Test-Path $nssmPath) {
        Write-Host "Removing service with NSSM..." -ForegroundColor Yellow
        & $nssmPath remove $serviceName confirm
    } else {
        # Use sc.exe as fallback
        Write-Host "Removing service..." -ForegroundColor Yellow
        sc.exe delete $serviceName
    }
    
    Write-Host "✓ Windows Service removed" -ForegroundColor Green
}

# Optional: Remove installation directory
Write-Host ""
$removeFiles = Read-Host "Remove installation files from C:\Program Files\OrbisAgent? (Y/N)"
if ($removeFiles -eq 'Y' -or $removeFiles -eq 'y') {
    if (Test-Path "C:\Program Files\OrbisAgent") {
        Write-Host "Removing files..." -ForegroundColor Yellow
        Write-Host "  Note: This will also remove agent-id.txt (agent will get new ID on reinstall)" -ForegroundColor Cyan
        Remove-Item -Path "C:\Program Files\OrbisAgent" -Recurse -Force
        Write-Host "✓ Files removed" -ForegroundColor Green
    }
} else {
    Write-Host "  Installation files preserved at C:\Program Files\OrbisAgent" -ForegroundColor Cyan
    Write-Host "  Agent will reuse same ID if reinstalled" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "✓ OrbisAgent uninstalled successfully!" -ForegroundColor Green
Write-Host ""
