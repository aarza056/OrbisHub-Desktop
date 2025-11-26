# OrbisAgent README

## Overview

**OrbisAgent** is a PowerShell-based agent that runs on Windows machines and communicates with the OrbisHub Core Service. It registers itself, sends periodic heartbeats, polls for jobs, and executes commands.

## Features

- ✅ Automatic registration with Core Service
- ✅ Persistent agent identity (survives restarts and reinstalls)
- ✅ Periodic heartbeat (every 30 seconds)
- ✅ Job polling (every 5 seconds)
- ✅ Script execution (PowerShell & CMD)
- ✅ System information gathering
- ✅ Process and service management
- ✅ Runs as a scheduled task (auto-start on boot)
- ✅ Comprehensive logging

## Installation

### Quick Install

Run as Administrator:

```powershell
cd OrbisAgent
.\Install-Agent.ps1
```

### Custom Installation

```powershell
.\Install-Agent.ps1 -CoreServiceUrl "http://192.168.1.100:5000" -InstallPath "C:\OrbisAgent"
```

**Parameters:**
- `CoreServiceUrl` - URL of the OrbisHub Core Service (default: http://localhost:5000)
- `InstallPath` - Installation directory (default: C:\Program Files\OrbisAgent)

## Manual Usage

You can also run the agent manually for testing:

```powershell
.\OrbisAgent.ps1 -CoreServiceUrl "http://localhost:5000"
```

**Parameters:**
- `CoreServiceUrl` - Core Service URL
- `HeartbeatIntervalSeconds` - Heartbeat frequency (default: 30)
- `JobPollIntervalSeconds` - Job polling frequency (default: 5)

## Management

### Check Status

```powershell
Get-ScheduledTask -TaskName "OrbisAgent" | Select-Object TaskName, State
```

### View Logs

```powershell
Get-Content "C:\Program Files\OrbisAgent\OrbisAgent.log" -Tail 50 -Wait
```

### Start Agent

```powershell
Start-ScheduledTask -TaskName "OrbisAgent"
```

### Stop Agent

```powershell
Stop-ScheduledTask -TaskName "OrbisAgent"
```

### Restart Agent

```powershell
Stop-ScheduledTask -TaskName "OrbisAgent"
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "OrbisAgent"
```

## Supported Job Types

### 1. RunScript
Executes PowerShell or CMD scripts.

**Payload:**
```json
{
  "script": "Get-Process | Select-Object -First 5",
  "shell": "powershell"
}
```

### 2. GetSystemInfo
Retrieves system information.

**Payload:**
```json
{}
```

**Returns:**
- Computer name
- OS version
- PowerShell version
- Uptime
- Memory
- Processor

### 3. GetProcessList
Lists all running processes.

**Payload:**
```json
{}
```

### 4. GetServiceStatus
Gets status of a specific Windows service.

**Payload:**
```json
{
  "serviceName": "wuauserv"
}
```

## Agent Identity Persistence

The agent uses a persistent identifier to maintain the same identity across restarts and reinstalls. This ensures that:

- **Restarting the PC** won't create a duplicate agent
- **Reinstalling the agent** preserves the same agent record
- **Job history** remains associated with the same machine

### How It Works

1. **First Run**: Agent generates an ID based on the Windows Machine GUID
2. **ID Storage**: The ID is saved to `agent-id.txt` in the installation directory
3. **Subsequent Runs**: Agent reads the stored ID and re-registers with the same identity

### Resetting Agent Identity

To force creation of a new agent identity (e.g., after cloning a VM):

```powershell
# Stop the agent
Stop-ScheduledTask -TaskName "OrbisAgent"

# Delete the stored agent ID
Remove-Item "C:\Program Files\OrbisAgent\agent-id.txt"

# Start the agent (will generate new ID)
Start-ScheduledTask -TaskName "OrbisAgent"
```

## Configuration

The agent configuration is set during installation via the `Install-OrbisAgent.ps1` script parameters.

To change the Core Service URL after installation, edit the service wrapper:

`C:\Program Files\OrbisAgent\OrbisAgent-Service.ps1`

After changing configuration, restart the agent:

```powershell
Restart-ScheduledTask -TaskName "OrbisAgent"
```

## Troubleshooting

### Agent not registering

1. Check Core Service is running:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:5000/health"
   ```

2. Check network connectivity:
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 5000
   ```

3. Review logs:
   ```powershell
   Get-Content "C:\Program Files\OrbisAgent\OrbisAgent.log" -Tail 50
   ```

### Jobs not executing

1. Verify agent is registered:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:5000/api/agents"
   ```

2. Check task is running:
   ```powershell
   Get-ScheduledTask -TaskName "OrbisAgent"
   ```

3. Check for errors in logs

### Uninstall

```powershell
# Stop and remove scheduled task
Stop-ScheduledTask -TaskName "OrbisAgent"
Unregister-ScheduledTask -TaskName "OrbisAgent" -Confirm:$false

# Remove files
Remove-Item -Path "C:\Program Files\OrbisAgent" -Recurse -Force
```

## Security Considerations

1. **Run as SYSTEM** - Agent runs under SYSTEM account for full access
2. **Network access** - Ensure firewall allows outbound connections to Core Service
3. **Script execution** - Agent can execute arbitrary scripts, restrict access to Core Service
4. **HTTPS recommended** - Use HTTPS for production deployments

## Architecture

```
┌─────────────────┐
│   OrbisAgent    │
│   (PowerShell)  │
└────────┬────────┘
         │
         │ 1. Register
         │ 2. Heartbeat (30s)
         │ 3. Poll Jobs (5s)
         │ 4. Report Results
         │
         ▼
┌─────────────────┐
│  OrbisHub Core  │
│     Service     │
└─────────────────┘
```

## Logs

Logs are written to: `C:\Program Files\OrbisAgent\OrbisAgent.log`

**Log levels:**
- `DEBUG` - Detailed diagnostic info
- `INFO` - General information
- `SUCCESS` - Successful operations
- `WARN` - Warning messages
- `ERROR` - Error messages

## Example: Creating a Job from Desktop

```javascript
// In OrbisHub Desktop
const jobData = {
  agentId: "agent-guid-here",
  type: "RunScript",
  payload: {
    script: "Get-Service | Where-Object Status -eq 'Running'",
    shell: "powershell"
  }
};

const response = await fetch('http://localhost:5000/api/jobs/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(jobData)
});
```

## License

[Your License Here]
