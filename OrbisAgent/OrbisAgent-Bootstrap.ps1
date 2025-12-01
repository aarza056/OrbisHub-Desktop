# OrbisAgent Bootstrap/Quick Installer
# Can be run directly from URL: irm http://server:5000/api/agent/download/bootstrap | iex
# Version: 1.0.0

param(
    [Parameter(Mandatory=$false)]
    [string]$CoreServiceUrl,
    
    [Parameter(Mandatory=$false)]
    [switch]$Install,
    
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\OrbisAgent"
)

$ErrorActionPreference = 'Stop'

# Auto-detect Core Service URL if not provided
if (-not $CoreServiceUrl) {
    # Try to detect from the download URL
    try {
        $stackTrace = Get-PSCallStack
        $invocationInfo = $stackTrace | Where-Object { $_.InvocationInfo.MyCommand.Name -eq '<ScriptBlock>' } | Select-Object -First 1
        
        # Default to asking user if we can't detect
        Write-Host "Auto-detecting server from download source..." -ForegroundColor Yellow
        
        # Common patterns for bootstrap download
        $detectedUrl = $null
        
        # Check if running from irm/iwr pipeline
        if ($MyInvocation.Line -match 'irm\s+([^\s|]+)' -or $MyInvocation.Line -match 'iwr\s+([^\s|]+)') {
            $downloadUrl = $matches[1]
            if ($downloadUrl -match '^(https?://[^/]+)') {
                $detectedUrl = $matches[1]
            }
        }
        
        if ($detectedUrl) {
            $CoreServiceUrl = $detectedUrl
            Write-Host "Detected Core Service URL: $CoreServiceUrl" -ForegroundColor Green
        } else {
            # Fallback: try common IPs
            $testUrls = @("http://192.168.11.56:5000", "http://127.0.0.1:5000")
            foreach ($url in $testUrls) {
                try {
                    $null = Invoke-RestMethod -Uri "$url/api/agent/version" -TimeoutSec 2 -ErrorAction Stop
                    $CoreServiceUrl = $url
                    Write-Host "Found Core Service at: $CoreServiceUrl" -ForegroundColor Green
                    break
                } catch { }
            }
            
            if (-not $CoreServiceUrl) {
                $CoreServiceUrl = Read-Host "Enter Core Service URL (e.g., http://192.168.11.56:5000)"
            }
        }
    } catch {
        $CoreServiceUrl = Read-Host "Enter Core Service URL (e.g., http://192.168.11.56:5000)"
    }
}

Write-Host ""
Write-Host "=== OrbisAgent Quick Installer ===" -ForegroundColor Cyan
Write-Host "Core Service: $CoreServiceUrl" -ForegroundColor White
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "[ERROR] This installer must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "  1. Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "  2. Run this command again:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "     irm $CoreServiceUrl/api/agent/download/bootstrap | iex" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Test Core Service connectivity
Write-Host "[1/5] Testing Core Service connectivity..." -ForegroundColor Green
try {
    $testUrl = "$CoreServiceUrl/health"
    $response = Invoke-RestMethod -Uri $testUrl -Method Get -TimeoutSec 5 -ErrorAction Stop
    Write-Host "      [OK] Core Service is reachable (v$($response.version))" -ForegroundColor Green
} catch {
    Write-Host "      [FAIL] Cannot reach Core Service at $CoreServiceUrl" -ForegroundColor Red
    Write-Host "      Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please verify:" -ForegroundColor Yellow
    Write-Host "  - Core Service is running" -ForegroundColor Yellow
    Write-Host "  - URL is correct" -ForegroundColor Yellow
    Write-Host "  - Firewall allows connection" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Create installation directory
Write-Host ""
Write-Host "[2/5] Creating installation directory..." -ForegroundColor Green
if (-not (Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    Write-Host "      Created: $InstallPath" -ForegroundColor Gray
} else {
    Write-Host "      Using existing: $InstallPath" -ForegroundColor Gray
}

# Download agent script
Write-Host ""
Write-Host "[3/5] Downloading OrbisAgent.ps1..." -ForegroundColor Green
try {
    $agentPath = Join-Path $InstallPath "OrbisAgent.ps1"
    Invoke-WebRequest -Uri "$CoreServiceUrl/api/agent/download" -OutFile $agentPath -UseBasicParsing
    $fileSize = (Get-Item $agentPath).Length
    Write-Host "      Downloaded: $fileSize bytes" -ForegroundColor Gray
} catch {
    Write-Host "      [FAIL] Failed to download agent: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Create service wrapper
Write-Host ""
Write-Host "[4/5] Creating service wrapper..." -ForegroundColor Green
$serviceWrapperPath = Join-Path $InstallPath "OrbisAgent-Service.ps1"
$wrapperScript = @"
# OrbisAgent Service Wrapper
`$ErrorActionPreference = 'Continue'
`$CoreServiceUrl = '$CoreServiceUrl'
Set-Location -Path '$InstallPath'
& '.\OrbisAgent.ps1' -CoreServiceUrl `$CoreServiceUrl
"@
Set-Content -Path $serviceWrapperPath -Value $wrapperScript -Force
Write-Host "      Created service wrapper" -ForegroundColor Gray

# Install as scheduled task
Write-Host ""
Write-Host "[5/5] Installing as Windows Scheduled Task..." -ForegroundColor Green

$taskName = "OrbisAgent"

# Remove existing task if present
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "      Removing existing task..." -ForegroundColor Gray
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create scheduled task components
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$serviceWrapperPath`""

$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365) `
    -RunOnlyIfNetworkAvailable:$false

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register and start task
Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "OrbisHub PowerShell Agent - Executes jobs from OrbisHub Core Service" | Out-Null

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

# Verify installation
$taskInfo = Get-ScheduledTask -TaskName $taskName
if ($taskInfo.State -eq 'Running') {
    Write-Host "      [OK] Task created and started" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "[SUCCESS] OrbisAgent Installed!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Details:" -ForegroundColor White
    Write-Host "  Task Name:     $taskName" -ForegroundColor Gray
    Write-Host "  Status:        Running" -ForegroundColor Green
    Write-Host "  Run As:        SYSTEM (Admin)" -ForegroundColor Gray
    Write-Host "  Auto-Start:    Yes (at boot)" -ForegroundColor Gray
    Write-Host "  Core Service:  $CoreServiceUrl" -ForegroundColor Gray
    Write-Host "  Install Path:  $InstallPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Management:" -ForegroundColor White
    Write-Host "  Stop:     Stop-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host "  Start:    Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host "  Status:   Get-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host "  Logs:     Get-Content '$InstallPath\OrbisAgent.log' -Tail 50" -ForegroundColor Gray
    Write-Host "  Uninstall: irm $CoreServiceUrl/api/agent/download/uninstaller | iex" -ForegroundColor Gray
    Write-Host ""
    Write-Host "The agent will now send heartbeats and execute jobs from OrbisHub." -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "      [WARN] Task created but not running" -ForegroundColor Yellow
    Write-Host "      Check Task Scheduler for details" -ForegroundColor Yellow
}
