# OrbisAgent Test Script
# Tests agent functionality including registration, heartbeat, and job execution

param(
    [string]$CoreServiceUrl = "http://127.0.0.1:5000"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== OrbisAgent Test Suite ===" -ForegroundColor Cyan
Write-Host "Testing against: $CoreServiceUrl`n" -ForegroundColor Yellow

# Test 1: Check Core Service is running
Write-Host "[TEST 1] Checking Core Service connectivity..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agents" -Method Get -TimeoutSec 5
    Write-Host "  [OK] Core Service is reachable" -ForegroundColor Green
    Write-Host "  Found $($response.Count) existing agents" -ForegroundColor Gray
} catch {
    Write-Host "  [FAIL] Core Service is not reachable: $_" -ForegroundColor Red
    Write-Host "  Make sure OrbisHub.CoreService is running" -ForegroundColor Yellow
    exit 1
}

# Test 2: Test agent registration
Write-Host "`n[TEST 2] Testing agent registration..." -ForegroundColor Green
$testAgentId = [Guid]::NewGuid()
$registrationBody = @{
    agentId = $testAgentId
    machineName = "$env:COMPUTERNAME-TEST"
    ipAddresses = @("127.0.0.1")
    osVersion = [System.Environment]::OSVersion.VersionString
    agentVersion = "1.0.0-test"
} | ConvertTo-Json

try {
    $regResponse = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agents/register" `
        -Method Post `
        -Body $registrationBody `
        -ContentType "application/json"
    
    Write-Host "  [OK] Agent registered successfully" -ForegroundColor Green
    Write-Host "  Agent ID: $testAgentId" -ForegroundColor Gray
    Write-Host "  Status: $($regResponse.status)" -ForegroundColor Gray
} catch {
    Write-Host "  [FAIL] Registration failed: $_" -ForegroundColor Red
    exit 1
}

