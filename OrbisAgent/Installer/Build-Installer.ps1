# Build OrbisAgent MSI Installer
# Requires WiX Toolset 3.11 or later
# Download from: https://wixtoolset.org/releases/

param(
    [Parameter(Mandatory=$false)]
    [string]$Version = "1.0.0.0",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputDir = ".\bin",
    
    [Parameter(Mandatory=$false)]
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "=== OrbisAgent MSI Build Script ===" -ForegroundColor Cyan
Write-Host ""

# Check for WiX Toolset
$wixPath = $null
if ($env:WIX) {
    $wixPath = Join-Path $env:WIX "bin"
}

if (-not $wixPath -or -not (Test-Path $wixPath)) {
    Write-Host "ERROR: WiX Toolset not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install WiX Toolset 3.11 or later:" -ForegroundColor Yellow
    Write-Host "  Download: https://github.com/wixtoolset/wix3/releases" -ForegroundColor White
    Write-Host "  Or use Chocolatey: choco install wixtoolset" -ForegroundColor White
    Write-Host ""
    Write-Host "Expected WIX environment variable to point to WiX installation." -ForegroundColor Yellow
    Write-Host "Current WIX value: $env:WIX" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "[OK] WiX Toolset found at: $wixPath" -ForegroundColor Green

# Set paths
$projectRoot = $PSScriptRoot
$sourceDir = Join-Path -Path $projectRoot -ChildPath ".."
$installerDir = $projectRoot
$objDir = Join-Path -Path $installerDir -ChildPath "obj"
$outputPath = Join-Path -Path $installerDir -ChildPath $OutputDir

# Clean if requested
if ($Clean) {
    Write-Host ""
    Write-Host "[CLEAN] Removing build artifacts..." -ForegroundColor Yellow
    if (Test-Path $objDir) { Remove-Item -Path $objDir -Recurse -Force }
    if (Test-Path $outputPath) { Remove-Item -Path $outputPath -Recurse -Force }
}

# Create directories
Write-Host ""
Write-Host "[1/4] Preparing build directories..." -ForegroundColor Yellow
if (-not (Test-Path $objDir)) { New-Item -ItemType Directory -Path $objDir | Out-Null }
if (-not (Test-Path $outputPath)) { New-Item -ItemType Directory -Path $outputPath | Out-Null }

# Verify source files exist
Write-Host "[2/4] Verifying source files..." -ForegroundColor Yellow
$agentScript = Join-Path -Path $sourceDir -ChildPath "OrbisAgent.ps1"
if (-not (Test-Path -Path $agentScript)) {
    Write-Host "ERROR: OrbisAgent.ps1 not found at: $agentScript" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] OrbisAgent.ps1" -ForegroundColor Green

# Build with candle (compiler)
Write-Host "[3/4] Compiling WiX source files..." -ForegroundColor Yellow

$candleCmd = Join-Path $wixPath "candle.exe"
$lightCmd = Join-Path $wixPath "light.exe"

# Verify executables exist
if (-not (Test-Path $candleCmd)) {
    Write-Host "ERROR: candle.exe not found at: $candleCmd" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $lightCmd)) {
    Write-Host "ERROR: light.exe not found at: $lightCmd" -ForegroundColor Red
    exit 1
}

# Compile all .wxs files
$wxsFiles = @(
    (Join-Path -Path $installerDir -ChildPath "Product.wxs"),
    (Join-Path -Path $installerDir -ChildPath "ConfigurationDlg.wxs")
)

foreach ($wxsFile in $wxsFiles) {
    if (-not (Test-Path -Path $wxsFile)) {
        Write-Host "ERROR: WiX source file not found: $wxsFile" -ForegroundColor Red
        exit 1
    }
    
    $fileName = [System.IO.Path]::GetFileNameWithoutExtension($wxsFile)
    Write-Host "  Compiling $fileName.wxs..." -ForegroundColor White
    
    $wixobjFile = Join-Path -Path $objDir -ChildPath "$fileName.wixobj"
    
    & $candleCmd `
        -out $wixobjFile `
        -ext WixUIExtension `
        -ext WixUtilExtension `
        -dVersion=$Version `
        -dSourceDir=$sourceDir `
        $wxsFile
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Compilation failed for $fileName.wxs" -ForegroundColor Red
        exit 1
    }
}

Write-Host "  [OK] Compilation complete" -ForegroundColor Green

# Link with light (linker)
Write-Host "[4/4] Linking MSI package..." -ForegroundColor Yellow

$wixobjFiles = Get-ChildItem -Path $objDir -Filter "*.wixobj" | Select-Object -ExpandProperty FullName
$msiFile = Join-Path -Path $outputPath -ChildPath "OrbisAgent-$Version.msi"

& $lightCmd `
    -out $msiFile `
    -ext WixUIExtension `
    -ext WixUtilExtension `
    -cultures:en-US `
    -loc (Join-Path -Path $installerDir -ChildPath "Localization.wxl") `
    -sval `
    $wixobjFiles

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Linking failed" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Linking complete" -ForegroundColor Green

# Success!
Write-Host ""
Write-Host "[SUCCESS] MSI installer built successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Output file:" -ForegroundColor Cyan
Write-Host "  $msiFile" -ForegroundColor White
Write-Host ""
Write-Host "File size: $([Math]::Round((Get-Item $msiFile).Length / 1KB, 2)) KB" -ForegroundColor White
Write-Host ""

# Show installation command
Write-Host "To install:" -ForegroundColor Yellow
Write-Host "  msiexec /i ""$msiFile"" /qn" -ForegroundColor Gray
Write-Host ""
Write-Host "To install with UI:" -ForegroundColor Yellow
Write-Host "  msiexec /i ""$msiFile""" -ForegroundColor Gray
Write-Host ""
Write-Host "To uninstall:" -ForegroundColor Yellow
Write-Host "  msiexec /x ""$msiFile"" /qn" -ForegroundColor Gray
Write-Host ""
