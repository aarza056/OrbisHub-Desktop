# OrbisHub Desktop - Agent Integration

## Overview

The OrbisHub Desktop client now integrates with **OrbisHub Core Service** for centralized agent management. All agent communication flows through the Core Service API, eliminating the need for direct database access from the Desktop client.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  OrbisHub       │  HTTP   │  OrbisHub Core   │   SQL   │   SQL Server    │
│  Desktop        ├────────►│  Service         ├────────►│   Database      │
│  (Electron)     │         │  (ASP.NET Core)  │         │   (Agents DB)   │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                      ▲
                                      │ HTTP
                                      │
                            ┌─────────┴─────────┐
                            │                   │
                      ┌─────▼──────┐     ┌─────▼──────┐
                      │  OrbisAgent│     │  OrbisAgent│
                      │  (PS Script)     │  (PS Script)
                      │  Machine 1 │     │  Machine 2 │
                      └────────────┘     └────────────┘
```

## Components

### 1. **Core Service** (`OrbisHub.CoreService/`)
- **Location**: `c:\Program Files\OrbisHub\CoreService\`
- **Port**: `http://localhost:5000`
- **Status**: Windows Service running as `OrbisHubCoreService`
- **API Endpoints**:
  - `GET /api/agents` - List all agents
  - `POST /api/agents/register` - Register new agent
  - `POST /api/agents/{id}/heartbeat` - Update heartbeat
  - `GET /api/agents/{id}/jobs/next` - Poll for next job
  - `POST /api/jobs/create` - Create new job
  - `GET /api/jobs/{id}` - Get job status
  - `POST /api/agents/{id}/jobs/{jobId}/result` - Report job result

### 2. **Desktop Integration** (`Functions/OrbisAgent/`)

#### `agent-api.js`
JavaScript API wrapper for Core Service communication:
- Uses `fetch()` for HTTP calls to `http://localhost:5000`
- **Methods**:
  - `getAllAgents()` → GET /api/agents
  - `createJob(jobData)` → POST /api/jobs/create
  - `getJobStatus(jobId)` → GET /api/jobs/{id}
  - `getAgentJobs(agentId)` → GET /api/agents/{id}/jobs
  
#### `agent-ui.js`
UI rendering and interaction logic:
- **Functions**:
  - `renderAgentsDashboard()` - Main dashboard with agent cards
  - `viewAgentDetails(agentId)` - Show agent details modal
  - `runJobOnAgent(agentId)` - Show job creation modal
  - `submitJob()` - Submit job to Core Service
  
#### `agent-ui.css`
Complete styling for agent management UI including:
- Agent cards with status indicators
- Modals (details, job creation, deployment guide)
- Responsive grid layout
- Dark theme optimized

#### `agent-modals.html`
Pre-built modal dialogs:
- Agent Details Modal (`#agentDetailsModal`)
- Run Job Modal (`#runJobModal`)
- Deployment Guide Modal (`#agentDeploymentModal`)

### 3. **PowerShell Agent** (`OrbisAgent.ps1`)
- **Location**: Deployed to remote machines
- **Functionality**:
  - Auto-registers with Core Service
  - Sends heartbeat every 30 seconds
  - Polls for jobs every 5 seconds
  - Executes jobs and reports results
  - Supports: RunScript, GetSystemInfo, GetProcessList, GetServiceStatus

## Desktop UI Integration

### Navigation
- Added "Orbis Agents" button in `System Administrators` section
- Icon: Computer with agent symbol
- View ID: `agents`

### View Structure (`app/index.html`)
```html
<section id="view-agents" class="view">
  <div class="view__header">
    <!-- Toolbar with status counters and refresh button -->
  </div>
  <div class="stack">
    <div id="agentsList">
      <!-- Agent cards rendered here by AgentUI.renderAgentsDashboard() -->
    </div>
  </div>
</section>
```

### Initialization (`app/app-main.js`)
```javascript
case 'agents':
    if (window.AgentUI) {
        window.AgentUI.renderAgentsDashboard();
    }
    break;
```

Auto-refresh every 30 seconds when view is visible.

## Data Flow

### Viewing Agents
1. User clicks "Orbis Agents" nav button
2. `showView('agents')` switches to agents view
3. `AgentUI.renderAgentsDashboard()` called
4. `AgentAPI.getAllAgents()` fetches from Core Service
5. Agent cards rendered with real-time status

