# OrbisAgent Module

**Remote machine monitoring and script execution system for OrbisHub**

## Overview

The OrbisAgent module enables OrbisHub to monitor and manage remote machines through lightweight agent software. Agents can collect system metrics, execute scripts, and report results back to the central OrbisHub server.

## Architecture

### Components

1. **agent-api.js** - Backend API for agent management
   - Agent registration and management
   - Job creation and tracking
   - Metrics storage and retrieval

2. **agent-ui.js** - Frontend UI components
   - Agent dashboard rendering
   - Job execution interface
   - Metrics visualization

3. **agent-schema.sql** - Database schema
   - Agents table
   - AgentJobs table
   - AgentMetrics table

4. **agent-client.ps1** - PowerShell agent client
   - Runs on remote Windows machines
   - Polls for jobs and executes them
   - Reports metrics and results

## Database Schema

### Agents Table
```sql
- id: Unique agent identifier
- machineName: Computer name
- ipAddress: Network address
- os: Operating system info
- version: Agent version
- status: online/offline/error/idle
- lastHeartbeat: Last communication timestamp
- metadata: JSON with system metrics
- created_at: Registration timestamp
- serverId: Optional link to Servers table
```

### AgentJobs Table
```sql
- id: Unique job identifier
- agentId: Target agent
- type: script/command/monitor/update
- script: Script or command to execute
- status: pending/running/completed/failed
- result: Execution output/logs
- createdAt: Job creation time
- startedAt: Execution start time
- completedAt: Execution completion time
- createdBy: User who created the job
```

### AgentMetrics Table
```sql
- id: Metric record ID
- agentId: Agent identifier
- timestamp: Metric collection time
- cpuPercent: CPU usage percentage
- memoryPercent: Memory usage percentage
- diskPercent: Disk usage percentage
- networkIn: Network bytes received
- networkOut: Network bytes sent
- customMetrics: JSON for extensible metrics
```

## Installation

### 1. Setup Database Schema

Run the SQL schema to create required tables:

```sql
-- Execute in SQL Server Management Studio or via OrbisHub setup
-- File: Functions/OrbisAgent/agent-schema.sql
```

### 2. Add UI to OrbisHub

Include the agent module files in your `index.html`:

```html
<!-- Add before closing </body> tag -->
<script src="../Functions/OrbisAgent/agent-api.js"></script>
<script src="../Functions/OrbisAgent/agent-ui.js"></script>
```

Add the Agents navigation tab and view container in your main UI.

### 3. Deploy Agent to Remote Machines

#### PowerShell Agent (Windows)

1. Copy `agent-client.ps1` to the remote machine
2. Run as administrator:

```powershell
# One-time execution
.\agent-client.ps1 -HubUrl "http://orbishub-server:3000"

# Or install as a service (requires NSSM or similar)
# See deployment guide below
```

#### Parameters:
- `-HubUrl`: OrbisHub server URL (required)
- `-AgentId`: Unique identifier (default: computer name)
- `-PollInterval`: Seconds between job polls (default: 30)
- `-MetricsInterval`: Seconds between metric reports (default: 60)

## Usage

### Viewing Agents

1. Navigate to **Agents** tab in OrbisHub
2. View all connected agents with real-time status
3. See system metrics (CPU, Memory, Disk usage)
4. Check last heartbeat timestamp

### Running Jobs on Agents

1. Click **Run Job** on any agent card
2. Select job type:
   - **Script**: PowerShell script block
   - **Command**: Single command execution
3. Enter script/command content
4. Click **Submit**
5. Monitor job status in agent details

### Agent Details

Click **View Details** to see:
- Full agent information
- Recent job history
- Metrics over time
- Connection status

## API Reference

### Agent Registration
```javascript
await AgentAPI.registerAgent({
    id: 'AGENT-001',
    machineName: 'WEB-SERVER-01',
    os: 'Windows Server 2022',
    ipAddress: '192.168.1.100',
    version: '1.0.0',
    metadata: { cpuPercent: 45.2, memoryPercent: 62.8 }
})
```

### Create Job
```javascript
await AgentAPI.createJob({
    agentId: 'AGENT-001',
    type: 'script',
    script: 'Get-Service | Where-Object {$_.Status -eq "Running"}',
    createdBy: 'admin'
})
```

### Get Agent Metrics
```javascript
const metrics = await AgentAPI.getAgentMetrics('AGENT-001', 100)
// Returns last 100 metric records
```

## Agent Client Communication Flow

1. **Registration**: Agent registers with Hub on startup
2. **Polling**: Agent polls for jobs every 30 seconds (configurable)
3. **Execution**: Agent executes received jobs locally
4. **Reporting**: Agent posts execution results back to Hub
5. **Heartbeat**: Agent sends metrics every 60 seconds (configurable)

## Security Considerations

⚠️ **Important**: This initial implementation is for internal/trusted networks

### Recommended Enhancements:
- [ ] API key authentication for agents
- [ ] HTTPS/TLS encryption
- [ ] Script signing and validation
- [ ] Agent permission levels
- [ ] Rate limiting
- [ ] Command whitelisting

## Installing Agent as Windows Service

Use NSSM (Non-Sucking Service Manager):

```powershell
# Download NSSM
# https://nssm.cc/download

# Install service
nssm install OrbisAgent "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
nssm set OrbisAgent AppParameters "-ExecutionPolicy Bypass -File C:\OrbisAgent\agent-client.ps1 -HubUrl http://hub:3000"
nssm set OrbisAgent AppDirectory "C:\OrbisAgent"
nssm set OrbisAgent DisplayName "OrbisHub Agent"
nssm set OrbisAgent Description "Remote monitoring agent for OrbisHub"
nssm set OrbisAgent Start SERVICE_AUTO_START

# Start service
nssm start OrbisAgent

# Check status
nssm status OrbisAgent
```

## Troubleshooting

### Agent Not Appearing in Dashboard
- Check network connectivity to OrbisHub server
- Verify HubUrl parameter is correct
- Check firewall rules
- Review agent log file: `%TEMP%\OrbisAgent_[ID].log`

### Jobs Not Executing
- Check agent status (must be "online")
- Verify job syntax is valid PowerShell
- Check agent permissions
- Review job result/error messages

### High CPU/Memory Usage
- Reduce poll frequency (`-PollInterval`)
- Reduce metrics frequency (`-MetricsInterval`)
- Limit concurrent job execution

## Future Enhancements

- [ ] Linux/macOS agent support (Bash/Python)
- [ ] WebSocket real-time communication
- [ ] Agent auto-update mechanism
- [ ] Job scheduling and cron-like execution
- [ ] File transfer capabilities
- [ ] Advanced metrics and alerting
- [ ] Multi-agent job orchestration
- [ ] Agent grouping and tagging

## Support

For issues or questions:
- Check agent logs: `%TEMP%\OrbisAgent_*.log`
- Review OrbisHub audit logs
- Verify database connectivity
- Test network connectivity between agent and hub

---

**Version**: 1.0.0  
**Created**: 2025-11-25  
**Author**: OrbisHub Team
