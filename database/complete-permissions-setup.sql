-- =============================================
-- OrbisHub COMPLETE Database Setup Script
-- Version: 2.0.0
-- Created: 2025-12-09
-- =============================================
-- This script should be run AFTER the main.js migrations
-- It adds the complete permissions system with all updates
-- =============================================

USE [OrbisHub]
GO

PRINT '========================================='
PRINT 'Starting OrbisHub Permissions System Setup'
PRINT '========================================='
PRINT ''

-- Note: Tables Permissions, Roles, RolePermissions, UserRoles, PermissionAuditLog
-- are already created by main.js migrations. This script only SEEDS the data.

-- =============================================
-- SEED PERMISSIONS (Complete List)
-- =============================================
PRINT 'Seeding permissions...'
GO

DECLARE @PermCount INT = 0

-- Delete old incomplete permissions if they exist
DELETE FROM [dbo].[RolePermissions]
DELETE FROM [dbo].[Permissions]
DELETE FROM [dbo].[UserRoles]
DELETE FROM [dbo].[Roles]

-- Users
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES 
(NEWID(), 'users', 'view', 'users:view', 'View user list and details', 'User Management'),
(NEWID(), 'users', 'create', 'users:create', 'Create new users', 'User Management'),
(NEWID(), 'users', 'edit', 'users:edit', 'Edit user details and settings', 'User Management'),
(NEWID(), 'users', 'delete', 'users:delete', 'Delete users from system', 'User Management'),
(NEWID(), 'users', 'reset_password', 'users:reset_password', 'Reset user passwords', 'User Management'),
(NEWID(), 'users', 'manage', 'users:manage', 'Full user management access', 'User Management')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Environments  
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'environments', 'view', 'environments:view', 'View environments', 'Environment Management'),
(NEWID(), 'environments', 'create', 'environments:create', 'Create new environments', 'Environment Management'),
(NEWID(), 'environments', 'edit', 'environments:edit', 'Edit environment configurations', 'Environment Management'),
(NEWID(), 'environments', 'delete', 'environments:delete', 'Delete environments', 'Environment Management'),
(NEWID(), 'environments', 'execute', 'environments:execute', 'Deploy and execute environment actions', 'Environment Management')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Servers
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'servers', 'view', 'servers:view', 'View server configurations', 'Server Management'),
(NEWID(), 'servers', 'create', 'servers:create', 'Add new servers', 'Server Management'),
(NEWID(), 'servers', 'edit', 'servers:edit', 'Edit server details', 'Server Management'),
(NEWID(), 'servers', 'delete', 'servers:delete', 'Delete servers', 'Server Management'),
(NEWID(), 'servers', 'execute', 'servers:execute', 'Connect and execute server actions', 'Server Management')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Databases
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'databases', 'view', 'databases:view', 'View database configurations', 'Data Management'),
(NEWID(), 'databases', 'create', 'databases:create', 'Add new database connections', 'Data Management'),
(NEWID(), 'databases', 'edit', 'databases:edit', 'Edit database configurations', 'Data Management'),
(NEWID(), 'databases', 'delete', 'databases:delete', 'Delete database connections', 'Data Management'),
(NEWID(), 'databases', 'execute', 'databases:execute', 'Run database maintenance operations', 'Data Management')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Credentials
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'credentials', 'view', 'credentials:view', 'View stored credentials', 'Credentials Management'),
(NEWID(), 'credentials', 'create', 'credentials:create', 'Create new credentials', 'Credentials Management'),
(NEWID(), 'credentials', 'edit', 'credentials:edit', 'Edit credential details', 'Credentials Management'),
(NEWID(), 'credentials', 'delete', 'credentials:delete', 'Delete credentials', 'Credentials Management'),
(NEWID(), 'credentials', 'reveal', 'credentials:reveal', 'View decrypted passwords', 'Security')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Password Manager (ADMIN ONLY)
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'passwords', 'view', 'passwords:view', 'View Password Manager and stored passwords', 'Security'),
(NEWID(), 'passwords', 'create', 'passwords:create', 'Create new passwords in Password Manager', 'Security'),
(NEWID(), 'passwords', 'edit', 'passwords:edit', 'Edit passwords and manage categories', 'Security'),
(NEWID(), 'passwords', 'delete', 'passwords:delete', 'Delete passwords from Password Manager', 'Security')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Messages
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'messages', 'view', 'messages:view', 'View messages', 'Communication'),
(NEWID(), 'messages', 'create', 'messages:create', 'Create and send messages', 'Communication'),
(NEWID(), 'messages', 'delete', 'messages:delete', 'Delete messages', 'Communication')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Files
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'files', 'view', 'files:view', 'View file attachments', 'File Management'),
(NEWID(), 'files', 'upload', 'files:upload', 'Upload file attachments', 'File Management'),
(NEWID(), 'files', 'download', 'files:download', 'Download file attachments', 'File Management'),
(NEWID(), 'files', 'delete', 'files:delete', 'Delete file attachments', 'File Management')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Audit
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'audit', 'view', 'audit:view', 'View audit logs', 'Audit'),
(NEWID(), 'audit', 'export', 'audit:export', 'Export audit logs', 'Audit'),
(NEWID(), 'audit', 'delete', 'audit:delete', 'Clear audit logs', 'Audit')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Roles
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'roles', 'view', 'roles:view', 'View roles and permissions', 'Role Management'),
(NEWID(), 'roles', 'create', 'roles:create', 'Create new roles', 'Role Management'),
(NEWID(), 'roles', 'edit', 'roles:edit', 'Edit role permissions', 'Role Management'),
(NEWID(), 'roles', 'delete', 'roles:delete', 'Delete custom roles', 'Role Management'),
(NEWID(), 'roles', 'assign', 'roles:assign', 'Assign roles to users', 'Role Management')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Settings
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'settings', 'view', 'settings:view', 'View system settings', 'System'),
(NEWID(), 'settings', 'edit', 'settings:edit', 'Edit system settings', 'System'),
(NEWID(), 'settings', 'delete', 'settings:delete', 'Delete system data (Clear All Data)', 'System')
SET @PermCount = @PermCount + @@ROWCOUNT

