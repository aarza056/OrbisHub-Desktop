# OrbisAgent MSI Installer

Professional Windows Installer (MSI) package for deploying OrbisAgent as a Windows service with a custom installation UI.

## 📦 What's Included

- **Custom Installation Wizard** - User-friendly GUI for configuration
- **Automatic Service Installation** - Installs OrbisAgent as a scheduled task running as SYSTEM
- **Configuration Dialog** - Set Core Service URL and agent parameters during installation
- **Firewall Configuration** - Automatically configures Windows Firewall rules
- **Start Menu Shortcuts** - Quick access to logs and uninstaller
- **Proper Uninstaller** - Clean removal through Windows Programs & Features

## 🔧 Prerequisites

### For Building the MSI:
1. **WiX Toolset 3.11 or later**
   - Download: https://github.com/wixtoolset/wix3/releases
   - Or install via Chocolatey: `choco install wixtoolset`

2. **.NET Framework 3.5+** (usually pre-installed on Windows)

### For Running the Installer:
- Windows 7/Server 2008 R2 or later
- Administrator privileges
- PowerShell 5.1 or later

## 🚀 Building the MSI

### Quick Build
```powershell
cd OrbisAgent\Installer
.\Build-Installer.ps1
```

### Custom Version
```powershell
.\Build-Installer.ps1 -Version "1.2.3.0"
```

### Clean Build
```powershell
.\Build-Installer.ps1 -Clean
```

### Custom Output Directory
```powershell
.\Build-Installer.ps1 -OutputDir "C:\Releases"
```

## 📥 Installation

### Interactive Installation (Recommended)
Double-click the MSI file or run:
```powershell
msiexec /i OrbisAgent-1.0.0.0.msi
```

The installation wizard will guide you through:
1. **Welcome Screen** - Introduction
2. **Configuration** - Enter Core Service URL and Agent ID
3. **Installation Directory** - Choose install location (default: C:\Program Files\OrbisAgent)
4. **Confirmation** - Review settings
5. **Progress** - Watch installation progress
6. **Completion** - Installation success

### Silent Installation
```powershell
msiexec /i OrbisAgent-1.0.0.0.msi /qn CORESERVICEURL="http://192.168.1.100:5000" AGENTID="Server01"
```

### Installation with Logging
```powershell
msiexec /i OrbisAgent-1.0.0.0.msi /l*v install.log
```

### Command-Line Parameters
| Parameter | Description | Default |
|-----------|-------------|---------|
| `CORESERVICEURL` | URL of OrbisHub Core Service | http://127.0.0.1:5000 |
| `AGENTID` | Unique identifier for this agent | Computer name |
| `POLLINTERVAL` | Seconds between job polls | 30 |
| `METRICSINTERVAL` | Seconds between metric reports | 60 |
| `INSTALLFOLDER` | Installation directory | C:\Program Files\OrbisAgent |

### Example: Complete Silent Install
```powershell
msiexec /i OrbisAgent-1.0.0.0.msi /qn `
  CORESERVICEURL="http://10.0.1.50:5000" `
  AGENTID="WebServer-01" `
  POLLINTERVAL="20" `
  METRICSINTERVAL="45" `
  INSTALLFOLDER="D:\Apps\OrbisAgent"
```

## 🔄 Upgrading

The MSI automatically handles upgrades:
```powershell
msiexec /i OrbisAgent-1.1.0.0.msi
```

- Stops the existing service
- Updates files
- Preserves configuration
- Restarts service

## 🗑️ Uninstallation

### Using Windows Settings
1. Open **Settings** > **Apps** > **Apps & features**
2. Find **OrbisAgent**
3. Click **Uninstall**

### Using Control Panel
1. Open **Control Panel** > **Programs and Features**
2. Select **OrbisAgent**
3. Click **Uninstall**

### Command Line
```powershell
# Using MSI file
msiexec /x OrbisAgent-1.0.0.0.msi /qn

# Using Product Code (get from registry)
msiexec /x {ProductCode-GUID} /qn
```

### Start Menu Shortcut
Click **Start** > **OrbisAgent** > **Uninstall OrbisAgent**

## 📁 Installation Structure

After installation, the following structure is created:

```
C:\Program Files\OrbisAgent\
├── OrbisAgent.ps1              # Main agent script
├── OrbisAgent-Service.ps1      # Service wrapper
├── config.json                 # Configuration file
└── Logs\                       # Log directory
    └── OrbisAgent.log          # Agent log file