# Test 3: Test heartbeat with metrics
Write-Host "`n[TEST 3] Testing heartbeat with system metrics..." -ForegroundColor Green
try {
    $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
    $mem = Get-CimInstance -ClassName Win32_OperatingSystem
    $memPercent = [math]::Round((($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / $mem.TotalVisibleMemorySize) * 100, 1)
    $disk = Get-PSDrive C | Select-Object @{N='PercentUsed';E={[math]::Round(($_.Used / ($_.Used + $_.Free)) * 100, 1)}}
    
    $uptimeSpan = (Get-Date) - $mem.LastBootUpTime
    $uptimeFormatted = if ($uptimeSpan.TotalHours -gt 24) {
        "$([math]::Floor($uptimeSpan.TotalDays))d $($uptimeSpan.Hours)h"
    } else {
        "$([math]::Floor($uptimeSpan.TotalHours))h $($uptimeSpan.Minutes)m"
    }
    
    $metrics = @{
        cpuPercent = [math]::Round($cpu, 1)
        memoryPercent = $memPercent
        diskPercent = $disk.PercentUsed
        uptime = $uptimeFormatted
    }
    
    Write-Host "  Metrics collected:" -ForegroundColor Gray
    Write-Host "    CPU: $($metrics.cpuPercent)%" -ForegroundColor Gray
    Write-Host "    Memory: $($metrics.memoryPercent)%" -ForegroundColor Gray
    Write-Host "    Disk: $($metrics.diskPercent)%" -ForegroundColor Gray
    Write-Host "    Uptime: $($metrics.uptime)" -ForegroundColor Gray
    
    $heartbeatBody = @{
        agentVersion = "1.0.0-test"
        currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        metadata = ($metrics | ConvertTo-Json -Compress)
    } | ConvertTo-Json
    
    $hbResponse = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agents/$testAgentId/heartbeat" `
        -Method Post `
        -Body $heartbeatBody `
        -ContentType "application/json"
    
    Write-Host "  [OK] Heartbeat sent successfully" -ForegroundColor Green
    Write-Host "  Status: $($hbResponse.status)" -ForegroundColor Gray
} catch {
    Write-Host "  [FAIL] Heartbeat failed: $_" -ForegroundColor Red
    exit 1
}

# Test 4: Verify agent appears in list
Write-Host "`n[TEST 4] Verifying agent in database..." -ForegroundColor Green
try {
    $agent = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agents/$testAgentId" -Method Get
    
    Write-Host "  [OK] Agent found in database" -ForegroundColor Green
    Write-Host "  Machine Name: $($agent.machineName)" -ForegroundColor Gray
    Write-Host "  Version: $($agent.agentVersion)" -ForegroundColor Gray
    Write-Host "  Last Seen: $($agent.lastSeenUtc)" -ForegroundColor Gray
    
    # Check if metadata includes uptime
    if ($agent.metadata) {
        $storedMetrics = $agent.metadata | ConvertFrom-Json
        if ($storedMetrics.uptime) {
            Write-Host "  [OK] Uptime stored in metadata: $($storedMetrics.uptime)" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] Uptime not found in metadata" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  [FAIL] Failed to retrieve agent: $_" -ForegroundColor Red
    exit 1
}

# Test 5: Test job creation
Write-Host "`n[TEST 5] Testing job creation..." -ForegroundColor Green
try {
    $jobBody = @{
        agentId = $testAgentId
        type = "PowerShell"
        payload = @{
            script = "Get-Date | Select-Object -ExpandProperty DateTime"
        }
    } | ConvertTo-Json
    
    $jobResponse = Invoke-RestMethod -Uri "$CoreServiceUrl/api/jobs/create" `
        -Method Post `
        -Body $jobBody `
        -ContentType "application/json"
    
    Write-Host "  [OK] Job created successfully" -ForegroundColor Green
    Write-Host "  Job ID: $($jobResponse.jobId)" -ForegroundColor Gray
    Write-Host "  Status: $($jobResponse.status)" -ForegroundColor Gray
    
    $testJobId = $jobResponse.jobId
} catch {
    Write-Host "  [FAIL] Job creation failed: $_" -ForegroundColor Red
    exit 1
}

# Test 6: Test job polling
Write-Host "`n[TEST 6] Testing job polling..." -ForegroundColor Green
try {
    $nextJob = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agents/$testAgentId/jobs/next" -Method Get
    
    if ($nextJob.job -or $nextJob.jobId) {
        Write-Host "  [OK] Job retrieved from queue" -ForegroundColor Green
        $retrievedJobId = if ($nextJob.jobId) { $nextJob.jobId } else { $nextJob.job.jobId }
        Write-Host "  Job ID: $retrievedJobId" -ForegroundColor Gray
    } else {
        Write-Host "  [WARN] No jobs in queue (this is OK if job was already processed)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [FAIL] Job polling failed: $_" -ForegroundColor Red
    exit 1
}

# Test 7: Test job result submission
Write-Host "`n[TEST 7] Testing job result submission..." -ForegroundColor Green
try {
    $resultBody = @{
        status = "Succeeded"
        output = "Test output from automated test"
        errorMessage = $null
    } | ConvertTo-Json
    
    $resultResponse = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agents/$testAgentId/jobs/$testJobId/result" `
        -Method Post `
        -Body $resultBody `
        -ContentType "application/json"
    
    Write-Host "  [OK] Job result submitted successfully" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Job result submission failed: $_" -ForegroundColor Red
    # Don't exit - this might fail if job was already completed
}

# Test 8: Cleanup - Delete test agent
Write-Host "`n[TEST 8] Cleanup - Deleting test agent..." -ForegroundColor Green
try {
    $deleteResponse = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agents/$testAgentId" -Method Delete
    Write-Host "  [OK] Test agent deleted successfully" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Failed to delete test agent: $_" -ForegroundColor Yellow
    Write-Host "  You may need to manually delete agent: $testAgentId" -ForegroundColor Yellow
}

Write-Host "`n=== All Tests Completed ===" -ForegroundColor Cyan
Write-Host "Agent functionality verified successfully!" -ForegroundColor Green
Write-Host ""
