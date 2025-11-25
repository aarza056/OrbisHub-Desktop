# OrbisAgent API Quick Reference

## JavaScript API (Frontend)

### Agent Management

```javascript
// Get all agents
const agents = await AgentAPI.getAllAgents()

// Get specific agent
const agent = await AgentAPI.getAgentById('AGENT-001')

// Register/Update agent
await AgentAPI.registerAgent({
    id: 'AGENT-001',
    machineName: 'WEB-SERVER-01',
    os: 'Windows Server 2022',
    ipAddress: '192.168.1.100',
    version: '1.0.0',
    metadata: { cpuPercent: 45.2, memoryPercent: 62.8 }
})

// Update status
await AgentAPI.updateAgentStatus('AGENT-001', 'online')

// Delete agent (and all related data)
await AgentAPI.deleteAgent('AGENT-001')
```

### Job Management

```javascript
// Create new job
const result = await AgentAPI.createJob({
    agentId: 'AGENT-001',
    type: 'script',
    script: 'Get-Service | Where-Object {$_.Status -eq "Running"}',
    createdBy: 'admin'
})
// Returns: { success: true, jobId: 'job-xxx' }

// Get pending jobs for agent
const jobs = await AgentAPI.getPendingJobs('AGENT-001')

// Get job history
const history = await AgentAPI.getAgentJobs('AGENT-001', 50)

// Update job status
await AgentAPI.updateJobStatus('job-xxx', 'completed', JSON.stringify({
    exitCode: 0,
    output: 'Success!'
}))
```

### Metrics

```javascript
// Save metrics
await AgentAPI.saveMetrics({
    agentId: 'AGENT-001',
    cpuPercent: 45.2,
    memoryPercent: 62.8,
    diskPercent: 75.0,
    networkIn: 1024000,
    networkOut: 512000,
    customMetrics: { temperature: 65 }
})

// Get metrics history
const metrics = await AgentAPI.getAgentMetrics('AGENT-001', 100)
```

---

## UI Functions

```javascript
// Render agents dashboard
AgentUI.renderAgentsDashboard()

// Show agent details modal
AgentUI.viewAgentDetails('AGENT-001')

// Show run job modal
AgentUI.runJobOnAgent('AGENT-001')

// Submit job from modal
AgentUI.submitJob()

// Delete agent with confirmation
AgentUI.deleteAgent('AGENT-001', 'WEB-SERVER-01')

// Show deployment guide
AgentUI.showDeploymentGuide()

// Initialize UI module
AgentUI.init()
```

---

## Electron IPC Handlers (Backend)

### Available in main.js:

```javascript
// Agent registration (called from agent-client)
ipcMain.handle('agent-register', async (event, agentData) => {
    // Merges agent into Agents table
})

// Poll for jobs (called from agent-client)
ipcMain.handle('agent-poll', async (event, agentId) => {
    // Returns pending jobs, marks as running
})

// Update job status (called from agent-client)
ipcMain.handle('agent-job-status', async (event, { jobId, status, result }) => {
    // Updates job status and result
})

// Save metrics (called from agent-client)
ipcMain.handle('agent-metrics', async (event, metricsData) => {
    // Saves metrics and updates heartbeat
})
```

---

## PowerShell Agent Commands

### Deploy Agent

```powershell
# Basic deployment
.\agent-client.ps1 -HubUrl "http://localhost:3000"

# With custom agent ID
.\agent-client.ps1 -HubUrl "http://hub:3000" -AgentId "CUSTOM-01"

# Custom intervals
.\agent-client.ps1 -HubUrl "http://hub:3000" -PollInterval 20 -MetricsInterval 45
```

### Agent Functions (Internal)

```powershell
# Get system metrics
$metrics = Get-SystemMetrics
# Returns: @{ cpuPercent, memoryPercent, diskPercent, uptime }

# Register with hub
Register-Agent

# Send heartbeat
Send-Heartbeat

# Get pending jobs
$jobs = Get-PendingJobs

# Execute job
Invoke-Job -Job $jobObject

# Update job status
Update-JobStatus -JobId "job-xxx" -Status "completed" -Result "{...}"
```

---

## Database Queries

### Direct SQL Queries

```sql
-- Get all online agents
SELECT * FROM Agents WHERE status = 'online' ORDER BY lastHeartbeat DESC;

-- Get agents not seen in 5 minutes
SELECT * FROM Agents 
WHERE lastHeartbeat < DATEADD(minute, -5, GETDATE());

-- Get pending jobs
SELECT * FROM AgentJobs WHERE status = 'pending' ORDER BY createdAt;

-- Get job history for agent
SELECT TOP 50 * FROM AgentJobs 
WHERE agentId = 'AGENT-001' 
ORDER BY createdAt DESC;

-- Get recent metrics
SELECT TOP 100 * FROM AgentMetrics 
WHERE agentId = 'AGENT-001' 
ORDER BY timestamp DESC;

-- Cleanup old metrics (7 days)
DELETE FROM AgentMetrics 
WHERE timestamp < DATEADD(day, -7, GETDATE());

-- Agent statistics
SELECT 
    COUNT(*) as TotalAgents,
    SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as OnlineAgents,
    SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as OfflineAgents
FROM Agents;
```