```

### Registry Keys
```
HKLM\SOFTWARE\OrbisHub\OrbisAgent
├── ServiceInstalled = 1
└── Version = "1.0.0.0"

HKCU\Software\OrbisHub\OrbisAgent
├── LogsCreated = 1
└── ShortcutsCreated = 1
```

### Scheduled Task
**Name:** OrbisAgent  
**Trigger:** At system startup  
**User:** SYSTEM  
**Run Level:** Highest (Administrator)

## 🛠️ Customization

### Changing the Icon
Replace `assets\icon.ico2` with your custom icon file.

### Modifying UI Text
Edit `Installer\Localization.wxl` to change dialog text and messages.

### Adding Files
Edit `Product.wxs` and add components to `ProductComponents` ComponentGroup:
```xml
<Component Id="MyFile" Guid="NEW-GUID-HERE">
  <File Id="MyFileId" Source="path\to\file.ext" KeyPath="yes" />
</Component>
```

### Changing Default Configuration
Edit `Installer\config.json` to set different defaults.

### Custom Actions
Add custom installation actions in `CustomActions.wxs`.

## 🐛 Troubleshooting

### Installation Fails
1. **Check Event Viewer**
   - Windows Logs > Application
   - Look for MsiInstaller errors

2. **Enable Logging**
   ```powershell
   msiexec /i OrbisAgent-1.0.0.0.msi /l*v install.log
   ```
   Review `install.log` for details

3. **Verify Permissions**
   - Ensure running as Administrator
   - Check UAC settings

### Service Not Starting
1. **Check Scheduled Task**
   ```powershell
   Get-ScheduledTask -TaskName "OrbisAgent"
   ```

2. **View Logs**
   ```powershell
   Get-Content "C:\Program Files\OrbisAgent\Logs\OrbisAgent.log" -Tail 50
   ```

3. **Manually Start**
   ```powershell
   Start-ScheduledTask -TaskName "OrbisAgent"
   ```

### Connection Issues
1. **Test Core Service**
   ```powershell
   Invoke-RestMethod -Uri "http://your-server:5000/health"
   ```

2. **Check Firewall**
   ```powershell
   Get-NetFirewallRule -DisplayName "*OrbisAgent*"
   ```

3. **Edit Configuration**
   ```powershell
   notepad "C:\Program Files\OrbisAgent\config.json"
   # Restart task after editing
   Restart-ScheduledTask -TaskName "OrbisAgent"
   ```

## 📋 Build Output

The build process creates:
- `bin\OrbisAgent-1.0.0.0.msi` - Installation package
- `obj\*.wixobj` - Compiled object files (can be deleted)
- Build logs (if errors occur)

## 🔐 Security Notes

### What the Installer Does
- Creates scheduled task running as SYSTEM user
- Grants full control over installation directory
- Configures firewall rules for PowerShell
- Writes to HKLM registry

### Production Deployment Recommendations
1. **Code Signing** - Sign the MSI with a trusted certificate
2. **Network Security** - Use HTTPS for Core Service communication
3. **Authentication** - Implement API key authentication
4. **Restricted Execution** - Limit script execution permissions
5. **Audit Logging** - Enable detailed audit trails

## 📝 Version History

### 1.0.0.0 (2025-11-26)
- Initial MSI installer release
- Custom configuration UI
- Scheduled task installation
- Firewall configuration
- Start menu shortcuts

## 🤝 Contributing

To improve the installer:
1. Edit WiX source files (`.wxs`)
2. Test build: `.\Build-Installer.ps1`
3. Test installation in clean VM
4. Test upgrade from previous version
5. Test uninstallation

## 📄 License

Same as OrbisHub Desktop project.

## 🆘 Support

For issues with the installer:
1. Check this README
2. Review build/install logs
3. Open an issue with:
   - Windows version
   - Installation command used
   - Error messages
   - Event Viewer logs

---

**Built with ❤️ using WiX Toolset**
