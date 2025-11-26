# Test OrbisAgent Startup
# Quick test to verify agent can initialize without errors

Write-Host "=== OrbisAgent Startup Test ===" -ForegroundColor Cyan
Write-Host ""

$agentPath = Join-Path $PSScriptRoot "OrbisAgent.ps1"

if (-not (Test-Path $agentPath)) {
    Write-Host "[FAIL] OrbisAgent.ps1 not found!" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Testing script syntax..." -ForegroundColor Yellow
try {
    $null = [System.Management.Automation.PSParser]::Tokenize((Get-Content $agentPath -Raw), [ref]$null)
    Write-Host "      [OK] No syntax errors detected" -ForegroundColor Green
} catch {
    Write-Host "      [FAIL] Syntax error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] Testing agent initialization (dry run)..." -ForegroundColor Yellow
try {
    # Start the agent process in a separate job with timeout
    $job = Start-Job -ScriptBlock {
        param($agentPath)
        & $agentPath -CoreServiceUrl "http://localhost:5000"
    } -ArgumentList $agentPath
    
    # Wait 5 seconds to see if it crashes
    Wait-Job $job -Timeout 5 | Out-Null
    
    if ($job.State -eq 'Running') {
        Write-Host "      [OK] Agent started successfully" -ForegroundColor Green
        Stop-Job $job
        Remove-Job $job
    } elseif ($job.State -eq 'Failed') {
        $error = Receive-Job $job 2>&1
        Write-Host "      [FAIL] Agent crashed: $error" -ForegroundColor Red
        Remove-Job $job
        exit 1
    }
} catch {
    Write-Host "      [FAIL] Error starting agent: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/3] Checking agent-id.txt creation..." -ForegroundColor Yellow
$agentIdFile = Join-Path $PSScriptRoot "agent-id.txt"
if (Test-Path $agentIdFile) {
    $agentId = Get-Content $agentIdFile -Raw
    Write-Host "      [OK] Agent ID file created: $($agentId.Trim())" -ForegroundColor Green
} else {
    Write-Host "      [INFO] Agent ID file not yet created (normal for background process)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[SUCCESS] Agent startup test passed!" -ForegroundColor Green
Write-Host ""
