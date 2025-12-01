# OrbisHub Core Service

The **OrbisHub Core Service** is a Windows Service that acts as the central controller for the OrbisHub ecosystem. All OrbisAgents and OrbisHub Desktop clients communicate exclusively with this service.

## Features

- ✅ Windows Service with auto-start on boot
- ✅ ASP.NET Core REST API (Kestrel)
- ✅ SQL Server database integration
- ✅ Agent registration and heartbeat monitoring
- ✅ Job queue management (FIFO)
- ✅ Background services for timeout handling
- ✅ Windows Event Log logging
- ✅ Concurrency-safe database operations
- ✅ Input validation and error handling

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│  OrbisAgent(s)  │────────▶│  OrbisHub Core       │◀────────│  OrbisHub       │
│                 │         │  Service (API)       │         │  Desktop Client │
└─────────────────┘         └──────────────────────┘         └─────────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │   SQL Server     │
                            │   (OrbisHub DB)  │
                            └──────────────────┘
```

## Prerequisites

- Windows Server 2016+ or Windows 10/11
- .NET 8.0 Runtime
- SQL Server 2016+ (LocalDB, Express, or Full)
- Administrator privileges (for service installation)

## Installation

### Automated Installation (Recommended for New Clients)

Use the automated installation script to set up the Core Service with all dependencies:

```powershell
# Navigate to the CoreService directory
cd OrbisHub.CoreService

# Run the installation script as Administrator
.\Install.ps1
```

**Optional Parameters:**
```powershell
.\Install.ps1 `
  -InstallPath "C:\Program Files\OrbisHub\CoreService" `
  -SqlServer "localhost" `
  -Database "OrbisHub" `
  -Port 5000
```

The automated installer will:
1. ✅ Build and publish the project
2. ✅ Copy files to the installation directory
3. ✅ Copy OrbisAgent scripts for download endpoint
4. ✅ Configure appsettings.json
5. ✅ Initialize the database schema
6. ✅ **Grant database permissions to NT AUTHORITY\SYSTEM**
7. ✅ Configure Windows Firewall
8. ✅ Install and start the Windows Service
9. ✅ Test the API endpoint

**After installation, agents can be deployed using:**
```powershell
irm http://your-server-ip:5000/api/agent/download/bootstrap | iex
```

---

### Quick Installation (Using Pre-Built Files)

If you have the OrbisHub Desktop application installed, the compiled CoreService is already available and ready to deploy.

#### Step 1: Copy CoreService Files to Server

The compiled service is located at:
```
C:\Program Files\OrbisHub Desktop\resources\CoreService
```

Copy this entire folder to your target server location, for example:
```powershell
# On the source machine (where OrbisHub Desktop is installed)
Copy-Item "C:\Program Files\OrbisHub Desktop\resources\CoreService" -Destination "\\ServerName\C$\OrbisHub\CoreService" -Recurse

# Or copy to a local path on the server
Copy-Item "C:\Program Files\OrbisHub Desktop\resources\CoreService" -Destination "C:\OrbisHub\CoreService" -Recurse
```

#### Step 2: Configure the Service

Edit `appsettings.json` in the copied CoreService folder:

```json
{
  "OrbisHub": {
    "ServiceName": "OrbisHub Core Service",
    "ServiceUrl": "http://0.0.0.0:5000",
    "ConnectionString": "Server=localhost;Database=OrbisHub;Integrated Security=true;TrustServerCertificate=True;",
    "HeartbeatTimeoutMinutes": 5,
    "JobTimeoutMinutes": 30
  }
}
```

**Important Settings:**
- `ServiceUrl`: The URL/port where the API will listen (use `0.0.0.0` to listen on all interfaces)
- `ConnectionString`: SQL Server connection string
- `HeartbeatTimeoutMinutes`: How long before an agent is considered offline
- `JobTimeoutMinutes`: Maximum time a job can run before timing out

#### Step 3: Initialize the Database

Run the SQL script to create the database schema:

```powershell
sqlcmd -S localhost -d OrbisHub -i Database\InitializeSchema.sql
```

Or execute the script in SQL Server Management Studio.

#### Step 4: Install as Windows Service

Open PowerShell or Command Prompt **as Administrator** on the server:

```powershell
# Create the service (adjust path to match your installation location)
sc.exe create OrbisHubCoreService binPath= "C:\OrbisHub\CoreService\OrbisHub.CoreService.exe" start= auto

# Set service description
sc.exe description OrbisHubCoreService "Central controller for OrbisHub agents and clients"

