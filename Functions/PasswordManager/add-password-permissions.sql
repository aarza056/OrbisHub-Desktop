-- =============================================
-- Add Password Manager Permissions
-- =============================================
-- This script adds Password Manager permissions to the existing role system
-- Run this to update existing OrbisHub databases with Password Manager access control
-- =============================================

USE [OrbisHub]
GO

PRINT ''
PRINT '=========================================='
PRINT 'Adding Password Manager Permissions'
PRINT '=========================================='
PRINT ''

-- Track changes
DECLARE @PermissionCount INT = 0
DECLARE @AssignCount INT = 0

-- =============================================
-- 1. ADD PASSWORD MANAGER PERMISSIONS
-- =============================================
PRINT 'Adding password management permissions...'
GO

DECLARE @PermissionCount INT = 0

-- Password Manager permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'passwords', 'view', 'passwords:view', 'View Password Manager and stored passwords', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'passwords:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'passwords', 'create', 'passwords:create', 'Create new passwords in Password Manager', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'passwords:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'passwords', 'edit', 'passwords:edit', 'Edit passwords and manage categories', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'passwords:edit')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'passwords', 'delete', 'passwords:delete', 'Delete passwords from Password Manager', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'passwords:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

PRINT '✓ Added ' + CAST(@PermissionCount AS NVARCHAR) + ' new password permissions'
GO

-- =============================================
-- 2. ASSIGN PERMISSIONS TO ROLES
-- =============================================
PRINT ''
PRINT 'Assigning password permissions to roles...'
GO

DECLARE @AssignCount INT = 0

-- Super Admin: Already has wildcard (*:*), so gets all permissions automatically
PRINT '✓ Super Admin: Has wildcard access to all password permissions'

-- Admin: Gets all password permissions (already included in "all non-role permissions")
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), r.id, p.id
FROM [dbo].[Roles] r
CROSS JOIN [dbo].[Permissions] p
WHERE r.name = 'admin' 
  AND p.resource = 'passwords'
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[RolePermissions] 
      WHERE roleId = r.id AND permissionId = p.id
  )
SET @AssignCount = @AssignCount + @@ROWCOUNT

PRINT '✓ Admin: Assigned ' + CAST(@AssignCount AS NVARCHAR) + ' password permissions'

-- Remove any password permissions from Manager, Operator, and Viewer roles
DELETE rp
FROM [dbo].[RolePermissions] rp
INNER JOIN [dbo].[Roles] r ON rp.roleId = r.id
INNER JOIN [dbo].[Permissions] p ON rp.permissionId = p.id
WHERE r.name IN ('manager', 'operator', 'viewer')
  AND p.resource = 'passwords'

PRINT '✓ Manager/Operator/Viewer: Excluded from password access'
GO

-- =============================================
-- 3. SUMMARY
-- =============================================
PRINT ''
PRINT '=========================================='
PRINT 'Password Manager Permissions Summary'
PRINT '=========================================='
PRINT ''
PRINT 'Permissions Added:'
SELECT resource, action, permission, description
FROM [dbo].[Permissions]
WHERE resource = 'passwords'
ORDER BY action
GO

PRINT ''
PRINT 'Role Access:'
SELECT 
    r.name AS [Role],
    r.display_name AS [Display Name],
    COUNT(DISTINCT p.id) AS [Password Permissions]
FROM [dbo].[Roles] r
LEFT JOIN [dbo].[RolePermissions] rp ON r.id = rp.roleId
LEFT JOIN [dbo].[Permissions] p ON rp.permissionId = p.id AND (p.resource = 'passwords' OR p.permission = '*:*')
GROUP BY r.name, r.display_name
ORDER BY 
    CASE r.name
        WHEN 'super_admin' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'manager' THEN 3
        WHEN 'operator' THEN 4
        WHEN 'viewer' THEN 5
        ELSE 6
    END
GO

PRINT ''
PRINT '✓ Password Manager is now restricted to Admin and Super Admin roles only'
PRINT ''
