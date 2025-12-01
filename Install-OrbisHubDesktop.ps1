# OrbisHub Desktop - Complete Installation Script
# Installs Desktop App, CoreService, and all dependencies
# Run with Administrator privileges

param(
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\OrbisHub",
    
    [Parameter(Mandatory=$false)]
    [string]$SqlServer = "localhost",
    
    [Parameter(Mandatory=$false)]
    [string]$Database = "OrbisHub",
    
    [Parameter(Mandatory=$false)]
    [string]$SqlUser = "usr/orbisadmin",
    
    [Parameter(Mandatory=$false)]
    [string]$SqlPassword = "123456",
    
    [Parameter(Mandatory=$false)]
    [int]$CoreServicePort = 5000,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipDesktopShortcut,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipCoreService
)

# Check for admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

Write-Host @"

╔═══════════════════════════════════════════════╗
║     OrbisHub Desktop - Complete Installer     ║
║              Version 1.4.5                    ║
╚═══════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Get script location
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Installation Source: $scriptRoot" -ForegroundColor Gray
Write-Host "Installation Target: $InstallPath" -ForegroundColor Gray
Write-Host ""

# ==================== PHASE 1: DESKTOP APP ====================
Write-Host "[PHASE 1/4] Installing OrbisHub Desktop Application" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Yellow

$desktopPath = Join-Path $InstallPath "Desktop"
if (-not (Test-Path $desktopPath)) {
    New-Item -ItemType Directory -Path $desktopPath -Force | Out-Null
}

# Copy Desktop app files
Write-Host "  → Copying Desktop application files..." -ForegroundColor White
$filesToCopy = @(
    "main.js",
    "preload.js",
    "package.json",
    "app-main.js",
    "index.html"
)

foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path $scriptRoot $file
    if (Test-Path $sourcePath) {
        Copy-Item -Path $sourcePath -Destination $desktopPath -Force
    } else {
        Write-Warning "    File not found: $file (skipping)"
    }
}

# Copy folders
$folderstoCopy = @(
    "app",
    "assets", 
    "media",
    "Functions",
    "node_modules"
)

foreach ($folder in $folderstoCopy) {
    $sourcePath = Join-Path $scriptRoot $folder
    $destPath = Join-Path $desktopPath $folder
    if (Test-Path $sourcePath) {
        Write-Host "  → Copying $folder..." -ForegroundColor White
        if (Test-Path $destPath) {
            Remove-Item -Path $destPath -Recurse -Force
        }
        Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
    } else {
        Write-Warning "    Folder not found: $folder (skipping)"
    }
}

Write-Host "  ✓ Desktop application installed" -ForegroundColor Green
Write-Host ""

# ==================== PHASE 2: CORE SERVICE ====================
if (-not $SkipCoreService) {
    Write-Host "[PHASE 2/4] Installing OrbisHub Core Service" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Yellow
    
    $coreServiceSource = Join-Path $scriptRoot "OrbisHub.CoreService"
    $coreServicePath = Join-Path $InstallPath "CoreService"
    
    if (Test-Path $coreServiceSource) {
        # Build and publish CoreService
        Write-Host "  → Building CoreService..." -ForegroundColor White
        $projectFile = Join-Path $coreServiceSource "OrbisHub.CoreService.csproj"
        
        if (Test-Path $projectFile) {
            $publishPath = Join-Path $coreServiceSource "publish"
            dotnet publish $projectFile -c Release -o $publishPath | Out-Null
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Build successful" -ForegroundColor Green
                
                # Copy published files
                Write-Host "  → Installing CoreService..." -ForegroundColor White
                if (-not (Test-Path $coreServicePath)) {
                    New-Item -ItemType Directory -Path $coreServicePath -Force | Out-Null
                }
                
                Copy-Item -Path "$publishPath\*" -Destination $coreServicePath -Recurse -Force
                
                # Copy OrbisAgent files
                $agentSourcePath = Join-Path $scriptRoot "OrbisAgent"
                $agentDestPath = Join-Path $coreServicePath "OrbisAgent"
                
                if (Test-Path $agentSourcePath) {
                    Write-Host "  → Copying OrbisAgent files..." -ForegroundColor White
                    if (-not (Test-Path $agentDestPath)) {
                        New-Item -ItemType Directory -Path $agentDestPath -Force | Out-Null
                    }
                    Copy-Item -Path "$agentSourcePath\*.ps1" -Destination $agentDestPath -Force
                    Copy-Item -Path "$agentSourcePath\*.txt" -Destination $agentDestPath -Force -ErrorAction SilentlyContinue
                    Write-Host "  ✓ OrbisAgent files copied" -ForegroundColor Green
                }
                
                # Configure appsettings.json
                Write-Host "  → Configuring service settings..." -ForegroundColor White
                $settingsPath = Join-Path $coreServicePath "appsettings.json"
                $settings = Get-Content $settingsPath | ConvertFrom-Json
                
                $settings.OrbisHub.ServiceUrl = "http://0.0.0.0:$CoreServicePort"
                $settings.OrbisHub.ConnectionString = "Server=$SqlServer;Database=$Database;User Id=$SqlUser;Password=$SqlPassword;TrustServerCertificate=True;"
                
                $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath
                Write-Host "  ✓ Settings configured" -ForegroundColor Green
                
                # Install Windows Service
                Write-Host "  → Installing Windows Service..." -ForegroundColor White
                $serviceName = "OrbisHubCoreService"
                
                # Stop and remove existing service if it exists
                $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
                if ($existingService) {
                    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
                    sc.exe delete $serviceName | Out-Null
                    Start-Sleep -Seconds 2
                }
                
                # Create the service
                $binaryPath = Join-Path $coreServicePath "OrbisHub.CoreService.exe"
                sc.exe create $serviceName binPath= $binaryPath start= auto | Out-Null
                sc.exe description $serviceName "Central controller for OrbisHub agents and clients" | Out-Null
                
                # Configure firewall
                Write-Host "  → Configuring firewall..." -ForegroundColor White
                $ruleName = "OrbisHub Core Service - Port $CoreServicePort"
                $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
                if (-not $existingRule) {
                    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $CoreServicePort -Action Allow | Out-Null
                }
                
                # Start the service
                Write-Host "  → Starting service..." -ForegroundColor White
                Start-Service -Name $serviceName -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 3
                
                $service = Get-Service -Name $serviceName
                if ($service.Status -eq "Running") {
                    Write-Host "  ✓ CoreService installed and running" -ForegroundColor Green
                } else {
                    Write-Warning "    Service installed but not running. Check Event Viewer for errors."
                }
            } else {
                Write-Error "  ✗ Build failed"
            }
        } else {
            Write-Warning "  CoreService project file not found"
        }
    } else {
        Write-Warning "  CoreService source not found at: $coreServiceSource"
    }
    Write-Host ""
} else {
    Write-Host "[PHASE 2/4] Skipping CoreService installation (--SkipCoreService)" -ForegroundColor Gray
    Write-Host ""
}

