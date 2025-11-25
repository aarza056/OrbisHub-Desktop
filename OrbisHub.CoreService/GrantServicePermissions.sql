USE [master]
GO
-- Create login for NT AUTHORITY\SYSTEM if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'NT AUTHORITY\SYSTEM')
BEGIN
    CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS;
END
GO

USE [OrbisHub]
GO
-- Create user for NT AUTHORITY\SYSTEM
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'NT AUTHORITY\SYSTEM')
BEGIN
    CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
END
GO

-- Grant necessary permissions
ALTER ROLE [db_datareader] ADD MEMBER [NT AUTHORITY\SYSTEM];
ALTER ROLE [db_datawriter] ADD MEMBER [NT AUTHORITY\SYSTEM];
GO

PRINT 'Permissions granted successfully to NT AUTHORITY\SYSTEM'