-- System/Infrastructure
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES
(NEWID(), 'system', 'view', 'system:view', 'View system information', 'System'),
(NEWID(), 'system', 'edit', 'system:edit', 'Edit system configuration', 'System'),
(NEWID(), 'agents', 'view', 'agents:view', 'View OrbisAgent status', 'Infrastructure'),
(NEWID(), 'agents', 'manage', 'agents:manage', 'Manage OrbisAgent deployments', 'Infrastructure')
SET @PermCount = @PermCount + @@ROWCOUNT

-- Wildcard (Super Admin only)
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
VALUES (NEWID(), '*', '*', '*:*', 'Full system access (Super Admin)', 'System')
SET @PermCount = @PermCount + @@ROWCOUNT

PRINT '✓ Seeded ' + CAST(@PermCount AS NVARCHAR) + ' permissions'
GO

-- =============================================
-- SEED ROLES
-- =============================================
PRINT 'Seeding roles...'
GO

DECLARE @SuperAdminId NVARCHAR(50) = '39AB95FD-D70F-420B-A241-27F0F7EB58FC'
DECLARE @AdminId NVARCHAR(50) = 'F7C8A9E3-5B2D-4F6E-8A1C-3D9E7B4F2A8C'
DECLARE @ManagerId NVARCHAR(50) = 'E4D6B8F2-9A3C-4E7D-B1A5-8C2F9E3D7B6A'
DECLARE @OperatorId NVARCHAR(50) = 'C3A7E5D9-2B4F-4A8E-9C1D-7E3B8F2A5C9D'
DECLARE @ViewerId NVARCHAR(50) = 'B2F8D4A6-7C3E-4D9B-8A2F-5E1C9D3B7F4A'

INSERT INTO [dbo].[Roles] (id, name, displayName, description, color, icon, level, isSystem, isActive)
VALUES
(@SuperAdminId, 'super_admin', 'Super Administrator', 'Full system access with all permissions', '#dc2626', '👑', 100, 1, 1),
(@AdminId, 'admin', 'Administrator', 'Administrative access (cannot manage roles)', '#f97316', '🔑', 90, 1, 1),
(@ManagerId, 'manager', 'Manager', 'Can manage environments, servers, and databases', '#3b82f6', '📊', 70, 1, 1),
(@OperatorId, 'operator', 'Operator', 'Can execute operations on environments and servers', '#10b981', '⚙️', 50, 1, 1),
(@ViewerId, 'viewer', 'Viewer', 'Read-only access to view resources', '#6b7280', '👁️', 10, 1, 1)

PRINT '✓ Seeded 5 system roles'
GO

-- =============================================
-- ASSIGN PERMISSIONS TO ROLES
-- =============================================
PRINT 'Assigning permissions to roles...'
GO