# Start the service
sc.exe start OrbisHubCoreService
```

**Important:** Ensure there is a space after `binPath=` and `start=` when using `sc.exe`.

#### Step 5: Verify Installation

Check service status:

```powershell
Get-Service OrbisHubCoreService
```

Test the API:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-25T10:30:00Z",
  "version": "1.0.0"
}
```

---

### Manual Build Installation (For Development)

If you need to build from source instead of using the pre-built files:

#### Step 1: Publish the Application

```powershell
cd OrbisHub.CoreService
dotnet publish -c Release -o .\publish
```

#### Step 2: Configure the Service

Edit `publish\appsettings.json`:

```json
{
  "OrbisHub": {
    "ServiceName": "OrbisHub Core Service",
    "ServiceUrl": "http://0.0.0.0:5000",
    "ConnectionString": "Server=localhost;Database=OrbisHub;Integrated Security=true;TrustServerCertificate=True;",
    "HeartbeatTimeoutMinutes": 5,
    "JobTimeoutMinutes": 30
  }
}
```

**Important Settings:**
- `ServiceUrl`: The URL/port where the API will listen (use `0.0.0.0` to listen on all interfaces)
- `ConnectionString`: SQL Server connection string
- `HeartbeatTimeoutMinutes`: How long before an agent is considered offline
- `JobTimeoutMinutes`: Maximum time a job can run before timing out

#### Step 3: Initialize the Database

Run the SQL script to create the database schema:

```powershell
sqlcmd -S localhost -d OrbisHub -i Database\InitializeSchema.sql
```

Or execute the script in SQL Server Management Studio.

#### Step 4: Install as Windows Service

```powershell
# Create the service (adjust path to match your installation location)
sc.exe create OrbisHubCoreService binPath= "C:\Path\To\publish\OrbisHub.CoreService.exe" start= auto

# Set service description
sc.exe description OrbisHubCoreService "Central controller for OrbisHub agents and clients"

# Start the service
sc.exe start OrbisHubCoreService
```

#### Step 5: Verify Installation

Check service status:

```powershell
Get-Service OrbisHubCoreService
```

