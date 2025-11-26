# Restart Core Service
# Run this as Administrator to restart the Core Service

Write-Host "Stopping Core Service..." -ForegroundColor Yellow

# Find and stop the process
$process = Get-Process | Where-Object { $_.ProcessName -eq "OrbisHub.CoreService" }
if ($process) {
    Stop-Process -Id $process.Id -Force
    Write-Host "Core Service stopped (PID: $($process.Id))" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "Core Service not running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Starting Core Service..." -ForegroundColor Yellow

# Navigate to Core Service directory
cd "c:\Users\Ashot\Documents\GitHub\OrbisHub-Desktop\OrbisHub.CoreService"

# Start in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'c:\Users\Ashot\Documents\GitHub\OrbisHub-Desktop\OrbisHub.CoreService'; dotnet run"

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[OK] Core Service restarted" -ForegroundColor Green
Write-Host ""
Write-Host "Waiting for service to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Test if service is responding
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/agent/version" -TimeoutSec 5
    Write-Host "[OK] Core Service is responding" -ForegroundColor Green
    Write-Host "Agent Version: $($response.version)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "You can now test downloads with:" -ForegroundColor White
    Write-Host "  .\Test-Downloads.ps1" -ForegroundColor Cyan
} catch {
    Write-Host "[WARN] Service may still be starting..." -ForegroundColor Yellow
    Write-Host "Wait a few seconds and try: .\Test-Downloads.ps1" -ForegroundColor Gray
}

Write-Host ""