DECLARE @AssignCount INT = 0
DECLARE @SuperAdminId NVARCHAR(50) = '39AB95FD-D70F-420B-A241-27F0F7EB58FC'
DECLARE @AdminId NVARCHAR(50) = 'F7C8A9E3-5B2D-4F6E-8A1C-3D9E7B4F2A8C'
DECLARE @ManagerId NVARCHAR(50) = 'E4D6B8F2-9A3C-4E7D-B1A5-8C2F9E3D7B6A'
DECLARE @OperatorId NVARCHAR(50) = 'C3A7E5D9-2B4F-4A8E-9C1D-7E3B8F2A5C9D'
DECLARE @ViewerId NVARCHAR(50) = 'B2F8D4A6-7C3E-4D9B-8A2F-5E1C9D3B7F4A'

-- Super Admin: ALL permissions including wildcard
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), @SuperAdminId, p.id
FROM [dbo].[Permissions] p
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Admin: All permissions EXCEPT roles and wildcard (includes passwords)
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), @AdminId, p.id
FROM [dbo].[Permissions] p
WHERE p.resource NOT IN ('roles', '*')
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Admin can VIEW roles but not modify
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), @AdminId, p.id
FROM [dbo].[Permissions] p
WHERE p.permission = 'roles:view'
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Manager: View all + manage envs/servers/databases (NO passwords)
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), @ManagerId, p.id
FROM [dbo].[Permissions] p
WHERE (
    p.action = 'view' OR
    p.permission IN (
        'environments:create', 'environments:edit', 'environments:delete', 'environments:execute',
        'servers:create', 'servers:edit', 'servers:delete', 'servers:execute',
        'databases:create', 'databases:edit', 'databases:delete', 'databases:execute',
        'credentials:create', 'credentials:edit'
    )
)
AND p.resource != 'passwords'
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Operator: Execute on envs/servers/databases + manage files/messages (NO passwords)
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), @OperatorId, p.id
FROM [dbo].[Permissions] p
WHERE (
    p.resource IN ('environments', 'servers', 'databases', 'credentials', 'files', 'messages', 'agents') AND
    p.action IN ('view', 'create', 'edit', 'execute', 'upload', 'download')
) AND p.resource != 'passwords'
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Viewer: View-only (NO roles, settings, or passwords)
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), @ViewerId, p.id
FROM [dbo].[Permissions] p
WHERE p.action = 'view'
AND p.resource NOT IN ('roles', 'settings', 'passwords', '*')
SET @AssignCount = @AssignCount + @@ROWCOUNT

PRINT '✓ Assigned ' + CAST(@AssignCount AS NVARCHAR) + ' role-permission mappings'
GO

-- =============================================
-- CREATE/UPDATE VIEWS
-- =============================================
PRINT 'Creating views...'
GO

-- Drop and recreate vw_UserPermissions with correct column names
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_UserPermissions')
    DROP VIEW [dbo].[vw_UserPermissions]
GO

CREATE VIEW [dbo].[vw_UserPermissions] AS
SELECT 
    u.id AS userId,
    u.username AS username,
    u.name AS userFullName,
    r.name AS roleName,
    r.displayName AS roleDisplayName,
    p.permission AS permission,
    p.resource AS resource,
    p.action AS [action],
    p.description AS permissionDescription,
    p.category AS category
FROM [dbo].[Users] u
INNER JOIN [dbo].[UserRoles] ur ON u.id = ur.userId
INNER JOIN [dbo].[Roles] r ON ur.roleId = r.id
INNER JOIN [dbo].[RolePermissions] rp ON r.id = rp.roleId
INNER JOIN [dbo].[Permissions] p ON rp.permissionId = p.id
WHERE u.isActive = 1 AND r.isActive = 1 AND p.isActive = 1
GO

PRINT '✓ Created vw_UserPermissions view'
GO

-- Drop and recreate vw_RoleSummary
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_RoleSummary')
    DROP VIEW [dbo].[vw_RoleSummary]
GO

CREATE VIEW [dbo].[vw_RoleSummary] AS
SELECT 
    r.id AS roleId,
    r.name AS roleName,
    r.displayName,
    r.description,
    r.color,
    r.level,
    COUNT(DISTINCT rp.permissionId) AS permissionCount,
    COUNT(DISTINCT ur.userId) AS userCount
FROM [dbo].[Roles] r
LEFT JOIN [dbo].[RolePermissions] rp ON r.id = rp.roleId
LEFT JOIN [dbo].[UserRoles] ur ON r.id = ur.roleId
WHERE r.isActive = 1
GROUP BY r.id, r.name, r.displayName, r.description, r.color, r.level
GO

PRINT '✓ Created vw_RoleSummary view'
GO

-- =============================================
-- CREATE/UPDATE STORED PROCEDURES
-- =============================================
PRINT 'Creating stored procedures...'
GO

