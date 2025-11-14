# OrbisHub Desktop

**Desktop application for managing Remote Desktop connections**

## Features

✅ **Native RDP Launch** - Direct mstsc.exe launching, no protocol handlers needed
✅ **SQL Server Integration** - Direct database connection from app
✅ **System Tray** - Minimize to tray, always accessible  
✅ **Offline Capable** - Works without web server
✅ **Auto-Updates** - Built-in update mechanism
✅ **Secure Credentials** - Windows Credential Manager integration
✅ **No Browser Required** - Standalone desktop application

## Installation

### Development Mode

```powershell
# Navigate to OrbisDesktop folder
cd D:\OrbisDesktop

# Install dependencies
npm install

# Run in development mode
npm start
```

### Build Installer

```powershell
# Build Windows installer
npm run build:win

# Installer will be in dist/ folder
```

## Project Structure

```
OrbisDesktop/
├── main.js          # Electron main process
├── preload.js       # IPC bridge (secure)
├── package.json     # Dependencies & build config
├── app/
│   ├── index.html   # Main UI (from web version)
│   ├── styles.css   # Styles (from web version)
│   ├── app.js       # Electron adapter
│   └── app-main.js  # Core logic (from web version)
└── assets/
    ├── icon.png     # App icon
    └── tray-icon.png # System tray icon
```

## Configuration

Database configuration is stored in:
```
%APPDATA%\orbis-desktop\db-config.json
```

## Key Differences from Web Version

| Feature | Web Version | Desktop Version |
|---------|-------------|-----------------|
| **RDP Launch** | Protocol handler needed | Direct exec() |
| **Database** | Express server middleware | Direct connection |
| **Deployment** | Node server + browser | Single installer |
| **Updates** | Manual | Auto-update |
| **Tray Icon** | No | Yes |
| **Offline** | No | Yes |

## Security

- ✅ Context isolation enabled
- ✅ Node integration disabled in renderer
- ✅ IPC communication via preload script only
- ✅ Credentials never exposed to renderer process

## Building

The app uses `electron-builder` for packaging:

```json
{
  "build": {
    "appId": "com.orbis.desktop",
    "productName": "OrbisHub Desktop",
    "win": {
      "target": ["nsis"]
    }
  }
}
```

## System Requirements

- Windows 10/11 or Windows Server 2016+
- SQL Server (Express, Standard, or Enterprise)
- .NET Framework 4.7.2+ (for RDP client)

## License

MIT
