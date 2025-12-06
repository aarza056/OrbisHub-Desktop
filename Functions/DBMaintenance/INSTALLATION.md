# DB Maintenance Installation Guide

This guide will help you set up and configure the Database Maintenance module for OrbisHub Desktop.

## Prerequisites

- OrbisHub Desktop installed and configured
- SQL Server 2016 or later
- Database user with appropriate permissions
- Active database connection configured in OrbisHub

## Installation Steps

### 1. File Structure

The DB Maintenance module consists of the following files in `Functions/DBMaintenance/`:

```
DBMaintenance/
├── db-maintenance-ui.js       # User interface components
├── db-maintenance-service.js  # Backend database operations
├── db-maintenance-ui.css      # Styling
├── README.md                  # Feature documentation
└── INSTALLATION.md           # This file
```

### 2. Verify Files Are Linked

The installation should automatically link the necessary files. Verify the following exist in `app/index.html`:

**CSS Link (in `<head>` section):**
```html
<link rel="stylesheet" href="../Functions/DBMaintenance/db-maintenance-ui.css" />
```

**JavaScript Links (before closing `</body>` tag):**
```html
<!-- DB Maintenance Module -->
<script src="../Functions/DBMaintenance/db-maintenance-service.js"></script>
<script src="../Functions/DBMaintenance/db-maintenance-ui.js"></script>
```

### 3. Database Permissions

Ensure your database user has the required permissions:

```sql
-- Grant basic permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [YourDBUser];

-- Grant backup permission
GRANT BACKUP DATABASE TO [YourDBUser];

-- Grant view definition (for health checks)
GRANT VIEW DEFINITION TO [YourDBUser];

-- Grant view server state (for statistics)
GRANT VIEW SERVER STATE TO [YourDBUser];

-- Or simply add to db_owner role (recommended for admins)
ALTER ROLE db_owner ADD MEMBER [YourDBUser];
```

### 4. Backup Directory Setup

For backup functionality, ensure:

1. **Create Backup Directory** on the SQL Server machine:
   ```powershell
   # Run on SQL Server machine
   New-Item -Path "C:\SQLBackups" -ItemType Directory -Force
   ```

2. **Grant Permissions** to SQL Server service account:
   ```powershell
   # Grant full control to SQL Server service account
   $acl = Get-Acl "C:\SQLBackups"
   $permission = "NT SERVICE\MSSQLSERVER","FullControl","Allow"
   $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
   $acl.SetAccessRule($accessRule)
   Set-Acl "C:\SQLBackups" $acl
   ```

   **Note:** Replace `MSSQLSERVER` with your SQL Server instance name if different.

3. **For Remote SQL Servers**: Use UNC paths or ensure network share permissions:
   ```
   \\SQLServer\Backups\OrbisHub.bak
   ```

### 5. Verify Installation

1. **Launch OrbisHub Desktop**

2. **Navigate to System Configuration**:
   - Click the ⚙️ gear icon in the sidebar
   - You should see a new "DB Maintenance" tab

3. **Test the Connection**:
   - Click on the "DB Maintenance" tab
   - Database statistics should load automatically
   - If statistics display, installation is successful!

### 6. Initial Configuration

#### Set Up Backup Path
1. Navigate to DB Maintenance tab
2. In the "Database Backup" section, enter your backup path
3. Test by creating a backup

#### Configure Audit Retention
1. In the "Data Cleanup" section
2. Set the desired retention period for audit logs (default: 90 days)

#### Run Initial Health Check
1. Scroll to "Database Health Check" section
2. Click "Run Health Check"
3. Review any recommendations

## Optional: SQL Server Agent Setup (Automated Maintenance)

For automated maintenance tasks, create SQL Server Agent jobs:

### Daily Statistics Update Job
```sql
USE [msdb]
GO

EXEC msdb.dbo.sp_add_job
    @job_name = N'OrbisHub - Update Statistics',
    @enabled = 1,
    @description = N'Update database statistics daily'
GO

EXEC msdb.dbo.sp_add_jobstep
    @job_name = N'OrbisHub - Update Statistics',
    @step_name = N'Update Stats',
    @subsystem = N'TSQL',
    @command = N'EXEC sp_updatestats;',
    @database_name = N'OrbisHub'
GO

EXEC msdb.dbo.sp_add_schedule
    @schedule_name = N'Daily at 2 AM',
    @freq_type = 4,
    @freq_interval = 1,
    @active_start_time = 020000
GO

EXEC msdb.dbo.sp_attach_schedule
    @job_name = N'OrbisHub - Update Statistics',
    @schedule_name = N'Daily at 2 AM'
GO
```

