# OrbisHub Desktop - Installation Guide

## Complete Installation (Recommended)

Run the all-in-one installer with Administrator privileges:

```powershell
# Basic installation (uses defaults)
.\Install-OrbisHubDesktop.ps1

# Custom installation
.\Install-OrbisHubDesktop.ps1 `
  -InstallPath "D:\OrbisHub" `
  -SqlServer "192.168.1.100" `
  -SqlUser "orbisadmin" `
  -SqlPassword "YourSecurePassword" `
  -CoreServicePort 5000
```

### What Gets Installed

1. **Desktop Application** (`C:\Program Files\OrbisHub\Desktop`)
   - Electron app with all dependencies
   - Functions folder (TicketManagement, PasswordManager, BugReporting, OrbisAgent)
   - Media assets and icons
   - Desktop and Start Menu shortcuts

2. **CoreService** (`C:\Program Files\OrbisHub\CoreService`)
   - .NET 8.0 Windows Service
   - API endpoints for agents and desktop app
   - OrbisAgent PowerShell scripts for remote deployment
   - Configured with SQL Authentication

3. **Windows Service** (`OrbisHubCoreService`)
   - Auto-starts with Windows
   - Listens on port 5000
   - Manages agent communication and job queue

## Prerequisites

- Windows 10/11 or Windows Server 2016+
- .NET 8.0 Runtime (installed automatically if missing)
- SQL Server 2016+ (Express, Standard, or Enterprise)
- Node.js 16+ (for Desktop app development)
- Administrator privileges

## Database Setup

### Option 1: Using Desktop App (Recommended)

1. Launch OrbisHub Desktop
2. Go to Settings → Database
3. Configure connection:
   - **Server**: `localhost` or your SQL Server instance
   - **Database**: `OrbisHub` (will be created if not exists)
   - **Authentication**: SQL Server Authentication
   - **User**: `usr/orbisadmin` (or your custom user)
   - **Password**: Your password
4. Click "Test Connection"
5. Click "Create Database" (if needed)
6. Click "Run Migrations" to create all tables

### Option 2: Manual Database Setup

```sql
-- 1. Create database
CREATE DATABASE OrbisHub;
GO

-- 2. Create SQL login and user
USE OrbisHub;
GO

CREATE LOGIN [usr/orbisadmin] WITH PASSWORD = 'YourPassword';
CREATE USER [usr/orbisadmin] FOR LOGIN [usr/orbisadmin];
ALTER ROLE db_owner ADD MEMBER [usr/orbisadmin];
ALTER AUTHORIZATION ON DATABASE::OrbisHub TO [usr/orbisadmin];
GO

-- 3. Run migration for Metadata column (for existing installations)
USE OrbisHub;
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Agents' AND COLUMN_NAME = 'Metadata'
)
ALTER TABLE [dbo].[Agents] ADD [Metadata] NVARCHAR(MAX) NULL;
GO
```

## Database Tables

The database creation process creates the following tables:

### Core Tables
- **Users** - User accounts with roles and permissions
- **AuditLogs** - System audit trail
- **Settings** - Application configuration
- **SystemSettings** - Desktop app settings

### Infrastructure Tables
- **Environments** - Environment definitions (Dev, QA, Prod, etc.)
- **Servers** - Server inventory
- **Credentials** - Encrypted credentials for server access

### Agent Tables
- **Agents** - Registered PowerShell agents
  - Includes **Metadata** column for metrics (CPU, memory, disk, uptime)
- **AgentJobs** - Job queue for remote execution

### Messaging Tables
- **Messages** - Direct messages and channel communications
  - Supports file attachments (stored as VARBINARY)

### Ticket Management Tables
- **TicketProjects** - Project containers
- **TicketTypes** - Bug, Feature, Task, etc.
- **TicketStatuses** - Open, In Progress, Resolved, etc.
- **TicketPriorities** - Critical, High, Medium, Low, Trivial
- **TicketLabels** - Tags for categorization
- **Tickets** - Main ticket records
- **TicketComments** - Ticket discussions
- **TicketAttachments** - File attachments
- **TicketWatchers** - Notification subscriptions
- **TicketActivityLog** - Change history
- **TicketLabelMap** - Many-to-many ticket-label mapping

### Password Manager Tables
- **PasswordCategories** - Categories for password organization
- **PasswordEntries** - Encrypted password storage
- **PasswordAccessLog** - Audit trail for password access

## Post-Installation Steps

### 1. Verify CoreService

```powershell
# Check service status
Get-Service OrbisHubCoreService

# Test API endpoint
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-30T12:00:00Z",
  "version": "1.0.0"
}
```

### 2. Create First Admin User

Launch OrbisHub Desktop and create an admin account through the UI.

### 3. Deploy OrbisAgent to Remote Machines

```powershell
# From remote machine, run:
.\Install-OrbisAgent.ps1 -CoreServiceUrl "http://your-admin-pc-ip:5000"