# ==================== PHASE 3: SHORTCUTS ====================
if (-not $SkipDesktopShortcut) {
    Write-Host "[PHASE 3/4] Creating shortcuts" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Yellow
    
    # Check for Electron executable
    $electronPath = Join-Path $desktopPath "node_modules\.bin\electron.cmd"
    
    if (Test-Path $electronPath) {
        # Create desktop shortcut
        $WshShell = New-Object -comObject WScript.Shell
        $desktopShortcutPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("Desktop"), "OrbisHub Desktop.lnk")
        $Shortcut = $WshShell.CreateShortcut($desktopShortcutPath)
        $Shortcut.TargetPath = "cmd.exe"
        $Shortcut.Arguments = "/c cd /d `"$desktopPath`" && npm start"
        $Shortcut.WorkingDirectory = $desktopPath
        $Shortcut.IconLocation = Join-Path $desktopPath "assets\icon.ico"
        $Shortcut.Description = "OrbisHub Desktop Application"
        $Shortcut.Save()
        
        Write-Host "  ✓ Desktop shortcut created" -ForegroundColor Green
        
        # Create Start Menu shortcut
        $startMenuPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("CommonPrograms"), "OrbisHub Desktop.lnk")
        $Shortcut = $WshShell.CreateShortcut($startMenuPath)
        $Shortcut.TargetPath = "cmd.exe"
        $Shortcut.Arguments = "/c cd /d `"$desktopPath`" && npm start"
        $Shortcut.WorkingDirectory = $desktopPath
        $Shortcut.IconLocation = Join-Path $desktopPath "assets\icon.ico"
        $Shortcut.Description = "OrbisHub Desktop Application"
        $Shortcut.Save()
        
        Write-Host "  ✓ Start Menu shortcut created" -ForegroundColor Green
    } else {
        Write-Warning "  Electron not found. Run 'npm install' in $desktopPath to complete installation."
    }
    Write-Host ""
} else {
    Write-Host "[PHASE 3/4] Skipping shortcuts (--SkipDesktopShortcut)" -ForegroundColor Gray
    Write-Host ""
}

# ==================== PHASE 4: SUMMARY ====================
Write-Host "[PHASE 4/4] Installation Summary" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host ""

Write-Host "✓ Installation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Installation Paths:" -ForegroundColor Cyan
Write-Host "  Desktop App:  $desktopPath" -ForegroundColor White
if (-not $SkipCoreService) {
    Write-Host "  CoreService:  $coreServicePath" -ForegroundColor White
    Write-Host "  OrbisAgent:   $coreServicePath\OrbisAgent" -ForegroundColor White
}
Write-Host ""

if (-not $SkipCoreService) {
    Write-Host "CoreService Information:" -ForegroundColor Cyan
    Write-Host "  Service Name: OrbisHubCoreService" -ForegroundColor White
    Write-Host "  API URL:      http://localhost:$CoreServicePort" -ForegroundColor White
    Write-Host "  Database:     $SqlServer\$Database" -ForegroundColor White
    Write-Host ""
    
    Write-Host "Service Management Commands:" -ForegroundColor Cyan
    Write-Host "  Start:   Start-Service OrbisHubCoreService" -ForegroundColor Gray
    Write-Host "  Stop:    Stop-Service OrbisHubCoreService" -ForegroundColor Gray
    Write-Host "  Restart: Restart-Service OrbisHubCoreService" -ForegroundColor Gray
    Write-Host "  Status:  Get-Service OrbisHubCoreService" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Launch OrbisHub Desktop from the desktop shortcut" -ForegroundColor White
Write-Host "  2. Configure database connection in the app" -ForegroundColor White
Write-Host "  3. Create your first user account" -ForegroundColor White
if (-not $SkipCoreService) {
    Write-Host "  4. Deploy OrbisAgent to remote machines from $coreServicePath\OrbisAgent" -ForegroundColor White
}
Write-Host ""

Write-Host "Documentation:" -ForegroundColor Cyan
Write-Host "  README:       $scriptRoot\README.md" -ForegroundColor White
Write-Host "  CoreService:  $scriptRoot\OrbisHub.CoreService\README.md" -ForegroundColor White
Write-Host "  OrbisAgent:   $scriptRoot\OrbisAgent\README.md" -ForegroundColor White
Write-Host ""

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Installation completed successfully!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