---

## Job Types

```javascript
// Available job types
const jobTypes = [
    'script',      // PowerShell script block
    'command',     // Single command
    'monitor',     // Monitoring task
    'update',      // Agent update
    'custom'       // Custom task
]
```

---

## Agent Statuses

```javascript
const statuses = [
    'online',      // Active and responsive
    'offline',     // Not responding
    'idle',        // Online but inactive
    'error'        // Error state
]
```

---

## Job Statuses

```javascript
const jobStatuses = [
    'pending',     // Queued, waiting for agent
    'running',     // Currently executing
    'completed',   // Successfully finished
    'failed',      // Execution failed
    'cancelled'    // Manually cancelled
]
```

---

## Example Scripts for Jobs

### 1. Check Windows Services
```powershell
Get-Service | Where-Object {$_.Status -eq "Running"} | 
    Select-Object Name, DisplayName, Status | 
    ConvertTo-Json
```

### 2. Disk Space Report
```powershell
Get-PSDrive -PSProvider FileSystem | 
    Select-Object Name, 
        @{n='UsedGB';e={[math]::Round($_.Used/1GB,2)}},
        @{n='FreeGB';e={[math]::Round($_.Free/1GB,2)}},
        @{n='TotalGB';e={[math]::Round(($_.Used+$_.Free)/1GB,2)}} |
    ConvertTo-Json
```

### 3. Top CPU Processes
```powershell
Get-Process | Sort-Object CPU -Descending | 
    Select-Object -First 10 Name, CPU, 
        @{n='MemoryMB';e={[math]::Round($_.WorkingSet/1MB,2)}} |
    ConvertTo-Json
```

### 4. Network Adapters
```powershell
Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | 
    Select-Object Name, InterfaceDescription, LinkSpeed, Status |
    ConvertTo-Json
```

### 5. Event Log Errors
```powershell
Get-EventLog -LogName System -EntryType Error -Newest 5 | 
    Select-Object TimeGenerated, Source, Message |
    ConvertTo-Json
```

---

## Error Handling

### API Error Format
```javascript
{
    success: false,
    error: "Error message description"
}
```

### Success Format
```javascript
{
    success: true,
    data: { /* result data */ }
}
```

---

## Common Patterns

### Register Agent on Startup
```javascript
// In agent-client.ps1
await AgentAPI.registerAgent({
    id: $env:COMPUTERNAME,
    machineName: $env:COMPUTERNAME,
    os: "Windows Server 2022",
    ipAddress: "192.168.1.100"
})
```

### Poll-Execute-Report Loop
```javascript
// Agent polling loop
while (true) {
    // 1. Poll for jobs
    const jobs = await getPendingJobs()
    
    // 2. Execute each job
    for (const job of jobs) {
        const result = await executeJob(job)
        
        // 3. Report result
        await updateJobStatus(job.id, result.status, result.output)
    }
    
    // 4. Wait before next poll
    await sleep(30000)
}
```

### Send Metrics Periodically
```javascript
setInterval(async () => {
    const metrics = await collectMetrics()
    await AgentAPI.saveMetrics(metrics)
}, 60000) // Every 60 seconds
```

---

## Configuration

### Agent Configuration
```powershell
# Default values in agent-client.ps1
$AgentVersion = "1.0.0"
$PollInterval = 30      # seconds
$MetricsInterval = 60   # seconds
```

### Hub Configuration
```javascript
// Default endpoints (handled by Electron IPC)
'/api/agent/register'
'/api/agent/poll'
'/api/agent/job-status'
'/api/agent/metrics'
```

---

## Troubleshooting Commands

```sql
-- Check agent connectivity
SELECT id, machineName, status, lastHeartbeat,
       DATEDIFF(second, lastHeartbeat, GETDATE()) as SecondsSinceHeartbeat
FROM Agents
ORDER BY lastHeartbeat DESC;

-- Find stuck jobs
SELECT * FROM AgentJobs 
WHERE status = 'running' 
  AND DATEDIFF(minute, startedAt, GETDATE()) > 30;

-- Agent job success rate
SELECT agentId,
       COUNT(*) as TotalJobs,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as Successful,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as Failed
FROM AgentJobs
GROUP BY agentId;
```

---

## Performance Tips

1. **Limit metrics retention**: Delete metrics older than 7 days
2. **Optimize poll interval**: Balance between responsiveness and load
3. **Index frequently queried columns**: Already indexed in schema
4. **Use connection pooling**: Already implemented in main.js
5. **Batch operations**: Send multiple metrics in one call

---

## Security Checklist

- [ ] Enable HTTPS for hub
- [ ] Add API key authentication
- [ ] Implement rate limiting
- [ ] Validate script content
- [ ] Sign scripts
- [ ] Limit agent permissions
- [ ] Audit all operations (✅ Already implemented)
- [ ] Encrypt sensitive data
- [ ] Use firewall rules

---

**Quick Reference Version 1.0.0**  
*OrbisHub OrbisAgent Module*