### Creating Jobs
1. User clicks "Run Job" on agent card
2. Modal opens via `AgentUI.runJobOnAgent(agentId)`
3. User enters job type and script
4. `AgentUI.submitJob()` → `AgentAPI.createJob()`
5. Core Service stores job as "pending"
6. Agent polls Core Service and picks up job
7. Agent executes and reports result back to Core Service
8. Desktop can query job status via `AgentAPI.getJobStatus(jobId)`

## Configuration

### Core Service URL
Default: `http://localhost:5000`

To change (in `agent-api.js`):
```javascript
AgentAPI.setCoreServiceUrl('http://your-server:5000');
```

### Agent Deployment
Deploy agents to remote machines using:
```powershell
.\agent-client.ps1 -CoreServiceUrl "http://your-hub-server:5000"
```

See deployment guide modal in Desktop app for complete instructions.

## Status Indicators

| Status   | Color  | Condition                          |
|----------|--------|------------------------------------|
| Online   | Green  | Heartbeat < 2 minutes ago          |
| Idle     | Yellow | Heartbeat 2-10 minutes ago         |
| Offline  | Red    | Heartbeat > 10 minutes ago         |

Status determined by Core Service based on `lastHeartbeat` timestamp.

## Testing

### 1. Verify Core Service
```powershell
# Check service status
Get-Service OrbisHubCoreService

# Test API
Invoke-WebRequest -Uri "http://localhost:5000/health"
```

### 2. Verify Desktop Integration
1. Open OrbisHub Desktop
2. Navigate to "Orbis Agents"
3. Should see empty state or existing agents
4. Click "Deploy Agent" for deployment guide

### 3. Deploy Test Agent
```powershell
# On remote machine
.\OrbisAgent.ps1

# Should appear in Desktop within 30 seconds
```

### 4. Test Job Execution
1. Click "Run Job" on agent card
2. Select job type: "Run Script"
3. Enter: `Get-Process | Select-Object -First 5`
4. Submit job
5. Agent should execute and report result

## Troubleshooting

### Agents Not Appearing
- Verify Core Service is running: `Get-Service OrbisHubCoreService`
- Check agent can reach Core Service: `Test-NetConnection localhost -Port 5000`
- Check agent logs in PowerShell console

### Jobs Not Executing
- Verify agent heartbeat is recent (< 2 minutes)
- Check job status via agent details modal
- Agent polls every 5 seconds - wait up to 5 seconds

### UI Not Loading
- Open browser DevTools (F12)
- Check Console for JavaScript errors
- Verify `agent-api.js` and `agent-ui.js` loaded
- Check Network tab for failed API calls

## Security Notes

⚠️ **Current Implementation**: Designed for trusted internal networks only.

**For Production**:
- Implement API key authentication
- Use HTTPS with valid certificates
- Add script validation and sandboxing
- Implement rate limiting
- Add audit logging for all job executions

## File Locations

```
OrbisHub-Desktop/
├── Functions/OrbisAgent/
│   ├── agent-api.js          # Core Service API wrapper
│   ├── agent-ui.js           # UI rendering logic
│   ├── agent-ui.css          # Agent UI styles
│   ├── agent-modals.html     # Modal dialogs
│   ├── agent-client.ps1      # PowerShell agent script
│   └── DESKTOP_INTEGRATION.md # This file
├── app/
│   ├── index.html            # Added agents view section
│   ├── app-main.js           # Added agents case in showView()
│   └── styles.css            # Imports agent-ui.css
└── OrbisHub.CoreService/     # Windows Service (C# .NET 8)
    ├── Program.cs
    ├── Controllers/
    ├── Data/
    └── Services/
```

## Next Steps

- [ ] Implement real-time agent status via SignalR
- [ ] Add agent metrics collection (CPU, Memory, Disk)
- [ ] Implement job scheduling
- [ ] Add job history and logs
- [ ] Create agent groups/tags
- [ ] Implement security features (API keys, HTTPS)
- [ ] Add file transfer capability
- [ ] Create agent update mechanism

## Support

For issues or questions:
1. Check this documentation
2. Review `INTEGRATION_GUIDE.md` in Core Service folder
3. Check agent PowerShell output for errors
4. Review Core Service logs in Event Viewer

---
**Last Updated**: 2025-11-25  
**Version**: 1.0.0
