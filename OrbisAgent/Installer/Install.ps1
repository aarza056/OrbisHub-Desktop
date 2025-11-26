# Install OrbisAgent from MSI
# Run this script to properly install the agent

param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$msiPath = Join-Path $PSScriptRoot "bin\OrbisAgent-1.0.0.0.msi"

if (-not (Test-Path $msiPath)) {
    Write-Host "ERROR: MSI not found at: $msiPath" -ForegroundColor Red
    Write-Host "Run Build-Installer.ps1 first to create the MSI." -ForegroundColor Yellow
    exit 1
}

# Get full path (required for msiexec)
$msiFullPath = (Resolve-Path $msiPath).Path

if ($Uninstall) {
    Write-Host "Uninstalling OrbisAgent..." -ForegroundColor Yellow
    
    # Find installed product
    $product = Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -eq "OrbisAgent" }
    
    if ($product) {
        Write-Host "Found OrbisAgent: $($product.IdentifyingNumber)" -ForegroundColor Cyan
        $productCode = $product.IdentifyingNumber
        
        # Uninstall
        Start-Process msiexec.exe -ArgumentList "/x `"$productCode`" /qn /norestart" -Wait -NoNewWindow
        
        Write-Host "OrbisAgent uninstalled successfully." -ForegroundColor Green
    } else {
        Write-Host "OrbisAgent is not installed." -ForegroundColor Yellow
    }
} else {
    Write-Host "Installing OrbisAgent..." -ForegroundColor Yellow
    Write-Host "MSI Path: $msiFullPath" -ForegroundColor Cyan
    
    # Install with UI
    Start-Process msiexec.exe -ArgumentList "/i `"$msiFullPath`" /qb /norestart" -Wait -NoNewWindow
    
    Write-Host ""
    Write-Host "Installation complete!" -ForegroundColor Green
    Write-Host ""
    
    # Check if scheduled task was created
    $task = Get-ScheduledTask -TaskName "OrbisAgent" -ErrorAction SilentlyContinue
    
    if ($task) {
        Write-Host "[OK] Scheduled task created: $($task.State)" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Scheduled task was NOT created!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Creating scheduled task manually..." -ForegroundColor Yellow
        
        $installPath = "C:\Program Files (x86)\OrbisAgent"
        $scriptPath = Join-Path $installPath "OrbisAgent-Service.ps1"
        
        if (Test-Path $scriptPath) {
            try {
                $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
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
                    -TaskName 'OrbisAgent' `
                    -Action $action `
                    -Trigger $trigger `
                    -Settings $settings `
                    -Principal $principal `
                    -Description 'OrbisHub PowerShell Agent' `
                    -Force | Out-Null
                
                # Start the task
                Start-ScheduledTask -TaskName 'OrbisAgent'
                
                Write-Host "[OK] Scheduled task created and started!" -ForegroundColor Green
            } catch {
                Write-Host "[ERROR] Failed to create scheduled task: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "[ERROR] Agent script not found at: $scriptPath" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "Agent installation details:" -ForegroundColor Cyan
    Write-Host "  Installation: C:\Program Files (x86)\OrbisAgent" -ForegroundColor White
    Write-Host "  Logs:         C:\Program Files (x86)\OrbisAgent\Logs" -ForegroundColor White
    Write-Host "  Task Name:    OrbisAgent" -ForegroundColor White
    Write-Host ""
}
