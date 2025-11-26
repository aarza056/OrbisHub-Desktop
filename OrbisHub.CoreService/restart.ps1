# Quick restart script - run this in the admin PowerShell window where Core Service is running
# Press Ctrl+C in that window, then run this script

Write-Host "Starting Core Service with new code..." -ForegroundColor Green
cd "c:\Users\Ashot\Documents\GitHub\OrbisHub-Desktop\OrbisHub.CoreService"
dotnet run
