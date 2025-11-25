# OrbisHub Complete Integration

This document describes the complete OrbisHub ecosystem with the Core Service, Agents, and Desktop client.

## 🏗️ Architecture Overview

```
┌──────────────────────┐
│  OrbisHub Desktop    │
│  (Electron App)      │
└──────────┬───────────┘
           │
           │ HTTP/REST API
           ▼
┌──────────────────────┐         ┌──────────────────┐
│  OrbisHub Core       │◀────────│  SQL Server      │
│  Service             │         │  Database        │
│  (Windows Service)   │         └──────────────────┘
└──────────┬───────────┘
           │
           │ HTTP/REST API
           ▼
┌──────────────────────┐
│  OrbisAgent(s)       │
│  (PowerShell)        │
│  Multiple Machines   │
└──────────────────────┘
```

## 📦 Components

### 1. **OrbisHub Core Service**
- **Location**: `OrbisHub.CoreService/`
- **Technology**: .NET 8, ASP.NET Core, Windows Service
- **Purpose**: Central API server for agent management and job orchestration
- **Database**: SQL Server (Agents + AgentJobs tables)

### 2. **OrbisAgent**
- **Location**: `OrbisAgent/`
- **Technology**: PowerShell
- **Purpose**: Client agent that runs on managed machines
- **Features**: Registration, heartbeat, job polling, command execution

### 3. **OrbisHub Desktop**
- **Location**: `app/`
- **Technology**: Electron, JavaScript
- **Purpose**: Admin UI for managing agents and sending commands
- **Features**: Agent dashboard, command execution, job monitoring

## 🚀 Quick Start Guide

### Step 1: Install Core Service

```powershell
# Run as Administrator
cd OrbisHub.CoreService
.\Install.ps1
```

This will:
- Build and publish the service
- Create database schema
- Install as Windows Service
- Configure firewall
- Start the service

**Verify Installation:**
```powershell
Get-Service OrbisHubCoreService
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

### Step 2: Install Agent (on each managed machine)

```powershell
# Run as Administrator
cd OrbisAgent
.\Install-Agent.ps1
```

**For remote machines:**
```powershell
.\Install-Agent.ps1 -CoreServiceUrl "http://192.168.1.100:5000"
```

**Verify Agent:**
```powershell
Get-ScheduledTask -TaskName "OrbisAgent"
Get-Content "C:\Program Files\OrbisAgent\OrbisAgent.log" -Tail 20
```

### Step 3: Open Desktop App

```powershell
cd OrbisHub-Desktop
npm start
```

Navigate to **Agent Management** in the sidebar.

### Step 4: Test the Integration

```powershell
.\Test-Integration.ps1
```

This script will:
- Check Core Service health
- List registered agents
- Create a test job
- Verify desktop app files

## 🔧 Configuration

### Core Service Configuration
Edit `C:\Program Files\OrbisHub\CoreService\appsettings.json`:

```json
{
  "OrbisHub": {
    "ServiceUrl": "http://0.0.0.0:5000",
    "ConnectionString": "Server=localhost;Database=OrbisHub;Integrated Security=true;TrustServerCertificate=True;",
    "HeartbeatTimeoutMinutes": 5,
    "JobTimeoutMinutes": 30
  }
}
```

### Agent Configuration
Edit `C:\Program Files\OrbisAgent\config.ps1`:

```powershell
$CoreServiceUrl = "http://localhost:5000"
$HeartbeatIntervalSeconds = 30
$JobPollIntervalSeconds = 5
```

### Desktop App Configuration
The desktop app connects to `http://localhost:5000` by default. To change:

Edit `app/services/core-service.js`:
```javascript
class CoreServiceClient {
    constructor(baseUrl = 'http://your-server:5000') {
        this.baseUrl = baseUrl;
    }
    // ...
}
```

## 📊 Usage Examples

### Example 1: Run PowerShell Script

**From Desktop App:**
1. Navigate to **Agent Management**
2. Click on an agent
3. Select **Run Script**
4. Shell: **PowerShell**
5. Script: `Get-Service | Where-Object Status -eq 'Running'`
6. Click **Execute**

**From API:**
```powershell
$body = @{
    agentId = "your-agent-id"
    type = "RunScript"
    payload = @{
        script = "Get-Process | Select-Object -First 10"
        shell = "powershell"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/jobs/create" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
```

### Example 2: Get System Information

```powershell
$body = @{
    agentId = "your-agent-id"
    type = "GetSystemInfo"
    payload = @{}
} | ConvertTo-Json

$job = Invoke-RestMethod -Uri "http://localhost:5000/api/jobs/create" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"

# Wait and check result
Start-Sleep -Seconds 5
Invoke-RestMethod -Uri "http://localhost:5000/api/jobs/$($job.jobId)"
```

### Example 3: Get Service Status

```powershell
$body = @{
    agentId = "your-agent-id"
    type = "GetServiceStatus"
    payload = @{
        serviceName = "wuauserv"  # Windows Update
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/jobs/create" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
```

