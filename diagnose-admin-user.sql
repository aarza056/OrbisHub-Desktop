-- Diagnostic Script: Check Admin User Creation
-- Run this on your OrbisHub database to diagnose the issue

-- 1. Check if Users table exists
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
    PRINT '✓ Users table exists'
ELSE
    PRINT '✗ Users table does NOT exist - run migrations first!'

-- 2. Check table structure
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    PRINT ''
    PRINT 'Users table columns:'
    SELECT 
        COLUMN_NAME, 
        DATA_TYPE, 
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Users'
    ORDER BY ORDINAL_POSITION
END

-- 3. Check for existing users
PRINT ''
PRINT 'Existing users in database:'
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    SELECT 
        id,
        username,
        name,
        email,
        role,
        isActive,
        changePasswordOnLogin,
        created_at
    FROM Users
    ORDER BY created_at DESC
    
    IF @@ROWCOUNT = 0
        PRINT 'No users found in database!'
END

-- 4. Try to manually create admin user (for testing)
PRINT ''
PRINT 'Attempting to manually create admin user...'

-- First, delete any existing admin user
IF EXISTS (SELECT * FROM Users WHERE username = 'admin')
BEGIN
    DELETE FROM Users WHERE username = 'admin'
    PRINT 'Deleted existing admin user'
END

-- Create admin user with plain text password (for testing only - you should use hashed passwords)
DECLARE @adminId NVARCHAR(50) = NEWID()
DECLARE @hashedPassword NVARCHAR(255) = 'admin' -- This should be hashed in production!

BEGIN TRY
    INSERT INTO Users (
        id, username, password, name, email, role, position, squad,
        lastLogin, lastActivity, ip, isActive, changePasswordOnLogin, created_at
    ) 
    VALUES (
        @adminId, 
        'admin', 
        @hashedPassword,
        'Administrator', 
        'admin@orbishub.com', 
        'Super Admin', 
        'System Administrator', 
        'IT Operations',
        0, -- lastLogin as bigint
        0, -- lastActivity as bigint  
        '127.0.0.1',
        1, -- isActive
        0, -- changePasswordOnLogin (set to 0 for testing)
        GETDATE()
    )
    
    PRINT '✓ Admin user created successfully!'
    PRINT 'Username: admin'
    PRINT 'Password: admin'
    PRINT 'User ID: ' + @adminId
END TRY
BEGIN CATCH
    PRINT '✗ Failed to create admin user'
    PRINT 'Error: ' + ERROR_MESSAGE()
    PRINT 'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR)
    PRINT 'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR)
END CATCH

-- 5. Verify the user was created
PRINT ''
PRINT 'Verification - Current users:'
SELECT 
    id,
    username,
    name,
    email,
    role,
    isActive,
    created_at
FROM Users
WHERE username = 'admin'
