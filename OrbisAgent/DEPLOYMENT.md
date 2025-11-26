# OrbisAgent Deployment System

## Overview
The OrbisAgent deployment system allows you to remotely install and manage PowerShell agents on Windows machines from your OrbisHub server.

## Components

### Server-Side (OrbisHub Core Service)
- **AgentDownloadController** - Serves agent scripts via HTTP endpoints
- **AgentsController** - Manages agent registration and heartbeats
- **JobsController** - Handles job creation and execution

### Client-Side (Target Windows PCs)
- **OrbisAgent.ps1** - Main agent script that communicates with Core Service
- **Install-OrbisAgent.ps1** - Installs agent as Windows Scheduled Task
- **OrbisAgent-Bootstrap.ps1** - One-liner installer for quick deployment
- **Uninstall-OrbisAgent.ps1** - Removes agent from system

## Download Endpoints

All agent files can be downloaded from the Core Service:

| Endpoint | File | Purpose |
|----------|------|---------|
| `/api/agent/download` | OrbisAgent.ps1 | Main agent script |
| `/api/agent/download/installer` | Install-OrbisAgent.ps1 | Installation script |
| `/api/agent/download/bootstrap` | OrbisAgent-Bootstrap.ps1 | Quick installer |
| `/api/agent/download/uninstaller` | Uninstall-OrbisAgent.ps1 | Removal script |
| `/api/agent/install-guide` | JSON | Installation instructions |
| `/api/agent/version` | JSON | Agent version info |

## Deployment Methods

### Method 1: Quick Install (Recommended)

On the target PC, run as Administrator:

```powershell
irm http://YOUR_SERVER_IP:5000/api/agent/download/bootstrap | iex
```

**What this does:**
1. Downloads the bootstrap script from your server
2. Executes it immediately
3. Downloads OrbisAgent.ps1
4. Installs as Windows Scheduled Task
5. Starts the agent
6. Configures auto-start on boot

**Requirements:**
- PowerShell 5.1 or higher
- Administrator privileges
- Network access to Core Service

### Method 2: Manual Installation

Step 1: Download the installer
```powershell
Invoke-WebRequest -Uri 'http://YOUR_SERVER_IP:5000/api/agent/download/installer' -OutFile 'Install-OrbisAgent.ps1'
```

Step 2: Run the installer
```powershell
.\Install-OrbisAgent.ps1 -CoreServiceUrl 'http://YOUR_SERVER_IP:5000'
```

### Method 3: Manual Agent Execution (Testing Only)

For testing without installing as a service:

```powershell
Invoke-WebRequest -Uri 'http://YOUR_SERVER_IP:5000/api/agent/download' -OutFile 'OrbisAgent.ps1'
.\OrbisAgent.ps1 -CoreServiceUrl 'http://YOUR_SERVER_IP:5000'
```

**Note:** This method requires the PowerShell window to stay open and will NOT survive reboots.

## Installation Details

When installed via bootstrap or installer:

- **Location:** `C:\Program Files\OrbisAgent\`
- **Service Type:** Windows Scheduled Task
- **Runs As:** SYSTEM (with administrator privileges)
- **Auto-Start:** Yes (triggers at system startup)
- **Auto-Restart:** Yes (restarts on failure, up to 999 times)
- **Heartbeat Interval:** 30 seconds
- **Job Poll Interval:** 5 seconds

## Agent Behavior

### After Installation
1. Agent registers with Core Service (or re-registers if already known)
2. Sends heartbeat every 30 seconds with system metrics:
   - CPU usage
   - Memory usage
   - Disk usage
   - System uptime
3. Polls for jobs every 5 seconds
4. Executes jobs and reports results back to Core Service

### After PC Restart
1. Scheduled Task triggers automatically at startup
2. Agent starts within seconds of Windows boot
3. Registers/re-registers with Core Service
4. Resumes normal operation (heartbeats + job polling)

### After Agent Crash
1. Windows automatically restarts the task (1-minute interval)
2. Agent re-registers with Core Service
3. Resumes operation

## Management Commands

### Check Agent Status
```powershell
Get-ScheduledTask -TaskName "OrbisAgent"
```

### Stop Agent
```powershell
Stop-ScheduledTask -TaskName "OrbisAgent"
```

### Start Agent
```powershell
Start-ScheduledTask -TaskName "OrbisAgent"
```

### View Logs
```powershell
Get-Content "C:\Program Files\OrbisAgent\OrbisAgent.log" -Tail 50
```

### Uninstall Agent
```powershell
irm http://YOUR_SERVER_IP:5000/api/agent/download/uninstaller | iex
```

Or manually:
```powershell
Unregister-ScheduledTask -TaskName "OrbisAgent" -Confirm:$false
Remove-Item "C:\Program Files\OrbisAgent" -Recurse -Force
```

## Testing

### Test Agent Download Endpoints
```powershell
cd OrbisAgent
.\Test-Downloads.ps1
```

### Test Agent Functionality
```powershell
cd OrbisAgent
.\Test-Agent.ps1
```

## Troubleshooting

### Agent Not Appearing in Dashboard
1. Check Core Service is running: Test with browser at `http://SERVER_IP:5000/api/agents`
2. Check agent is running: `Get-ScheduledTask -TaskName "OrbisAgent"`
3. Check agent logs: `Get-Content "C:\Program Files\OrbisAgent\OrbisAgent.log" -Tail 50`
4. Check firewall: Ensure port 5000 is accessible
5. Check network: Ping server from agent PC

### Agent Stops After Reboot
- Verify scheduled task exists: `Get-ScheduledTask -TaskName "OrbisAgent"`
- Check task trigger: Should show "At system startup"
- Check task user: Should show "SYSTEM"
- Manually start task: `Start-ScheduledTask -TaskName "OrbisAgent"`

### Downloads Fail with 404
- Core Service may need restart to load new endpoints
- Verify Core Service is running on correct port
- Check file paths in AgentDownloadController match actual file locations

### Bootstrap Script Fails
- Ensure running as Administrator
- Check PowerShell execution policy: `Set-ExecutionPolicy Bypass -Scope Process`
- Verify Core Service URL is correct
- Check network connectivity

## Security Considerations

- Agent runs as SYSTEM with administrator privileges
- Can execute any PowerShell command sent from Core Service
- Ensure Core Service is secured (authentication, HTTPS in production)
- Only deploy agents to trusted networks
- Consider using HTTPS and API authentication for production deployments

## Next Steps

1. Restart Core Service to load new download endpoints
2. Test downloads with `Test-Downloads.ps1`
3. Deploy to test machine using bootstrap method
4. Verify agent appears in OrbisHub UI
5. Test job execution
6. Deploy to production machines
