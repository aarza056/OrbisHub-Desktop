# Quick Start Guide - OrbisHub Core Service Installer

Get the Core Service installed in 5 minutes.

## Step 1: Prerequisites

Install WiX Toolset (one-time setup):

```powershell
# Using Chocolatey
choco install wixtoolset

# Or download from:
# https://github.com/wixtoolset/wix3/releases
```

## Step 2: Build the Installer

```powershell
cd OrbisHub.CoreService\Installer
.\Build-Installer.ps1
```

Output: `.\bin\OrbisHubCoreService-1.0.0.0.msi`

## Step 3: Install

### Option A: Interactive (Recommended for First Install)

```powershell
msiexec /i ".\bin\OrbisHubCoreService-1.0.0.0.msi"
```

1. Click **Next** through the welcome screen
2. Configure your settings:
   - SQL Server: `localhost` (or your server)
   - Database: `OrbisHub`
   - Authentication: Windows Auth or SQL Auth
   - Port: `5000`
3. Click **Next** → **Install**
4. Wait for completion

### Option B: Silent Install

```powershell
msiexec /i ".\bin\OrbisHubCoreService-1.0.0.0.msi" /qn
```

Uses default settings (localhost, Windows Auth, port 5000).

## Step 4: Verify Installation

```powershell
# Check service is running
Get-Service OrbisHubCoreService

# Test the API
Invoke-RestMethod http://localhost:5000/health
```

Expected output:
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

## Common Configurations

### Remote SQL Server

```powershell
msiexec /i ".\bin\OrbisHubCoreService-1.0.0.0.msi" /qn `
  SQLSERVER=sqlserver.company.com `
  DATABASE=OrbisHub
```

### SQL Authentication

```powershell
msiexec /i ".\bin\OrbisHubCoreService-1.0.0.0.msi" /qn `
  SQLSERVER=localhost `
  DATABASE=OrbisHub `
  USEWINDOWSAUTH=0 `
  SQLUSER=sa `
  SQLPASSWORD=YourPassword
```

### Custom Port

```powershell
msiexec /i ".\bin\OrbisHubCoreService-1.0.0.0.msi" /qn `
  SERVICEPORT=8080
```

## Troubleshooting

### Service Won't Start

Check the logs:
```powershell
Get-Content "C:\Program Files\OrbisHub\CoreService\Logs\*.log" -Tail 50
```

### Can't Connect to Database

1. Verify SQL Server is running
2. Test connection:
   ```powershell
   Test-NetConnection localhost -Port 1433
   ```
3. Check credentials in `C:\Program Files\OrbisHub\CoreService\appsettings.json`

### API Not Accessible

Check firewall:
```powershell
Get-NetFirewallRule -DisplayName "OrbisHub Core Service*"
```

## Uninstall

```powershell
msiexec /x ".\bin\OrbisHubCoreService-1.0.0.0.msi" /qn
```

Or via **Control Panel** → **Programs and Features**

## Next Steps

1. **Configure Agents**: Install OrbisAgent on target machines
2. **Create Jobs**: Use the Desktop client or API to create jobs
3. **Monitor**: Check logs and service status regularly

For detailed documentation, see [README.md](README.md)
