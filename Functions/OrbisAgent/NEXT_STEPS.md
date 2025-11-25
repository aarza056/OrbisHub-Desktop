# OrbisAgent - Next Steps

## ✅ Completed Setup

All code has been created and properly modularized:

- ✅ `agent-api.js` - Backend API module (493 lines)
- ✅ `agent-ui.js` - Frontend UI module (397 lines) - **Updated with new CSS classes**
- ✅ `agent-ui.css` - Dedicated styling (695 lines) - **Linked in index.html**
- ✅ `agent-schema.sql` - Database schema (87 lines)
- ✅ `agent-client.ps1` - PowerShell agent (267 lines)
- ✅ Documentation files (README, QUICKSTART, IMPLEMENTATION_SUMMARY, API_REFERENCE)

## 🎨 UI Updates Applied

The UI has been enhanced with:

### Agent Cards
- **Status Indicators**: Pulsing dots with colors (green=online, yellow=idle, red=offline)
- **Status Badges**: Color-coded badges in top-right corner
- **Metrics Grid**: 3-column layout showing CPU/Memory/Disk with warning/danger states
- **Detail Rows**: Clean table-style rows for IP, Last Seen, Version
- **Action Buttons**: Icon-based buttons with primary/success/danger variants
- **Hover Effects**: Smooth lift and glow effects on hover
- **Warning States**: Metrics turn orange (60%+ CPU, 70%+ memory, 75%+ disk) or red (80%+ CPU, 85%+ memory, 90%+ disk)

### Empty States
- **No Agents State**: Large icon, title, description, deployment guide button
- **Error State**: Red icon with error message
- **Loading State**: Animated skeleton cards

### Modals
- **Backdrop Blur**: Modern glassmorphism effect
- **Slide-In Animation**: Smooth 250ms entrance
- **Close Animations**: Fade-out transitions
- **Job History**: Color-coded status badges with timestamps
- **Deployment Guide**: Numbered steps with copyable code blocks

### Status Counters
- **Online Count**: Green pulsing indicator with count
- **Offline Count**: Red indicator with count
- **Auto-Update**: Refreshes every 30 seconds

## 📋 Required Actions

### 1. Execute Database Schema
Run the SQL script to create the required tables:

```powershell
# Option 1: SQL Server Management Studio
# Open agent-schema.sql and execute against your OrbisHub database

# Option 2: Command Line (sqlcmd)
sqlcmd -S YOUR_SERVER -d OrbisHub -i "Functions\OrbisAgent\agent-schema.sql"
```

**Creates 3 tables:**
- `Agents` - Agent registration and heartbeat tracking
- `AgentJobs` - Job queue and execution history
- `AgentMetrics` - Time-series system metrics

### 2. Test the UI
1. **Restart OrbisHub Desktop** to load the new CSS
2. Navigate to **OrbisAgents** section using the nav button
3. Verify the empty state displays correctly
4. Click **View Deployment Guide** to see the modal

### 3. Deploy First Agent
Deploy the PowerShell agent to a test machine:

```powershell
# On target machine (can be localhost for testing)
cd "C:\Users\Ashot\Documents\GitHub\OrbisHub-Desktop\Functions\OrbisAgent"

# Run agent in foreground for testing
.\agent-client.ps1 -HubUrl "http://YOUR-SERVER:3000"

# Or run in background
.\agent-client.ps1 -HubUrl "http://YOUR-SERVER:3000" -RunInBackground
```

**Replace `YOUR-SERVER:3000`** with your actual OrbisHub server address.

### 4. Verify Agent Registration
After starting the agent:
1. Wait 5-10 seconds for initial registration
2. Refresh the OrbisAgents dashboard
3. You should see an **agent card appear** with:
   - Green pulsing status indicator
   - "ONLINE" badge
   - CPU/Memory/Disk metrics
   - Machine name and IP address
   - "Last Seen: just now"

### 5. Test Job Execution
1. Click **Run Job** button on an agent card
2. Select a script type (e.g., **Get-Service**)
3. Optionally add parameters: `Name "wuauserv"`
4. Click **Submit Job**
5. View job status in **Agent Details** modal
6. Check output when job completes

## 🎯 Expected Behavior

### Agent Card States
- **Online** (green): Last heartbeat < 2 minutes ago
- **Idle** (yellow): Last heartbeat 2-10 minutes ago
- **Offline** (red): Last heartbeat > 10 minutes ago

### Metric Warning States
- **CPU**: Orange at 60%, Red at 80%
- **Memory**: Orange at 70%, Red at 85%
- **Disk**: Orange at 75%, Red at 90%

### Auto-Refresh
- Dashboard refreshes every **30 seconds** automatically
- Status counters update on each refresh
- No need to manually refresh

## 🔧 Troubleshooting

### Agent Not Appearing
1. Check SQL Server connection in main.js
2. Verify database schema was executed
3. Check agent-client.ps1 output for errors
4. Ensure `-HubUrl` parameter is correct
5. Verify firewall allows connection to SQL Server (default port 1433)

