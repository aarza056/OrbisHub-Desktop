# Test Agent Download Endpoints
# Verifies all agent download and deployment endpoints work correctly

param(
    [string]$CoreServiceUrl = "http://127.0.0.1:5000"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Agent Download Endpoints Test ===" -ForegroundColor Cyan
Write-Host "Testing: $CoreServiceUrl" -ForegroundColor Yellow
Write-Host ""

$testsPassed = 0
$testsFailed = 0

# Test 1: Download OrbisAgent.ps1
Write-Host "[TEST 1] Download OrbisAgent.ps1..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "$CoreServiceUrl/api/agent/download" -UseBasicParsing
    if ($response.StatusCode -eq 200 -and $response.Content.Length -gt 0) {
        Write-Host "  [OK] Downloaded: $($response.Content.Length) bytes" -ForegroundColor Green
        Write-Host "  Content-Type: $($response.Headers['Content-Type'])" -ForegroundColor Gray
        $testsPassed++
    } else {
        throw "Invalid response"
    }
} catch {
    Write-Host "  [FAIL] $_" -ForegroundColor Red
    $testsFailed++
}

# Test 2: Download Install-OrbisAgent.ps1
Write-Host ""
Write-Host "[TEST 2] Download Install-OrbisAgent.ps1..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "$CoreServiceUrl/api/agent/download/installer" -UseBasicParsing
    if ($response.StatusCode -eq 200 -and $response.Content.Length -gt 0) {
        Write-Host "  [OK] Downloaded: $($response.Content.Length) bytes" -ForegroundColor Green
        $testsPassed++
    } else {
        throw "Invalid response"
    }
} catch {
    Write-Host "  [FAIL] $_" -ForegroundColor Red
    $testsFailed++
}

# Test 3: Download OrbisAgent-Bootstrap.ps1
Write-Host ""
Write-Host "[TEST 3] Download OrbisAgent-Bootstrap.ps1..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "$CoreServiceUrl/api/agent/download/bootstrap" -UseBasicParsing
    if ($response.StatusCode -eq 200 -and $response.Content.Length -gt 0) {
        Write-Host "  [OK] Downloaded: $($response.Content.Length) bytes" -ForegroundColor Green
        $testsPassed++
    } else {
        throw "Invalid response"
    }
} catch {
    Write-Host "  [FAIL] $_" -ForegroundColor Red
    $testsFailed++
}

# Test 4: Download Uninstall-OrbisAgent.ps1
Write-Host ""
Write-Host "[TEST 4] Download Uninstall-OrbisAgent.ps1..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "$CoreServiceUrl/api/agent/download/uninstaller" -UseBasicParsing
    if ($response.StatusCode -eq 200 -and $response.Content.Length -gt 0) {
        Write-Host "  [OK] Downloaded: $($response.Content.Length) bytes" -ForegroundColor Green
        $testsPassed++
    } else {
        throw "Invalid response"
    }
} catch {
    Write-Host "  [FAIL] $_" -ForegroundColor Red
    $testsFailed++
}

# Test 5: Get install guide
Write-Host ""
Write-Host "[TEST 5] Get installation guide..." -ForegroundColor Green
try {
    $guide = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agent/install-guide"
    if ($guide.quickInstall -and $guide.manualInstall -and $guide.uninstall) {
        Write-Host "  [OK] Install guide retrieved" -ForegroundColor Green
        Write-Host "  Quick install command:" -ForegroundColor Gray
        Write-Host "    $($guide.quickInstall.command)" -ForegroundColor Cyan
        $testsPassed++
    } else {
        throw "Invalid guide structure"
    }
} catch {
    Write-Host "  [FAIL] $_" -ForegroundColor Red
    $testsFailed++
}

# Test 6: Get version info
Write-Host ""
Write-Host "[TEST 6] Get agent version info..." -ForegroundColor Green
try {
    $version = Invoke-RestMethod -Uri "$CoreServiceUrl/api/agent/version"
    if ($version.version) {
        Write-Host "  [OK] Version: $($version.version)" -ForegroundColor Green
        Write-Host "  Last Updated: $($version.lastUpdated)" -ForegroundColor Gray
        $testsPassed++
    } else {
        throw "Invalid version response"
    }
} catch {
    Write-Host "  [FAIL] $_" -ForegroundColor Red
    $testsFailed++
}

# Summary
Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor $(if ($testsFailed -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "[SUCCESS] All download endpoints are working!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now deploy agents using:" -ForegroundColor White
    Write-Host "  irm $CoreServiceUrl/api/agent/download/bootstrap | iex" -ForegroundColor Cyan
    Write-Host ""
    exit 0
} else {
    Write-Host "[FAIL] Some tests failed. Check Core Service logs." -ForegroundColor Red
    Write-Host ""
    exit 1
}
