# Test-DesktopIntegration.ps1
# Quick integration test for OrbisHub Desktop <-> Core Service <-> Agent
# Author: OrbisHub Team
# Created: 2025-11-25

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " OrbisHub Desktop Integration Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Core Service Running
Write-Host "[1/5] Checking Core Service..." -ForegroundColor Yellow
try {
    $service = Get-Service -Name "OrbisHubCoreService" -ErrorAction Stop
    if ($service.Status -eq 'Running') {
        Write-Host "  ✓ Core Service is running" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Core Service is not running (Status: $($service.Status))" -ForegroundColor Red
        Write-Host "  → Run: Start-Service OrbisHubCoreService" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "  ✗ Core Service not found" -ForegroundColor Red
    Write-Host "  → Run OrbisHub.CoreService\Install.ps1 first" -ForegroundColor Yellow
    exit 1
}

# Test 2: API Reachable
Write-Host "[2/5] Testing Core Service API..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        $health = $response.Content | ConvertFrom-Json
        Write-Host "  ✓ API is reachable" -ForegroundColor Green
        Write-Host "    Status: $($health.status)" -ForegroundColor Gray
        Write-Host "    Version: $($health.version)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ✗ API not reachable: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 3: Get Agents
Write-Host "[3/5] Fetching agents from API..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/agents" -UseBasicParsing -ErrorAction Stop
    $agents = $response.Content | ConvertFrom-Json
    Write-Host "  ✓ Found $($agents.Count) agent(s)" -ForegroundColor Green
    
    if ($agents.Count -gt 0) {
        foreach ($agent in $agents) {
            $lastHeartbeat = [DateTime]::Parse($agent.lastHeartbeat)
            $minutesAgo = [Math]::Round(((Get-Date) - $lastHeartbeat).TotalMinutes, 1)
            $status = if ($minutesAgo -lt 2) { "ONLINE" } elseif ($minutesAgo -lt 10) { "IDLE" } else { "OFFLINE" }
            $statusColor = if ($status -eq "ONLINE") { "Green" } elseif ($status -eq "IDLE") { "Yellow" } else { "Red" }
            
            Write-Host "    - $($agent.machineName) [$status] (Last seen: $minutesAgo min ago)" -ForegroundColor $statusColor
        }
    } else {
        Write-Host "    ℹ No agents registered yet" -ForegroundColor Gray
        Write-Host "    → Deploy an agent using OrbisAgent.ps1" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ Failed to fetch agents: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 4: Desktop Files
Write-Host "[4/5] Verifying Desktop integration files..." -ForegroundColor Yellow
$files = @(
    "agent-api.js",
    "agent-ui.js",
    "agent-ui.css",
    "agent-modals.html"
)

$allExist = $true
foreach ($file in $files) {
    $path = Join-Path $PSScriptRoot $file
    if (Test-Path $path) {
        Write-Host "  ✓ $file exists" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file missing" -ForegroundColor Red
        $allExist = $false
    }
}

if (-not $allExist) {
    exit 1
}

# Test 5: Test Job Creation
Write-Host "[5/5] Testing job creation..." -ForegroundColor Yellow

if ($agents.Count -gt 0) {
    $testAgent = $agents[0]
    
    $jobPayload = @{
        agentId = $testAgent.id
        type = "GetSystemInfo"
        parameters = @{}
        createdBy = "Integration Test"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest `
            -Uri "http://localhost:5000/api/jobs/create" `
            -Method Post `
            -Body $jobPayload `
            -ContentType "application/json" `
            -UseBasicParsing `
            -ErrorAction Stop
        
        $job = $response.Content | ConvertFrom-Json
        Write-Host "  ✓ Test job created successfully" -ForegroundColor Green
        Write-Host "    Job ID: $($job.jobId)" -ForegroundColor Gray
        Write-Host "    Agent: $($testAgent.machineName)" -ForegroundColor Gray
        Write-Host "    Type: GetSystemInfo" -ForegroundColor Gray
        
        # Wait a bit and check job status
        Start-Sleep -Seconds 3
        
        $statusResponse = Invoke-WebRequest `
            -Uri "http://localhost:5000/api/jobs/$($job.jobId)" `
            -UseBasicParsing `
            -ErrorAction Stop
        
        $jobStatus = $statusResponse.Content | ConvertFrom-Json
        Write-Host "    Status after 3s: $($jobStatus.status)" -ForegroundColor Cyan
        
        if ($jobStatus.status -eq "completed") {
            Write-Host "  ✓ Job completed successfully!" -ForegroundColor Green
        } elseif ($jobStatus.status -eq "running") {
            Write-Host "    ℹ Job is running... (agent is active)" -ForegroundColor Yellow
        } else {
            Write-Host "    ℹ Job status: $($jobStatus.status)" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "  ✗ Failed to create test job: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ⊘ Skipping (no agents available)" -ForegroundColor Gray
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Integration Test Complete ✓" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Open OrbisHub Desktop application" -ForegroundColor White
Write-Host "  2. Navigate to 'Orbis Agents' in the sidebar" -ForegroundColor White
Write-Host "  3. You should see your agent(s) displayed" -ForegroundColor White
Write-Host "  4. Click 'Run Job' to test job execution" -ForegroundColor White
Write-Host "  5. Click 'Deploy Agent' for deployment guide" -ForegroundColor White
Write-Host ""
Write-Host "Core Service API: http://localhost:5000" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:5000/swagger" -ForegroundColor Cyan
Write-Host ""