### Weekly Backup Job
```sql
USE [msdb]
GO

EXEC msdb.dbo.sp_add_job
    @job_name = N'OrbisHub - Weekly Backup',
    @enabled = 1,
    @description = N'Full database backup every Sunday'
GO

EXEC msdb.dbo.sp_add_jobstep
    @job_name = N'OrbisHub - Weekly Backup',
    @step_name = N'Full Backup',
    @subsystem = N'TSQL',
    @command = N'
        DECLARE @BackupFile NVARCHAR(500)
        SET @BackupFile = ''C:\SQLBackups\OrbisHub_'' + 
                         CONVERT(VARCHAR, GETDATE(), 112) + ''.bak''
        
        BACKUP DATABASE [OrbisHub]
        TO DISK = @BackupFile
        WITH COMPRESSION, INIT, NAME = ''OrbisHub Full Backup''
    ',
    @database_name = N'master'
GO

EXEC msdb.dbo.sp_add_schedule
    @schedule_name = N'Weekly Sunday',
    @freq_type = 8,
    @freq_interval = 1,
    @active_start_time = 010000
GO

EXEC msdb.dbo.sp_attach_schedule
    @job_name = N'OrbisHub - Weekly Backup',
    @schedule_name = N'Weekly Sunday'
GO
```

### Monthly Index Rebuild Job
```sql
USE [msdb]
GO

EXEC msdb.dbo.sp_add_job
    @job_name = N'OrbisHub - Rebuild Indexes',
    @enabled = 1,
    @description = N'Rebuild indexes monthly'
GO

EXEC msdb.dbo.sp_add_jobstep
    @job_name = N'OrbisHub - Rebuild Indexes',
    @step_name = N'Rebuild All',
    @subsystem = N'TSQL',
    @command = N'
        DECLARE @TableName NVARCHAR(255)
        DECLARE @SQL NVARCHAR(MAX)

        DECLARE TableCursor CURSOR FOR
        SELECT name FROM sys.tables WHERE is_ms_shipped = 0

        OPEN TableCursor
        FETCH NEXT FROM TableCursor INTO @TableName

        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @SQL = ''ALTER INDEX ALL ON ['' + @TableName + ''] REBUILD''
            EXEC sp_executesql @SQL
            FETCH NEXT FROM TableCursor INTO @TableName
        END

        CLOSE TableCursor
        DEALLOCATE TableCursor
    ',
    @database_name = N'OrbisHub'
GO

EXEC msdb.dbo.sp_add_schedule
    @schedule_name = N'Monthly First Sunday',
    @freq_type = 16,
    @freq_interval = 1,
    @freq_relative_interval = 1,
    @active_start_time = 030000
GO

EXEC msdb.dbo.sp_attach_schedule
    @job_name = N'OrbisHub - Rebuild Indexes',
    @schedule_name = N'Monthly First Sunday'
GO
```

## Troubleshooting Installation

### Tab Not Appearing
1. Clear browser cache and restart OrbisHub Desktop
2. Verify files exist in `Functions/DBMaintenance/`
3. Check browser console for JavaScript errors (F12)

### Permission Errors
1. Verify database user permissions:
   ```sql
   -- Check current permissions
   SELECT 
       dp.name AS UserName,
       dp.type_desc AS UserType,
       o.name AS ObjectName,
       p.permission_name,
       p.state_desc
   FROM sys.database_permissions p
   INNER JOIN sys.database_principals dp ON p.grantee_principal_id = dp.principal_id
   LEFT JOIN sys.objects o ON p.major_id = o.object_id
   WHERE dp.name = 'YourDBUser'
   ```

2. Grant missing permissions as needed

### Backup Fails
1. Check SQL Server service account has write access to backup directory
2. Verify path exists on SQL Server machine (not client machine)
3. Try using a local path like `C:\Temp\test.bak` first

### Statistics Not Loading
1. Verify database connection is active
2. Check that tables exist in the database
3. Review browser console for errors
4. Test a simple query in the Messages or Environments tab

## Uninstallation

To remove the DB Maintenance module:

1. Remove the CSS link from `app/index.html`:
   ```html
   <!-- Remove this line -->
   <link rel="stylesheet" href="../Functions/DBMaintenance/db-maintenance-ui.css" />
   ```

2. Remove the JavaScript links from `app/index.html`:
   ```html
   <!-- Remove these lines -->
   <script src="../Functions/DBMaintenance/db-maintenance-service.js"></script>
   <script src="../Functions/DBMaintenance/db-maintenance-ui.js"></script>
   ```

3. Remove the tab from System Configuration (find and remove the DB Maintenance button and content section in `index.html`)

4. Delete the `Functions/DBMaintenance/` directory

5. Remove DB Maintenance case from `SystemConfig.switchTab()` in `app-main.js`

## Support

For issues during installation:
1. Check all file paths are correct
2. Verify database permissions
3. Review browser console for errors (F12)
4. Ensure SQL Server is accessible from the client machine

## Next Steps

After successful installation:
1. Read the [README.md](README.md) for feature documentation
2. Run an initial health check
3. Create your first backup
4. Set up automated maintenance jobs (optional)
5. Establish a regular maintenance schedule
