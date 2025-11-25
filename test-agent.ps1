# Test agent execution script
Write-Host "Starting test agent..." -ForegroundColor Cyan

# Run the agent from workspace
cd "C:\Users\Ashot\Documents\GitHub\OrbisHub-Desktop\OrbisAgent"
.\OrbisAgent.ps1 -CoreServiceUrl "http://127.0.0.1:5000"
