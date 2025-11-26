# Quick Start Guide

## Build the MSI Installer

### 1. Install WiX Toolset
```powershell
# Option 1: Download from official site
# https://github.com/wixtoolset/wix3/releases

# Option 2: Install via Chocolatey
choco install wixtoolset
```

### 2. Build the Installer
```powershell
cd OrbisAgent\Installer
.\Build-Installer.ps1
```

### 3. Install OrbisAgent
```powershell
# Interactive installation with UI
msiexec /i .\bin\OrbisAgent-1.0.0.0.msi

# Silent installation
msiexec /i .\bin\OrbisAgent-1.0.0.0.msi /qn CORESERVICEURL="http://your-server:5000"
```

## What Gets Installed

✅ OrbisAgent PowerShell scripts  
✅ Windows scheduled task (runs as SYSTEM)  
✅ Configuration file  
✅ Firewall rules  
✅ Start menu shortcuts  
✅ Automatic startup at boot  

## Default Settings

| Setting | Default Value |
|---------|---------------|
| Install Path | `C:\Program Files\OrbisAgent` |
| Core Service URL | `http://127.0.0.1:5000` |
| Agent ID | Computer name |
| Poll Interval | 30 seconds |
| Metrics Interval | 60 seconds |

## Management Commands

```powershell
# Check service status
Get-ScheduledTask -TaskName "OrbisAgent"

# Start/Stop service
Start-ScheduledTask -TaskName "OrbisAgent"
Stop-ScheduledTask -TaskName "OrbisAgent"

# View logs
Get-Content "C:\Program Files\OrbisAgent\Logs\OrbisAgent.log" -Tail 50 -Wait

# Uninstall
msiexec /x OrbisAgent-1.0.0.0.msi
```

For detailed documentation, see [README.md](README.md)