## 🔍 Monitoring & Troubleshooting

### Check Core Service Status
```powershell
# Service status
Get-Service OrbisHubCoreService | Select-Object Status, StartType

# View logs
Get-EventLog -LogName Application -Source "OrbisHub.CoreService" -Newest 20 | Format-Table -AutoSize

# Test API
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

### Check Agent Status
```powershell
# Task status
Get-ScheduledTask -TaskName "OrbisAgent" | Select-Object TaskName, State

# View logs
Get-Content "C:\Program Files\OrbisAgent\OrbisAgent.log" -Tail 50 -Wait

# Check if agent is registered
Invoke-RestMethod -Uri "http://localhost:5000/api/agents"
```

### Common Issues

**Agent not registering:**
1. Check Core Service is running
2. Verify network connectivity: `Test-NetConnection -ComputerName localhost -Port 5000`
3. Check firewall rules
4. Review agent logs

**Jobs not executing:**
1. Verify agent is online (last seen < 2 minutes)
2. Check agent task is running
3. Review agent logs for errors
4. Check job status via API

**Desktop app not connecting:**
1. Verify Core Service URL in `core-service.js`
2. Check Core Service is accessible
3. Open browser console for errors

## 📈 API Reference

### Agent Registration
```http
POST /api/agents/register
Content-Type: application/json

{
  "machineName": "PC-001",
  "ipAddresses": ["192.168.1.10"],
  "osVersion": "Windows 10",
  "agentVersion": "1.0.0"
}
```

### Agent Heartbeat
```http
POST /api/agents/{agentId}/heartbeat
Content-Type: application/json

{
  "agentVersion": "1.0.0",
  "currentUser": "DOMAIN\\User"
}
```

### Get Next Job
```http
GET /api/agents/{agentId}/jobs/next
```

### Report Job Result
```http
POST /api/agents/{agentId}/jobs/{jobId}/result
Content-Type: application/json

{
  "status": "Succeeded",
  "output": "Job output...",
  "errorMessage": null
}
```

### Create Job (Client)
```http
POST /api/jobs/create
Content-Type: application/json

{
  "agentId": "guid",
  "type": "RunScript",
  "payload": {
    "script": "Get-Date",
    "shell": "powershell"
  }
}
```

### Get Job Status (Client)
```http
GET /api/jobs/{jobId}
```

### List All Agents (Client)
```http
GET /api/agents
```

## 🔒 Security Considerations

### Production Deployment

1. **Use HTTPS**
   - Configure SSL certificate on Core Service
   - Update all clients to use `https://`

2. **Implement Authentication**
   - Add API key or JWT authentication
   - Restrict agent registration

3. **Network Security**
   - Use VPN or private network
   - Restrict firewall to known IPs
   - Use SQL authentication instead of Windows Auth

4. **Database Security**
   - Use encrypted connections
   - Implement least-privilege accounts
   - Regular backups

5. **Agent Security**
   - Validate all scripts before execution
   - Run agent with limited privileges when possible
   - Log all executed commands

## 📝 Maintenance

### Update Core Service
```powershell
# Stop service
Stop-Service OrbisHubCoreService

# Rebuild and publish
cd OrbisHub.CoreService
dotnet publish -c Release -o publish

# Copy new files (backup old ones first)
Copy-Item -Path publish\* -Destination "C:\Program Files\OrbisHub\CoreService\" -Force

# Start service
Start-Service OrbisHubCoreService
```

### Update Agent
```powershell
# Stop agent
Stop-ScheduledTask -TaskName "OrbisAgent"

# Copy new OrbisAgent.ps1
Copy-Item -Path .\OrbisAgent.ps1 -Destination "C:\Program Files\OrbisAgent\" -Force

# Start agent
Start-ScheduledTask -TaskName "OrbisAgent"
```

### Database Maintenance
```sql
-- View agent activity
SELECT MachineName, LastSeenUtc, CreatedUtc 
FROM Agents 
ORDER BY LastSeenUtc DESC;

-- View job history
SELECT TOP 100 j.JobId, a.MachineName, j.Type, j.Status, j.CreatedUtc
FROM AgentJobs j
INNER JOIN Agents a ON j.AgentId = a.AgentId
ORDER BY j.CreatedUtc DESC;

-- Clean old completed jobs (older than 30 days)
DELETE FROM AgentJobs 
WHERE Status IN ('Succeeded', 'Failed', 'Timeout')
  AND CompletedUtc < DATEADD(day, -30, GETUTCDATE());

-- Remove inactive agents (not seen in 7 days)
DELETE FROM Agents
WHERE LastSeenUtc < DATEADD(day, -7, GETUTCDATE());
```

## 🆘 Support

For issues or questions:
1. Check logs (Event Viewer, agent logs)
2. Run `Test-Integration.ps1`
3. Review documentation
4. Check GitHub issues

## 📄 License

[Your License Here]

---

**OrbisHub** - By Admins, For Admins