-- sp_CheckUserPermission
IF OBJECT_ID('sp_CheckUserPermission', 'P') IS NOT NULL
    DROP PROCEDURE sp_CheckUserPermission
GO

CREATE PROCEDURE sp_CheckUserPermission
    @userId NVARCHAR(50),
    @permission NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Check for wildcard permission
    IF EXISTS (
        SELECT 1 FROM [dbo].[vw_UserPermissions]
        WHERE userId = @userId AND permission = '*:*'
    )
    BEGIN
        SELECT 1 AS hasPermission
        RETURN
    END
    
    -- Check for exact permission
    IF EXISTS (
        SELECT 1 FROM [dbo].[vw_UserPermissions]
        WHERE userId = @userId AND permission = @permission
    )
    BEGIN
        SELECT 1 AS hasPermission
        RETURN
    END
    
    -- Check for resource wildcard (e.g., users:* matches users:create)
    DECLARE @resource NVARCHAR(50) = LEFT(@permission, CHARINDEX(':', @permission) - 1)
    DECLARE @resourceWildcard NVARCHAR(100) = @resource + ':*'
    
    IF EXISTS (
        SELECT 1 FROM [dbo].[vw_UserPermissions]
        WHERE userId = @userId AND permission = @resourceWildcard
    )
    BEGIN
        SELECT 1 AS hasPermission
        RETURN
    END
    
    -- No permission found
    SELECT 0 AS hasPermission
END
GO

PRINT '✓ Created sp_CheckUserPermission'
GO

-- sp_GetUserPermissions
IF OBJECT_ID('sp_GetUserPermissions', 'P') IS NOT NULL
    DROP PROCEDURE sp_GetUserPermissions
GO

CREATE PROCEDURE sp_GetUserPermissions
    @userId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT DISTINCT
        p.permission,
        p.resource,
        p.action,
        p.description,
        p.category
    FROM [dbo].[vw_UserPermissions] vup
    INNER JOIN [dbo].[Permissions] p ON vup.permission = p.permission
    WHERE vup.userId = @userId
    ORDER BY p.category, p.resource, p.action
END
GO

PRINT '✓ Created sp_GetUserPermissions'
GO

-- =============================================
-- MIGRATE EXISTING USERS TO ROLES
-- =============================================
PRINT 'Migrating existing users to role-based system...'
GO

DECLARE @MigrateCount INT = 0
DECLARE @SuperAdminId NVARCHAR(50) = '39AB95FD-D70F-420B-A241-27F0F7EB58FC'
DECLARE @AdminId NVARCHAR(50) = 'F7C8A9E3-5B2D-4F6E-8A1C-3D9E7B4F2A8C'
DECLARE @ManagerId NVARCHAR(50) = 'E4D6B8F2-9A3C-4E7D-B1A5-8C2F9E3D7B6A'
DECLARE @OperatorId NVARCHAR(50) = 'C3A7E5D9-2B4F-4A8E-9C1D-7E3B8F2A5C9D'
DECLARE @ViewerId NVARCHAR(50) = 'B2F8D4A6-7C3E-4D9B-8A2F-5E1C9D3B7F4A'

-- Map users based on their role column
INSERT INTO [dbo].[UserRoles] (id, userId, roleId)
SELECT NEWID(), u.id,
    CASE 
        WHEN LOWER(u.role) LIKE '%super admin%' OR LOWER(u.role) = 'superadmin' THEN @SuperAdminId
        WHEN LOWER(u.role) = 'admin' THEN @AdminId
        WHEN LOWER(u.role) = 'manager' THEN @ManagerId
        WHEN LOWER(u.role) = 'operator' THEN @OperatorId
        WHEN LOWER(u.role) = 'viewer' THEN @ViewerId
        ELSE @ViewerId -- Default to viewer if unknown
    END
FROM [dbo].[Users] u
WHERE u.isActive = 1
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[UserRoles] ur WHERE ur.userId = u.id
)

SET @MigrateCount = @@ROWCOUNT
PRINT '✓ Migrated ' + CAST(@MigrateCount AS NVARCHAR) + ' users to role-based system'
GO

PRINT ''
PRINT '========================================='
PRINT '✓ OrbisHub Permissions System Complete!'
PRINT '========================================='
PRINT ''
PRINT 'Summary:'
PRINT '  • 5 System Roles created'
PRINT '  • 50+ Permissions defined'
PRINT '  • Role-Permission mappings configured'
PRINT '  • Views and stored procedures created'
PRINT '  • Existing users migrated to new system'
PRINT ''
PRINT 'Password Manager is ADMIN-ONLY'
PRINT 'All critical operations are protected'
PRINT ''
GO
