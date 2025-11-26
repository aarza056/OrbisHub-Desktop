# OrbisHub Core Service - MSI Installer

This directory contains the WiX Toolset installer project for the OrbisHub Core Service Windows application.

## Prerequisites

1. **WiX Toolset 3.11 or later**
   - Download: https://github.com/wixtoolset/wix3/releases
   - Or install via Chocolatey: `choco install wixtoolset`

2. **.NET 8.0 SDK**
   - Required to build the Core Service project
   - Download: https://dotnet.microsoft.com/download

3. **Administrator Privileges**
   - Required for building and installing Windows Services

## Building the Installer

### Quick Build

```powershell
.\Build-Installer.ps1
```

### Build Options

```powershell
# Specify version
.\Build-Installer.ps1 -Version "1.2.0.0"

# Clean build (removes previous artifacts)
.\Build-Installer.ps1 -Clean

# Skip .NET build (use existing publish folder)
.\Build-Installer.ps1 -SkipBuild

# Custom output directory
.\Build-Installer.ps1 -OutputDir ".\release"

# Release configuration
.\Build-Installer.ps1 -Configuration Release
```

### Build Process

The build script performs the following steps:

1. **Build .NET Project** - Compiles and publishes the Core Service
2. **Verify Files** - Ensures all required files are present
3. **Compile WiX** - Converts .wxs files to .wixobj files
4. **Link MSI** - Creates the final .msi installer package
5. **Output** - Saves to `.\bin\OrbisHubCoreService-{version}.msi`

## Installer Features

### Configuration Dialog

The installer includes a custom configuration dialog that allows setting:

- **SQL Server** - Server name/address (default: localhost)
- **Database Name** - Target database (default: OrbisHub)
- **Authentication Type**:
  - Windows Authentication (default)
  - SQL Server Authentication (requires username/password)
- **Service Port** - HTTP API port (default: 5000)

### Automatic Setup

The installer automatically:

1. ✅ Installs files to `C:\Program Files\OrbisHub\CoreService`
2. ✅ Configures `appsettings.json` with provided settings
3. ✅ Creates Windows Service (`OrbisHubCoreService`)
4. ✅ Configures service to start automatically
5. ✅ Sets service recovery options (auto-restart on failure)
6. ✅ Creates firewall rule for the configured port
7. ✅ Starts the service immediately
8. ✅ Creates Start Menu shortcuts

### Start Menu Shortcuts

- **View Core Service Logs** - Opens the Logs folder
- **Configure Core Service** - Edits appsettings.json
- **Uninstall OrbisHub Core Service** - Removes the application

## Installation

### Interactive Installation

```powershell
msiexec /i "OrbisHubCoreService-1.0.0.0.msi"
```

This displays the configuration dialog where you can customize settings.

### Silent Installation

```powershell
msiexec /i "OrbisHubCoreService-1.0.0.0.msi" /qn `
  SQLSERVER=myserver `
  DATABASE=OrbisHub `
  SERVICEPORT=5000 `
  USEWINDOWSAUTH=1
```

#### Silent Install Parameters

| Property | Description | Default |
|----------|-------------|---------|
| `SQLSERVER` | SQL Server instance | `localhost` |
| `DATABASE` | Database name | `OrbisHub` |
| `SERVICEPORT` | HTTP API port | `5000` |
| `USEWINDOWSAUTH` | Use Windows Auth (1) or SQL Auth (0) | `1` |
| `SQLUSER` | SQL username (if SQL Auth) | - |
| `SQLPASSWORD` | SQL password (if SQL Auth) | - |
| `INSTALLFOLDER` | Installation directory | `C:\Program Files\OrbisHub\CoreService` |

#### Example: SQL Server Authentication

```powershell
msiexec /i "OrbisHubCoreService-1.0.0.0.msi" /qn `
  SQLSERVER=sqlserver.domain.com `
  DATABASE=OrbisHub `
  USEWINDOWSAUTH=0 `
  SQLUSER=orbis_service `
  SQLPASSWORD=SecurePassword123
```

## Uninstallation

### Using MSI File

```powershell
msiexec /x "OrbisHubCoreService-1.0.0.0.msi" /qn
```

### Using Product Code

```powershell
# Find the product
$product = Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -eq "OrbisHub Core Service" }

# Uninstall
msiexec /x $product.IdentifyingNumber /qn
```

### Via Programs and Features

1. Open **Control Panel** → **Programs and Features**
2. Find **OrbisHub Core Service**
3. Click **Uninstall**

### Uninstallation Process

The uninstaller automatically:

1. ✅ Stops the Windows Service
2. ✅ Removes the service registration
3. ✅ Removes firewall rules
4. ✅ Deletes program files
5. ✅ Removes Start Menu shortcuts
6. ✅ Cleans up registry entries

> **Note**: Log files in the `Logs` folder are preserved during uninstallation.

## Verification

After installation, verify the service is running:

```powershell
# Check service status
Get-Service OrbisHubCoreService

# Test API endpoint
Invoke-RestMethod -Uri "http://localhost:5000/health"

# View service logs
Get-Content "C:\Program Files\OrbisHub\CoreService\Logs\*.log" -Tail 20
```

## Troubleshooting

### Service Won't Start

1. Check Windows Event Viewer (Application log)
2. Verify database connectivity:
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 1433
   ```
3. Check the connection string in `appsettings.json`
4. Ensure SQL Server permissions are configured

### Build Errors

**WiX Toolset Not Found**
- Ensure WiX is installed
- Set `WIX` environment variable to WiX installation path
- Restart PowerShell after installation

**.NET Build Failed**
- Ensure .NET 8 SDK is installed
- Clean the project: `dotnet clean`
- Rebuild: `dotnet build`

### Firewall Issues

If the API is not accessible from remote machines:

```powershell
# Check firewall rule
Get-NetFirewallRule -DisplayName "OrbisHub Core Service*"

# Manually create rule if needed
New-NetFirewallRule -DisplayName "OrbisHub Core Service - Port 5000" `
  -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
```

## File Structure

```
Installer/
├── Product.wxs              # Main WiX product definition
├── ConfigurationDlg.wxs     # Custom configuration dialog
├── Localization.wxl         # UI text strings
├── Build-Installer.ps1      # Build script
├── README.md                # This file
├── bin/                     # Output MSI files
└── obj/                     # Intermediate build files
```

## Advanced Topics

### Upgrading

The installer uses a stable `UpgradeCode` GUID to enable upgrades. When installing a newer version:

1. The installer detects the existing version
2. Stops the service
3. Replaces files
4. Preserves configuration
5. Restarts the service

### Custom Actions

The installer includes several custom VBScript actions:

- `BuildConnectionString` - Constructs SQL connection string
- `ConfigureSettings` - Updates appsettings.json
- `InstallWindowsService` - Registers Windows Service
- `StartWindowsService` - Starts the service
- `ConfigureFirewall` - Creates firewall rules
- `StopWindowsService` - Stops service on uninstall
- `UninstallWindowsService` - Removes service
- `RemoveFirewall` - Removes firewall rules

### Debugging Installation

Enable MSI logging:

```powershell
msiexec /i "OrbisHubCoreService-1.0.0.0.msi" /l*v install.log
```

View the log:

```powershell
Get-Content install.log
```

## Support

For issues or questions:
- Check the service logs: `C:\Program Files\OrbisHub\CoreService\Logs`
- Review Windows Event Viewer
- Examine MSI installation logs
- Check GitHub Issues: https://github.com/orbishub

## License

Same license as the OrbisHub Core Service project.
