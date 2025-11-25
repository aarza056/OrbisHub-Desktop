# OrbisHub Core Service - Installation Script
# Run with Administrator privileges

param(
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\OrbisHub\CoreService",
    
    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "OrbisHubCoreService",
    
    [Parameter(Mandatory=$false)]
    [string]$DisplayName = "OrbisHub Core Service",
    
    [Parameter(Mandatory=$false)]
    [string]$SqlServer = "localhost",
    
    [Parameter(Mandatory=$false)]
    [string]$Database = "OrbisHub",
    
    [Parameter(Mandatory=$false)]
    [int]$Port = 5000
)

# Check for admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

Write-Host "OrbisHub Core Service Installation" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build the project
Write-Host "[1/6] Building the project..." -ForegroundColor Yellow
$projectPath = Join-Path $PSScriptRoot "OrbisHub.CoreService.csproj"
if (-not (Test-Path $projectPath)) {
    Write-Error "Project file not found: $projectPath"
    exit 1
}

dotnet publish $projectPath -c Release -o "$PSScriptRoot\publish"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}
Write-Host "Build completed successfully" -ForegroundColor Green

# Step 2: Create installation directory
Write-Host "[2/6] Creating installation directory..." -ForegroundColor Yellow
if (-not (Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

# Copy files
Copy-Item -Path "$PSScriptRoot\publish\*" -Destination $InstallPath -Recurse -Force
Write-Host "Files copied to $InstallPath" -ForegroundColor Green

# Step 3: Configure appsettings.json
Write-Host "[3/6] Configuring settings..." -ForegroundColor Yellow
$settingsPath = Join-Path $InstallPath "appsettings.json"
$settings = Get-Content $settingsPath | ConvertFrom-Json

$settings.OrbisHub.ServiceUrl = "http://0.0.0.0:$Port"
$settings.OrbisHub.ConnectionString = "Server=$SqlServer;Database=$Database;Integrated Security=true;TrustServerCertificate=True;"

$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath
Write-Host "Settings configured" -ForegroundColor Green

# Step 4: Initialize database
Write-Host "[4/6] Initializing database..." -ForegroundColor Yellow
$sqlScript = Join-Path $PSScriptRoot "Database\InitializeSchema.sql"
if (Test-Path $sqlScript) {
    try {
        sqlcmd -S $SqlServer -d $Database -i $sqlScript
        Write-Host "Database initialized successfully" -ForegroundColor Green
    } catch {
        Write-Warning "Database initialization failed. You may need to run the SQL script manually."
        Write-Warning "Script location: $sqlScript"
    }
} else {
    Write-Warning "Database script not found. Please run it manually: $sqlScript"
}

# Step 5: Configure firewall
Write-Host "[5/6] Configuring firewall..." -ForegroundColor Yellow
$ruleName = "OrbisHub Core Service - Port $Port"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Host "Firewall rule already exists" -ForegroundColor Yellow
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "Firewall rule created" -ForegroundColor Green
}

# Step 6: Install and start service
Write-Host "[6/6] Installing Windows Service..." -ForegroundColor Yellow

# Stop and remove existing service if it exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Stopping existing service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force
    sc.exe delete $ServiceName
    Start-Sleep -Seconds 2
}

# Create the service
$binaryPath = Join-Path $InstallPath "OrbisHub.CoreService.exe"
sc.exe create $ServiceName binPath= $binaryPath start= auto
sc.exe description $ServiceName "Central controller for OrbisHub agents and clients"

# Start the service
Write-Host "Starting service..." -ForegroundColor Yellow
Start-Service -Name $ServiceName

# Wait a moment for startup
Start-Sleep -Seconds 3

# Verify service is running
$service = Get-Service -Name $ServiceName
if ($service.Status -eq "Running") {
    Write-Host "Service installed and started successfully!" -ForegroundColor Green
} else {
    Write-Warning "Service installed but not running. Status: $($service.Status)"
    Write-Warning "Check Event Viewer (Application log) for errors"
}

# Test API
Write-Host ""
Write-Host "Testing API endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 5
    Write-Host "API is responding:" -ForegroundColor Green
    Write-Host "  Status: $($response.status)" -ForegroundColor Green
    Write-Host "  Version: $($response.version)" -ForegroundColor Green
} catch {
    Write-Warning "API test failed. The service may still be starting up."
    Write-Warning "Test manually: Invoke-RestMethod -Uri 'http://localhost:$Port/health'"
}

Write-Host ""
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service Name: $ServiceName" -ForegroundColor White
Write-Host "Install Path: $InstallPath" -ForegroundColor White
Write-Host "API URL: http://localhost:$Port" -ForegroundColor White
Write-Host ""
Write-Host "Management Commands:" -ForegroundColor Yellow
Write-Host "  Start:   Start-Service $ServiceName" -ForegroundColor Gray
Write-Host "  Stop:    Stop-Service $ServiceName" -ForegroundColor Gray
Write-Host "  Restart: Restart-Service $ServiceName" -ForegroundColor Gray
Write-Host "  Status:  Get-Service $ServiceName" -ForegroundColor Gray
Write-Host ""