Test the API:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-25T10:30:00Z",
  "version": "1.0.0"
}
```

## API Documentation

### Agent Endpoints

#### 1. Register Agent
**POST** `/api/agents/register`

Registers a new agent or re-registers an existing one.

**Request:**
```json
{
  "machineName": "PC-DEV1",
  "ipAddresses": ["192.168.1.15"],
  "osVersion": "Windows 10 Pro",
  "agentVersion": "1.0.0"
}
```

**Response:**
```json
{
  "agentId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "registered"
}
```

#### 2. Agent Heartbeat
**POST** `/api/agents/{agentId}/heartbeat`

Updates the agent's last-seen timestamp.

**Request:**
```json
{
  "agentVersion": "1.0.0",
  "currentUser": "NT AUTHORITY\\SYSTEM"
}
```

**Response:**
```json
{
  "status": "ok"
}
```

#### 3. Get Next Job
**GET** `/api/agents/{agentId}/jobs/next`

Retrieves the next pending job for the agent (FIFO).

**Response (job available):**
```json
{
  "jobId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "type": "RunScript",
  "payload": {
    "script": "Get-Process",
    "shell": "powershell"
  }
}
```

**Response (no jobs):**
```json
{
  "job": null
}
```

#### 4. Report Job Result
**POST** `/api/agents/{agentId}/jobs/{jobId}/result`

Reports the result of a completed job.

**Request:**
```json
{
  "status": "Succeeded",
  "output": "Process list output...",
  "errorMessage": null
}
```

**Valid statuses:** `Succeeded`, `Failed`, `Timeout`

**Response:**
```json
{
  "received": true
}
```

### Client (Desktop) Endpoints

#### 5. Create Job
**POST** `/api/jobs/create`

Creates a new job for an agent.

**Request:**
```json
{
  "agentId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "type": "RunScript",
  "payload": {
    "script": "ipconfig",
    "shell": "cmd"
  }
}
```

**Response:**
```json
{
  "jobId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "status": "created"
}
```

#### 6. Get Job Status
**GET** `/api/jobs/{jobId}`

Retrieves the status and result of a job.

**Response:**
```json
{
  "jobId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "agentId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "Succeeded",
  "output": "Windows IP Configuration...",
  "errorMessage": null
}
```

#### 7. Get All Agents
**GET** `/api/agents`

Retrieves a list of all registered agents.

**Response:**
```json
[
  {
    "agentId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "machineName": "PC-DEV1",
    "ipAddress": "192.168.1.15",
    "osVersion": "Windows 10 Pro",
    "agentVersion": "1.0.0",
    "lastSeenUtc": "2025-11-25T10:30:00Z",
    "createdUtc": "2025-11-25T09:00:00Z"
  }
]
```

## Database Schema

### Agents Table
```sql
CREATE TABLE [dbo].[Agents] (
    [AgentId] UNIQUEIDENTIFIER PRIMARY KEY,
    [MachineName] NVARCHAR(255) NOT NULL,
    [IPAddress] NVARCHAR(500) NULL,
    [OSVersion] NVARCHAR(255) NULL,
    [AgentVersion] NVARCHAR(50) NULL,
    [LastSeenUtc] DATETIME NOT NULL,
    [CreatedUtc] DATETIME NOT NULL
);
```

### AgentJobs Table
```sql
CREATE TABLE [dbo].[AgentJobs] (
    [JobId] UNIQUEIDENTIFIER PRIMARY KEY,
    [AgentId] UNIQUEIDENTIFIER NOT NULL,
    [Type] NVARCHAR(100) NOT NULL,
    [PayloadJson] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(50) NOT NULL,
    [CreatedUtc] DATETIME NOT NULL,
    [StartedUtc] DATETIME NULL,
    [CompletedUtc] DATETIME NULL,
    [ResultJson] NVARCHAR(MAX) NULL,
    [ErrorMessage] NVARCHAR(MAX) NULL,
    CONSTRAINT FK_AgentJobs_Agents FOREIGN KEY ([AgentId]) 
        REFERENCES [dbo].[Agents]([AgentId])
);
```

## Background Services

### 1. DatabaseHealthService
- Waits for database availability on startup
- Retries connection every 30 seconds if unavailable
- Performs periodic health checks every 5 minutes

### 2. JobTimeoutService
- Monitors jobs in "InProgress" status
- Times out jobs that exceed `JobTimeoutMinutes`
- Runs checks every 1/6th of the timeout period

## Logging

The service logs to:
1. **Console** (when running interactively)
2. **Windows Event Log** (Application log, source: "OrbisHub.CoreService")

View logs in Event Viewer:
```
Windows Logs → Application → Filter by Source: "OrbisHub.CoreService"
```

## Management Commands

### Start Service
```powershell
Start-Service OrbisHubCoreService
```

### Stop Service
```powershell
Stop-Service OrbisHubCoreService
```

### Restart Service
```powershell
Restart-Service OrbisHubCoreService
```

### Check Status
```powershell
Get-Service OrbisHubCoreService | Select-Object Status, StartType
```

### View Logs
```powershell
Get-EventLog -LogName Application -Source "OrbisHub.CoreService" -Newest 20
```

### Uninstall Service
```powershell
Stop-Service OrbisHubCoreService
sc.exe delete OrbisHubCoreService
```

## Firewall Configuration

If agents or clients are on different machines, allow inbound connections:

```powershell
New-NetFirewallRule -DisplayName "OrbisHub Core Service" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
```

## Troubleshooting

### Service won't start
1. Check Event Viewer for errors
2. Verify connection string is correct
3. Ensure SQL Server is running
4. Test database connectivity manually

### Database connection errors
```powershell
# Test connection
sqlcmd -S localhost -d OrbisHub -Q "SELECT 1"
```

### API not accessible
1. Check firewall rules
2. Verify `ServiceUrl` in appsettings.json
3. Test locally: `Invoke-RestMethod -Uri "http://localhost:5000/health"`

### Jobs timing out
- Increase `JobTimeoutMinutes` in appsettings.json
- Check agent performance
- Review job complexity

## Development

### Running in Development Mode

```powershell
cd OrbisHub.CoreService
dotnet run --environment Development
```

Access Swagger UI: `http://localhost:5000/swagger`

### Building from Source

```powershell
dotnet build -c Release
```

### Running Tests

```powershell
dotnet test
```

## Security Considerations

1. **Change default port** if exposed to untrusted networks
2. **Use HTTPS** in production (configure SSL certificate)
3. **Implement authentication** for production deployments
4. **Restrict firewall rules** to known IP ranges
5. **Use SQL authentication** with least-privilege accounts
6. **Enable SQL Server encryption** (TrustServerCertificate=False in production)

## License

[Your License Here]

## Support

For issues or questions, please contact [Your Support Info].
