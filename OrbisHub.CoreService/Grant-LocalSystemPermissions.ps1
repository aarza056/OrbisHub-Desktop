# Grant NT AUTHORITY\SYSTEM full permissions to OrbisHub database
# Run this script with elevated privileges on the SQL Server

$sqlScript = @"
USE master;
GO

-- Create login for Local System account if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = N'NT AUTHORITY\SYSTEM')
BEGIN
    CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS;
END
GO

-- Grant sysadmin role to Local System (full privileges)
ALTER SERVER ROLE sysadmin ADD MEMBER [NT AUTHORITY\SYSTEM];
GO

-- Or for database-specific permissions (use this instead if you don't want sysadmin):
USE OrbisHub;
GO

IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = N'NT AUTHORITY\SYSTEM')
BEGIN
    CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
END
GO

ALTER ROLE db_owner ADD MEMBER [NT AUTHORITY\SYSTEM];
GO

PRINT 'Permissions granted successfully to NT AUTHORITY\SYSTEM';
"@

# Save the SQL script to a temporary file
$tempSqlFile = "$env:TEMP\grant_system_permissions.sql"
$sqlScript | Out-File -FilePath $tempSqlFile -Encoding UTF8

Write-Host "SQL Script created at: $tempSqlFile" -ForegroundColor Green
Write-Host ""
Write-Host "Executing SQL script..." -ForegroundColor Yellow

# Execute the SQL script using sqlcmd
try {
    sqlcmd -S localhost -E -i $tempSqlFile
    Write-Host ""
    Write-Host "Permissions granted successfully!" -ForegroundColor Green
    Write-Host "NT AUTHORITY\SYSTEM now has full access to the OrbisHub database" -ForegroundColor Green
}
catch {
    Write-Host "Error executing SQL script: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run the following SQL manually in SQL Server Management Studio:" -ForegroundColor Yellow
    Write-Host $sqlScript -ForegroundColor Cyan
}
finally {
    # Clean up temp file
    if (Test-Path $tempSqlFile) {
        Remove-Item $tempSqlFile -Force
    }
}
