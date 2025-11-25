# OrbisAgent Quick Start Guide

## Overview

You now have a fully modular **OrbisAgent** system integrated into OrbisHub Desktop! This guide will help you get started with deploying and using agents.

## 📁 File Structure

```
Functions/OrbisAgent/
├── agent-api.js          # Backend API for agent management
├── agent-ui.js           # Frontend UI components
├── agent-schema.sql      # Database tables (Agents, AgentJobs, AgentMetrics)
├── agent-client.ps1      # PowerShell agent for remote machines
├── agent-modals.html     # Modal dialogs (deprecated, moved to index.html)
└── README.md             # Detailed documentation
```

## 🚀 Getting Started

### Step 1: Setup Database Schema

1. Open SQL Server Management Studio (SSMS)
2. Connect to your OrbisHub database
3. Execute the SQL script:
   ```sql
   -- File: Functions/OrbisAgent/agent-schema.sql
   ```
   This creates three tables:
   - **Agents** - Stores agent information
   - **AgentJobs** - Manages jobs/tasks
   - **AgentMetrics** - Time-series performance data

### Step 2: Access Agents Dashboard

1. Launch OrbisHub Desktop
2. Log in with your credentials
3. Click **"OrbisAgents"** in the left navigation menu
4. You'll see the empty agents dashboard

### Step 3: Deploy Your First Agent

#### Option A: Quick Deployment (Same Machine)

1. In OrbisHub, click **"Deploy Agent"** button
2. Copy the agent script from: `Functions/OrbisAgent/agent-client.ps1`
3. Open PowerShell as Administrator
4. Navigate to the script location
5. Run:
   ```powershell
   .\agent-client.ps1 -HubUrl "http://localhost:3000"
   ```
6. Agent should appear in dashboard within 30 seconds!

#### Option B: Remote Machine Deployment

1. Copy `agent-client.ps1` to the remote machine
2. Open PowerShell as Administrator on the remote machine
3. Run:
   ```powershell
   .\agent-client.ps1 -HubUrl "http://YOUR-HUB-IP:3000" -AgentId "PROD-SERVER-01"
   ```
   Replace `YOUR-HUB-IP` with your OrbisHub server's IP address

**Parameters:**
- `-HubUrl` (required): Your OrbisHub server URL
- `-AgentId` (optional): Unique identifier (defaults to computer name)
- `-PollInterval` (optional): Seconds between job checks (default: 30)
- `-MetricsInterval` (optional): Seconds between metrics reports (default: 60)

### Step 4: Run Your First Job

1. In the Agents dashboard, find your connected agent
2. Click **"Run Job"** button
3. Select job type: **PowerShell Script**
4. Enter a test script:
   ```powershell
   Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object -First 10
   ```
5. Click **"Submit Job"**
6. The agent will execute the script and report back results

### Step 5: View Agent Details

1. Click **"View Details"** on any agent card
2. See:
   - Full agent information (OS, IP, version)
   - Recent job history
   - System metrics

## 📊 Features Implemented

### ✅ Agent Management
- [x] Agent registration and heartbeat tracking
- [x] Real-time status monitoring (online/offline/idle)
- [x] System metrics collection (CPU, Memory, Disk)
- [x] Agent details modal with job history

### ✅ Job Execution
- [x] Create and queue jobs for agents
- [x] PowerShell script execution
- [x] Command execution
- [x] Job status tracking (pending → running → completed/failed)
- [x] Job result storage and viewing

### ✅ Metrics & Monitoring
- [x] CPU usage tracking
- [x] Memory usage tracking
- [x] Disk usage tracking
- [x] Heartbeat monitoring
- [x] Time-series metrics storage

### ✅ User Interface
- [x] Modern agent dashboard with cards
- [x] Online/offline status indicators
- [x] Deployment guide modal
- [x] Job execution modal
- [x] Agent details modal
- [x] Search and filtering

## 🔧 Example Use Cases

### 1. Service Monitoring
```powershell
# Check if critical services are running
Get-Service -Name "MSSQLSERVER","IIS","WinRM" | 
    Select-Object Name, Status, StartType
```

### 2. Disk Space Check
```powershell
# Get disk usage for all drives
Get-PSDrive -PSProvider FileSystem | 
    Select-Object Name, @{n='UsedGB';e={[math]::Round($_.Used/1GB,2)}}, 
                        @{n='FreeGB';e={[math]::Round($_.Free/1GB,2)}}
```

### 3. Process Information
```powershell
# Top 10 processes by CPU usage
Get-Process | Sort-Object CPU -Descending | 
    Select-Object -First 10 Name, CPU, WorkingSet
```

### 4. Event Log Query
```powershell
# Recent errors from System log
Get-EventLog -LogName System -EntryType Error -Newest 5 | 
    Select-Object TimeGenerated, Source, Message
```

## 🎯 Next Steps

### Recommended Enhancements:

1. **Install as Windows Service**
   - Use NSSM (Non-Sucking Service Manager)
   - Makes agent run automatically on boot
   - See README.md for detailed instructions

2. **Add Security**
   - Implement API key authentication
   - Enable HTTPS/TLS encryption
   - Add script signing

3. **Advanced Features**
   - Schedule recurring jobs (cron-like)
   - Add file transfer capabilities
   - Create agent groups/tags
   - Build custom dashboards with charts

4. **Multi-Platform**
   - Create Linux/macOS agent (Bash/Python)
   - Add Docker container agent
   - Support Kubernetes pods

## 📝 Modular Architecture

All OrbisAgent code is modularized in `Functions/OrbisAgent/`:

- **Separation of Concerns**: API logic separate from UI logic
- **Reusable Components**: Easy to extend and maintain
- **Independent Testing**: Each module can be tested separately
- **Future-Proof**: Add new features without touching core OrbisHub code

### Adding New Features:

1. Create new file in `Functions/OrbisAgent/`
2. Import in `index.html` script section
3. Use existing API/UI modules as reference
4. Follow same naming conventions

## 🐛 Troubleshooting

### Agent Not Appearing
- Check firewall allows connection to port 3000
- Verify HubUrl is correct
- Check agent PowerShell window for errors
- Review `%TEMP%\OrbisAgent_*.log`

### Jobs Not Executing
- Ensure agent is "online" status
- Check PowerShell syntax is valid
- Verify agent has necessary permissions
- View job results for error messages

### High CPU/Memory Usage
- Reduce poll/metrics intervals
- Limit metrics storage duration
- Clean old metrics:
  ```sql
  DELETE FROM AgentMetrics WHERE timestamp < DATEADD(day, -7, GETDATE())
  ```

## 📚 Documentation

For detailed API reference, architecture details, and advanced topics, see:
- **Functions/OrbisAgent/README.md** - Complete documentation
- **Functions/OrbisAgent/agent-schema.sql** - Database schema details
- **Functions/OrbisAgent/agent-client.ps1** - Agent script comments

## 🎉 Success!

You now have a fully functional remote agent monitoring system integrated into OrbisHub Desktop using modular architecture! 

**Questions or Issues?**
- Review the detailed README.md
- Check audit logs in OrbisHub
- Examine agent logs on remote machines
- Test database connectivity

---

**Built with OrbisHub** - By Admins, For Admins
