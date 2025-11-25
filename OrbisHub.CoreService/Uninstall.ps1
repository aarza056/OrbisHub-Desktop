# OrbisHub Core Service - Uninstall Script
# Run with Administrator privileges

param(
    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "OrbisHubCoreService",
    
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\OrbisHub\CoreService",
    
    [Parameter(Mandatory=$false)]
    [switch]$RemoveFiles = $false
)

# Check for admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

Write-Host "OrbisHub Core Service Uninstallation" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Stop the service
Write-Host "Stopping service..." -ForegroundColor Yellow
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
        Write-Host "Service stopped" -ForegroundColor Green
    } else {
        Write-Host "Service already stopped" -ForegroundColor Yellow
    }
    
    # Delete the service
    Write-Host "Removing service..." -ForegroundColor Yellow
    sc.exe delete $ServiceName
    Start-Sleep -Seconds 2
    Write-Host "Service removed" -ForegroundColor Green
} else {
    Write-Host "Service not found" -ForegroundColor Yellow
}

# Remove firewall rules
Write-Host "Removing firewall rules..." -ForegroundColor Yellow
$rules = Get-NetFirewallRule -DisplayName "OrbisHub Core Service*" -ErrorAction SilentlyContinue
if ($rules) {
    $rules | Remove-NetFirewallRule
    Write-Host "Firewall rules removed" -ForegroundColor Green
} else {
    Write-Host "No firewall rules found" -ForegroundColor Yellow
}

# Optionally remove files
if ($RemoveFiles) {
    Write-Host "Removing installation files..." -ForegroundColor Yellow
    if (Test-Path $InstallPath) {
        Remove-Item -Path $InstallPath -Recurse -Force
        Write-Host "Files removed from $InstallPath" -ForegroundColor Green
    } else {
        Write-Host "Installation directory not found" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Uninstallation Complete!" -ForegroundColor Cyan
Write-Host ""

if (-not $RemoveFiles) {
    Write-Host "Note: Installation files were not removed." -ForegroundColor Yellow
    Write-Host "To remove files, run: .\Uninstall.ps1 -RemoveFiles" -ForegroundColor Yellow
    Write-Host "Files location: $InstallPath" -ForegroundColor Yellow
}
