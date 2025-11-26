# Build OrbisHub Core Service MSI Installer
# Requires WiX Toolset 3.11 or later
# Download from: https://wixtoolset.org/releases/

param(
    [Parameter(Mandatory=$false)]
    [string]$Version = "1.0.0.0",
    
    [Parameter(Mandatory=$false)]
    [string]$Configuration = "Release",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputDir = ".\bin",
    
    [Parameter(Mandatory=$false)]
    [switch]$Clean,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Write-Host "=== OrbisHub Core Service MSI Build Script ===" -ForegroundColor Cyan
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
$projectRoot = Split-Path -Parent $PSScriptRoot
$installerDir = $PSScriptRoot
$projectFile = Join-Path -Path $projectRoot -ChildPath "OrbisHub.CoreService.csproj"
$publishDir = Join-Path -Path $projectRoot -ChildPath "publish"
$objDir = Join-Path -Path $installerDir -ChildPath "obj"
$outputPath = Join-Path -Path $installerDir -ChildPath $OutputDir

# Verify project file exists
if (-not (Test-Path $projectFile)) {
    Write-Host "ERROR: Project file not found: $projectFile" -ForegroundColor Red
    exit 1
}

# Clean if requested
if ($Clean) {
    Write-Host ""
    Write-Host "[CLEAN] Removing build artifacts..." -ForegroundColor Yellow
    if (Test-Path $objDir) { Remove-Item -Path $objDir -Recurse -Force }
    if (Test-Path $outputPath) { Remove-Item -Path $outputPath -Recurse -Force }
    if (Test-Path $publishDir) { Remove-Item -Path $publishDir -Recurse -Force }
}

# Build the .NET project
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "[1/5] Building .NET project..." -ForegroundColor Yellow
    Write-Host "  Configuration: $Configuration" -ForegroundColor White
    Write-Host "  Output: $publishDir" -ForegroundColor White
    
    dotnet publish $projectFile -c $Configuration -o $publishDir --self-contained false
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: .NET build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  [OK] Build complete" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[1/5] Skipping .NET build (using existing publish folder)" -ForegroundColor Yellow
    if (-not (Test-Path $publishDir)) {
        Write-Host "ERROR: Publish folder not found: $publishDir" -ForegroundColor Red
        Write-Host "Remove -SkipBuild flag to build the project first." -ForegroundColor Yellow
        exit 1
    }
}

# Verify published files exist
Write-Host "[2/5] Verifying published files..." -ForegroundColor Yellow
$exeFile = Join-Path -Path $publishDir -ChildPath "OrbisHub.CoreService.exe"
if (-not (Test-Path -Path $exeFile)) {
    Write-Host "ERROR: Executable not found at: $exeFile" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] OrbisHub.CoreService.exe" -ForegroundColor Green

# Create directories
Write-Host "[3/5] Preparing installer directories..." -ForegroundColor Yellow
if (-not (Test-Path $objDir)) { New-Item -ItemType Directory -Path $objDir | Out-Null }
if (-not (Test-Path $outputPath)) { New-Item -ItemType Directory -Path $outputPath | Out-Null }

# Build with candle (compiler)
Write-Host "[4/5] Compiling WiX source files..." -ForegroundColor Yellow

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
        -dConfiguration=$Configuration `
        $wxsFile
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Compilation failed for $fileName.wxs" -ForegroundColor Red
        exit 1
    }
}

Write-Host "  [OK] Compilation complete" -ForegroundColor Green

# Link with light (linker)
Write-Host "[5/5] Linking MSI package..." -ForegroundColor Yellow

$wixobjFiles = Get-ChildItem -Path $objDir -Filter "*.wixobj" | Select-Object -ExpandProperty FullName
$msiFile = Join-Path -Path $outputPath -ChildPath "OrbisHubCoreService-$Version.msi"

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
Write-Host "File size: $([Math]::Round((Get-Item $msiFile).Length / 1MB, 2)) MB" -ForegroundColor White
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

# Show what's next
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Test the installer in a clean environment" -ForegroundColor White
Write-Host "  2. Verify the Windows Service starts correctly" -ForegroundColor White
Write-Host "  3. Check the API endpoint: http://localhost:5000/health" -ForegroundColor White
Write-Host ""