### CSS Not Loading
1. Verify `agent-ui.css` exists in `Functions/OrbisAgent/`
2. Check browser console (F12) for 404 errors
3. Restart OrbisHub Desktop application
4. Clear Electron cache: Delete `%APPDATA%\OrbisHub-Desktop\` folder

### Metrics Not Showing
1. Wait 60 seconds for first metrics collection
2. Check PowerShell execution policy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
3. Verify WMI service is running on target machine

### Jobs Not Executing
1. Check job status in Agent Details modal
2. Verify PowerShell version: `$PSVersionTable.PSVersion` (requires 5.1+)
3. Check script execution policy
4. Review job output for errors

## 📊 Database Queries for Debugging

```sql
-- Check registered agents
SELECT * FROM Agents ORDER BY lastHeartbeat DESC

-- Check pending jobs
SELECT * FROM AgentJobs WHERE status = 'pending'

-- Check recent metrics
SELECT TOP 100 * FROM AgentMetrics ORDER BY timestamp DESC

-- Check agent with jobs
SELECT 
    a.machineName,
    a.status,
    a.lastHeartbeat,
    COUNT(j.id) as totalJobs,
    SUM(CASE WHEN j.status = 'pending' THEN 1 ELSE 0 END) as pendingJobs,
    SUM(CASE WHEN j.status = 'running' THEN 1 ELSE 0 END) as runningJobs,
    SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END) as completedJobs
FROM Agents a
LEFT JOIN AgentJobs j ON a.id = j.agentId
GROUP BY a.machineName, a.status, a.lastHeartbeat
```

## 🚀 Performance Optimization

### For Production Deployments
1. **Increase Polling Intervals**: Edit `agent-client.ps1`:
   ```powershell
   -PollInterval 60  # Poll every 60 seconds instead of 30
   -MetricsInterval 300  # Send metrics every 5 minutes instead of 60 seconds
   ```

2. **Limit Metric History**: Add cleanup job in SQL Server:
   ```sql
   -- Delete metrics older than 30 days
   DELETE FROM AgentMetrics WHERE timestamp < DATEADD(day, -30, GETDATE())
   ```

3. **Index Optimization**: Already included in schema, but verify:
   ```sql
   -- Check existing indexes
   SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('AgentMetrics')
   ```

## 📝 Feature Roadmap

### Planned Enhancements (v1.1+)
- [ ] **API Authentication**: API keys for secure agent communication
- [ ] **HTTPS Support**: Encrypted communication
- [ ] **Script Templates**: Pre-built common scripts
- [ ] **Scheduled Jobs**: Cron-like job scheduling
- [ ] **Agent Groups**: Organize agents by environment/role
- [ ] **Bulk Operations**: Run jobs on multiple agents
- [ ] **Real-time Alerts**: Notifications for offline agents or high resource usage
- [ ] **Metrics Dashboard**: Charts and graphs for historical data
- [ ] **Agent Logs**: Stream PowerShell output in real-time
- [ ] **Script Validation**: Syntax checking before execution

## 📚 Additional Resources

- **README.md** - Complete feature overview
- **QUICKSTART.md** - Getting started guide
- **IMPLEMENTATION_SUMMARY.md** - Technical implementation details
- **API_REFERENCE.md** - API function reference
- **agent-schema.sql** - Database schema with comments

## ✨ UI Design Philosophy

The OrbisAgent UI follows OrbisHub's design system:

- **Dark Theme**: Uses existing CSS variables (--panel, --border, --text, --muted, --bg)
- **Status Colors**: Green (#10b981), Yellow (#f59e0b), Red (#ef4444), Blue (#3b82f6)
- **Animations**: Subtle pulse effects, smooth transitions (250ms ease)
- **Typography**: Inter font family, clear hierarchy
- **Spacing**: 8px base unit (8px, 12px, 16px, 20px, 24px)
- **Glassmorphism**: Backdrop blur effects on modals
- **Responsive**: Mobile-first with breakpoints at 768px and 1200px

## 🎨 CSS Custom Properties Used

```css
var(--panel)     /* Background for cards */
var(--border)    /* Border colors */
var(--text)      /* Primary text color */
var(--muted)     /* Secondary text color */
var(--bg)        /* Background color */
```

## 🏁 Quick Start Checklist

- [ ] Execute `agent-schema.sql` in SQL Server
- [ ] Restart OrbisHub Desktop
- [ ] Open OrbisAgents section
- [ ] Verify empty state UI displays correctly
- [ ] Deploy agent: `.\agent-client.ps1 -HubUrl "http://localhost:3000"`
- [ ] Refresh dashboard, verify agent appears
- [ ] Click "Run Job" and execute test script
- [ ] Click "View Details" to see job history
- [ ] Check metrics update after 60 seconds

---

**Questions or issues?** Review the documentation files in this directory or check the database queries above for debugging.
