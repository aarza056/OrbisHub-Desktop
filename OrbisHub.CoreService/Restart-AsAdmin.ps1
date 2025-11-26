# Restart Core Service as Administrator
# This will stop the current service and start a new one

Write-Host "Stopping current Core Service..." -ForegroundColor Yellow
Get-Process -Name "OrbisHub.CoreService" -ErrorAction SilentlyContinue | Stop-Process -Force

Start-Sleep -Seconds 3

Write-Host "Starting Core Service as Administrator..." -ForegroundColor Green
Start-Process powershell -Verb RunAs -ArgumentList "-NoExit", "-Command", "cd 'c:\Users\Ashot\Documents\GitHub\OrbisHub-Desktop\OrbisHub.CoreService'; dotnet run --no-build --configuration Debug"

Write-Host "Core Service should be starting in a new Administrator window..." -ForegroundColor Cyan
Write-Host "Wait 5 seconds, then test with: curl http://192.168.11.56:5000/api/agent/download" -ForegroundColor Cyan
