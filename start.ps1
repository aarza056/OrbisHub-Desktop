# Quick Start Script for OrbisHub Desktop

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         OrbisHub Desktop - Installation Script              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "[1/3] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "      ✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "      ✗ Node.js not found!" -ForegroundColor Red
    Write-Host "      Please install Node.js from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "`n[2/3] Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "      ✓ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "      ✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Start app
Write-Host "`n[3/3] Starting OrbisHub Desktop..." -ForegroundColor Yellow
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              Starting Application...                         ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Tips:" -ForegroundColor Cyan
Write-Host "   • App will minimize to system tray" -ForegroundColor White
Write-Host "   • Right-click tray icon to access menu" -ForegroundColor White
Write-Host "   • Press Ctrl+C to stop the app" -ForegroundColor White
Write-Host ""

npm start
