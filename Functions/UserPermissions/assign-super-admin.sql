-- =============================================
-- Auto-Assign Super Admin Role to First Admin User
-- =============================================
-- This script automatically assigns the Super Admin role to the first
-- admin user if no Super Admin role has been assigned yet.
--
-- Run this script if:
-- - You've already set up the permissions system
-- - Your admin user doesn't have Super Admin privileges
-- - You can't see the "Create Custom Role" button
--
-- Usage: Execute this script in SQL Server Management Studio
-- =============================================

USE [OrbisHub]
GO

PRINT ''
PRINT '=========================================='
PRINT 'Auto-Assign Super Admin Role'
PRINT '=========================================='
PRINT ''

-- Check if Super Admin role exists
IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE name = 'super_admin')
BEGIN
    PRINT '✗ Super Admin role not found. Please run permissions-schema.sql first.'
    RETURN
END

-- Check if any user already has Super Admin
IF EXISTS (
    SELECT 1 FROM [dbo].[UserRoles] ur
    INNER JOIN [dbo].[Roles] r ON ur.roleId = r.id
    WHERE r.name = 'super_admin'
)
BEGIN
    PRINT 'ℹ Super Admin role is already assigned.'
    
    -- Show who has Super Admin
    SELECT 
        u.username,
        u.name,
        u.email,
        r.displayName AS role
    FROM [dbo].[Users] u
    INNER JOIN [dbo].[UserRoles] ur ON u.id = ur.userId
    INNER JOIN [dbo].[Roles] r ON ur.roleId = r.id
    WHERE r.name = 'super_admin'
    
    PRINT ''
    PRINT 'If you need to assign Super Admin to a different user,'
    PRINT 'please use the Permissions UI or modify the script manually.'
    RETURN
END

PRINT 'No Super Admin found. Assigning to first admin user...'
PRINT ''

-- Auto-assign Super Admin to the first admin user
DECLARE @AssignedCount INT = 0

INSERT INTO [dbo].[UserRoles] (id, userId, roleId, assigned_at)
SELECT TOP 1 
    NEWID(), 
    u.id, 
    r.id,
    GETDATE()
FROM [dbo].[Users] u
CROSS JOIN [dbo].[Roles] r
WHERE 
    LOWER(u.role) = 'admin' 
    AND r.name = 'super_admin'
    AND u.isActive = 1
ORDER BY u.created_at ASC

SET @AssignedCount = @@ROWCOUNT

IF @AssignedCount > 0
BEGIN
    PRINT '✓ Super Admin role assigned successfully!'
    PRINT ''
    
    -- Show the assigned user
    SELECT 
        u.username,
        u.name,
        u.email,
        r.displayName AS newRole,
        ur.assigned_at
    FROM [dbo].[Users] u
    INNER JOIN [dbo].[UserRoles] ur ON u.id = ur.userId
    INNER JOIN [dbo].[Roles] r ON ur.roleId = r.id
    WHERE r.name = 'super_admin'
    
    PRINT ''
    PRINT 'Please log out and log back in for changes to take effect.'
END
ELSE
BEGIN
    PRINT '✗ No admin users found to assign Super Admin role.'
    PRINT ''
    PRINT 'Please check:'
    PRINT '  1. You have at least one user with role = ''Admin'''
    PRINT '  2. The user is active (isActive = 1)'
    PRINT ''
    
    -- Show all admin users
    PRINT 'Current admin users:'
    SELECT username, name, email, role, isActive
    FROM [dbo].[Users]
    WHERE LOWER(role) = 'admin'
END

PRINT ''
PRINT '=========================================='
PRINT 'Script Complete'
PRINT '=========================================='
GO