# Or deploy using Desktop app's Agent management interface
```

## Configuration Files

### Desktop App - No dedicated config file
Configuration stored in database (SystemSettings table)

### CoreService - `appsettings.json`

```json
{
  "OrbisHub": {
    "ServiceUrl": "http://0.0.0.0:5000",
    "ConnectionString": "Server=localhost;Database=OrbisHub;User Id=usr/orbisadmin;Password=123456;TrustServerCertificate=True;",
    "HeartbeatTimeoutMinutes": 5,
    "JobTimeoutMinutes": 30
  }
}
```

**Important**: Uses SQL Authentication by default (not Integrated Security)

## Troubleshooting

### CoreService Won't Start

1. Check Event Viewer → Windows Logs → Application
2. Verify database connection string in `appsettings.json`
3. Ensure SQL user has db_owner permissions
4. Test connection manually:

```powershell
Invoke-Sqlcmd -ServerInstance "localhost" -Database "OrbisHub" `
  -Username "usr/orbisadmin" -Password "123456" `
  -Query "SELECT 1"
```

### Agent Metrics Not Displaying

1. Verify `Metadata` column exists in `Agents` table:

```sql
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Agents';
```

2. If missing, run migration:

```powershell
Invoke-Sqlcmd -ServerInstance "localhost" -Database "OrbisHub" `
  -Username "usr/orbisadmin" -Password "123456" `
  -InputFile ".\database\ADD_METADATA_COLUMN.sql"
```

3. Restart CoreService:

```powershell
Restart-Service OrbisHubCoreService
```

### Desktop App Can't Connect to CoreService

1. Verify CoreService is running: `Get-Service OrbisHubCoreService`
2. Check firewall allows port 5000
3. Test from Desktop app machine:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

4. If using remote CoreService, update Functions\OrbisAgent\agent-api.js:

```javascript
const coreServiceUrl = 'http://your-server-ip:5000';
```

## Uninstallation

```powershell
# Stop and remove CoreService
Stop-Service OrbisHubCoreService
sc.exe delete OrbisHubCoreService

# Remove firewall rule
Remove-NetFirewallRule -DisplayName "OrbisHub Core Service - Port 5000"

# Delete installation folder
Remove-Item -Path "C:\Program Files\OrbisHub" -Recurse -Force

# Delete shortcuts
Remove-Item "$env:PUBLIC\Desktop\OrbisHub Desktop.lnk"
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\OrbisHub Desktop.lnk"

# Optionally drop database
# Invoke-Sqlcmd -Query "DROP DATABASE OrbisHub"
```

## Updating

### Desktop App

```powershell
# Pull latest changes
git pull

# Copy updated files
Copy-Item -Path "app\*" -Destination "C:\Program Files\OrbisHub\Desktop\app" -Recurse -Force
Copy-Item -Path "Functions\*" -Destination "C:\Program Files\OrbisHub\Desktop\Functions" -Recurse -Force
```

### CoreService

```powershell
# Build new version
cd OrbisHub.CoreService
dotnet publish -c Release -o publish

# Stop service
Stop-Service OrbisHubCoreService

# Update files (excluding appsettings.json)
robocopy publish "C:\Program Files\OrbisHub\CoreService" /MIR /XF appsettings.json

# Restart service
Start-Service OrbisHubCoreService
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Admin PC (You)                        │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────┐      ┌──────────────────────┐    │
│  │ OrbisHub Desktop │◄────►│  CoreService (5000)  │    │
│  │  (Electron App)  │      │  (Windows Service)   │    │
│  └──────────────────┘      └──────────┬───────────┘    │
│                                        │                 │
│                            ┌───────────▼──────────┐     │
│                            │   SQL Server         │     │
│                            │   Database: OrbisHub │     │
│                            └──────────────────────┘     │
└─────────────────────────────────────────────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
        ┌───────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
        │ Remote PC 1  │   │ Remote PC 2 │   │ Remote PC 3 │
        ├──────────────┤   ├─────────────┤   ├─────────────┤
        │ OrbisAgent   │   │ OrbisAgent  │   │ OrbisAgent  │
        │ (.ps1 script)│   │ (.ps1)      │   │ (.ps1)      │
        └──────────────┘   └─────────────┘   └─────────────┘
         Sends metrics      Sends metrics     Sends metrics
         Polls for jobs     Polls for jobs    Polls for jobs
```

## Security Considerations

1. **Change Default Password**: The default SQL password (`123456`) should be changed in production
2. **Firewall**: CoreService port (5000) should only be accessible from trusted networks
3. **SSL/TLS**: Consider using HTTPS in production environments
4. **Password Encryption**: PasswordManager uses AES encryption for password storage
5. **Audit Logging**: All system actions are logged in AuditLogs table

## Support

- **Documentation**: See README files in each component folder
- **Issues**: Open an issue on GitHub
- **Database Migrations**: See `database/` folder for SQL scripts

## Version Information

- **Desktop App**: 1.4.5
- **CoreService**: 1.0.0
- **OrbisAgent**: 1.0.0
- **.NET Version**: 8.0
- **Node.js**: 16+
- **Electron**: Latest

---

**Last Updated**: November 30, 2025
