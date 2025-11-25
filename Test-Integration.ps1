# Test OrbisHub Integration
# Tests the complete flow: Core Service, Agent, and Desktop

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "OrbisHub Integration Test" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Core Service Health
Write-Host "[1/4] Testing Core Service..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/health"
    Write-Host "✓ Core Service is healthy" -ForegroundColor Green
    Write-Host "  Version: $($health.version)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Core Service not responding" -ForegroundColor Red
    Write-Host "  Make sure the service is running: Get-Service OrbisHubCoreService" -ForegroundColor Yellow
    exit 1
}

# Test 2: List Agents
Write-Host ""
Write-Host "[2/4] Checking registered agents..." -ForegroundColor Yellow
$agents = $null
try {
    $agents = Invoke-RestMethod -Uri "http://localhost:5000/api/agents"
    if ($agents -and $agents.Count -gt 0) {
        Write-Host "✓ Found $($agents.Count) registered agent(s)" -ForegroundColor Green
        foreach ($agent in $agents) {
            Write-Host "  - $($agent.machineName) ($($agent.agentId))" -ForegroundColor Gray
            $lastSeen = [DateTime]::Parse($agent.lastSeenUtc).ToLocalTime()
            $timeSince = (Get-Date) - $lastSeen
            Write-Host "    Last seen: $($timeSince.TotalSeconds) seconds ago" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "! No agents registered yet" -ForegroundColor Yellow
        Write-Host "  Install an agent: cd OrbisAgent; .\Install-Agent.ps1" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "✗ Failed to retrieve agents" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
}

# Test 3: Create Test Job (if agents exist)
Write-Host ""
Write-Host "[3/4] Creating test job..." -ForegroundColor Yellow
if ($agents -and $agents.Count -gt 0) {
    $agentId = $agents[0].agentId
    
    try {
        $jobPayload = @{
            agentId = $agentId
            type = "RunScript"
            payload = @{
                script = "Get-Date | Out-String"
                shell = "powershell"
            }
        } | ConvertTo-Json -Depth 10
        
        $job = Invoke-RestMethod -Uri "http://localhost:5000/api/jobs/create" `
            -Method Post `
            -Body $jobPayload `
            -ContentType "application/json"
        
        Write-Host "✓ Job created: $($job.jobId)" -ForegroundColor Green
        
        # Wait for job completion
        Write-Host "  Waiting for job to complete..." -ForegroundColor Gray
        $maxWait = 30
        $waited = 0
        $completed = $false
        
        while ($waited -lt $maxWait -and -not $completed) {
            Start-Sleep -Seconds 1
            $waited++
            
            $jobStatus = Invoke-RestMethod -Uri "http://localhost:5000/api/jobs/$($job.jobId)"
            
            if ($jobStatus.status -in @('Succeeded', 'Failed', 'Timeout')) {
                $completed = $true
                Write-Host "  Job $($jobStatus.status.ToLower())" -ForegroundColor $(if ($jobStatus.status -eq 'Succeeded') { 'Green' } else { 'Red' })
                
                if ($jobStatus.output) {
                    Write-Host "  Output:" -ForegroundColor Gray
                    Write-Host "  $($jobStatus.output)" -ForegroundColor Gray
                }
                
                if ($jobStatus.errorMessage) {
                    Write-Host "  Error: $($jobStatus.errorMessage)" -ForegroundColor Red
                }
            }
        }
        
        if (-not $completed) {
            Write-Host "  Job still pending after $maxWait seconds" -ForegroundColor Yellow
        }
        
    }
    catch {
        Write-Host "✗ Failed to create or monitor job" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
    }
}
else {
    Write-Host "⊘ Skipped (no agents available)" -ForegroundColor Yellow
}

# Test 4: Desktop App Check
Write-Host ""
Write-Host "[4/4] Checking Desktop app..." -ForegroundColor Yellow
$desktopPath = Join-Path $PSScriptRoot "app\index.html"
if (Test-Path $desktopPath) {
    Write-Host "✓ Desktop app files found" -ForegroundColor Green
    Write-Host "  Open the app and navigate to 'Agent Management'" -ForegroundColor Gray
}
else {
    Write-Host "✗ Desktop app not found at expected location" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Integration Test Complete" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Open OrbisHub Desktop (npm start)" -ForegroundColor White
Write-Host "2. Navigate to 'Agent Management'" -ForegroundColor White
Write-Host "3. You should see your registered agents" -ForegroundColor White
Write-Host "4. Click on an agent to execute commands" -ForegroundColor White
Write-Host ""
