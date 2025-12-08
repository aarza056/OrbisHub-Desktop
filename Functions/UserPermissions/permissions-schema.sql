-- =============================================
-- OrbisHub Permissions System - Database Schema
-- Version: 1.0.0
-- Created: 2025-12-08
-- =============================================

USE [OrbisHub]
GO

-- =============================================
-- 1. PERMISSIONS TABLE
-- Master list of all available permissions in the system
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Permissions')
BEGIN
    CREATE TABLE [dbo].[Permissions] (
        [id] NVARCHAR(50) PRIMARY KEY,
        [resource] NVARCHAR(50) NOT NULL,         -- e.g., 'users', 'servers', 'credentials'
        [action] NVARCHAR(50) NOT NULL,           -- e.g., 'view', 'create', 'edit', 'delete'
        [permission] NVARCHAR(100) NOT NULL UNIQUE, -- Combined: 'users:view', 'servers:delete'
        [description] NVARCHAR(255),
        [category] NVARCHAR(50),                  -- Group permissions: 'User Management', 'Infrastructure'
        [isActive] BIT DEFAULT 1,
        [created_at] DATETIME DEFAULT GETDATE()
    )
    
    CREATE INDEX IX_Permissions_Resource ON [dbo].[Permissions]([resource])
    CREATE INDEX IX_Permissions_Action ON [dbo].[Permissions]([action])
    CREATE INDEX IX_Permissions_Permission ON [dbo].[Permissions]([permission])
    
    PRINT '✓ Created Permissions table'
END
ELSE
    PRINT 'ℹ Permissions table already exists'
GO

-- =============================================
-- 2. ROLES TABLE
-- Define system roles with metadata
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Roles')
BEGIN
    CREATE TABLE [dbo].[Roles] (
        [id] NVARCHAR(50) PRIMARY KEY,
        [name] NVARCHAR(100) NOT NULL UNIQUE,
        [displayName] NVARCHAR(100),
        [description] NVARCHAR(500),
        [color] NVARCHAR(20),                     -- UI color code
        [icon] NVARCHAR(50),                      -- UI icon identifier
        [level] INT DEFAULT 0,                    -- Role hierarchy (higher = more privileges)
        [isSystem] BIT DEFAULT 0,                 -- System role (cannot be deleted)
        [isActive] BIT DEFAULT 1,
        [created_at] DATETIME DEFAULT GETDATE(),
        [updated_at] DATETIME DEFAULT GETDATE()
    )
    
    CREATE INDEX IX_Roles_Name ON [dbo].[Roles]([name])
    CREATE INDEX IX_Roles_Level ON [dbo].[Roles]([level])
    
    PRINT '✓ Created Roles table'
END
ELSE
    PRINT 'ℹ Roles table already exists'
GO

-- =============================================
-- 3. ROLE PERMISSIONS TABLE
-- Many-to-many relationship between Roles and Permissions
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RolePermissions')
BEGIN
    CREATE TABLE [dbo].[RolePermissions] (
        [id] NVARCHAR(50) PRIMARY KEY,
        [roleId] NVARCHAR(50) NOT NULL,
        [permissionId] NVARCHAR(50) NOT NULL,
        [granted_by] NVARCHAR(50),                -- User ID who granted this permission
        [granted_at] DATETIME DEFAULT GETDATE(),
        
        CONSTRAINT FK_RolePermissions_Role FOREIGN KEY ([roleId]) 
            REFERENCES [dbo].[Roles]([id]) ON DELETE CASCADE,
        CONSTRAINT FK_RolePermissions_Permission FOREIGN KEY ([permissionId]) 
            REFERENCES [dbo].[Permissions]([id]) ON DELETE CASCADE,
        CONSTRAINT UQ_RolePermission UNIQUE ([roleId], [permissionId])
    )
    
    CREATE INDEX IX_RolePermissions_RoleId ON [dbo].[RolePermissions]([roleId])
    CREATE INDEX IX_RolePermissions_PermissionId ON [dbo].[RolePermissions]([permissionId])
    
    PRINT '✓ Created RolePermissions table'
END
ELSE
    PRINT 'ℹ RolePermissions table already exists'
GO

-- =============================================
-- 4. USER ROLES TABLE
-- Many-to-many relationship between Users and Roles
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserRoles')
BEGIN
    CREATE TABLE [dbo].[UserRoles] (
        [id] NVARCHAR(50) PRIMARY KEY,
        [userId] NVARCHAR(50) NOT NULL,
        [roleId] NVARCHAR(50) NOT NULL,
        [assigned_by] NVARCHAR(50),               -- User ID who assigned this role
        [assigned_at] DATETIME DEFAULT GETDATE(),
        [expires_at] DATETIME NULL,               -- Optional: temporary role assignment
        
        CONSTRAINT FK_UserRoles_User FOREIGN KEY ([userId]) 
            REFERENCES [dbo].[Users]([id]) ON DELETE CASCADE,
        CONSTRAINT FK_UserRoles_Role FOREIGN KEY ([roleId]) 
            REFERENCES [dbo].[Roles]([id]) ON DELETE CASCADE,
        CONSTRAINT UQ_UserRole UNIQUE ([userId], [roleId])
    )
    
    CREATE INDEX IX_UserRoles_UserId ON [dbo].[UserRoles]([userId])
    CREATE INDEX IX_UserRoles_RoleId ON [dbo].[UserRoles]([roleId])
    
    PRINT '✓ Created UserRoles table'
END
ELSE
    PRINT 'ℹ UserRoles table already exists'
GO

-- =============================================
-- 5. PERMISSION AUDIT LOG
-- Track permission and role changes
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PermissionAuditLog')
BEGIN
    CREATE TABLE [dbo].[PermissionAuditLog] (
        [id] NVARCHAR(50) PRIMARY KEY,
        [action] NVARCHAR(50) NOT NULL,           -- 'grant', 'revoke', 'role_assign', 'role_remove'
        [entityType] NVARCHAR(50) NOT NULL,       -- 'permission', 'role', 'user'
        [entityId] NVARCHAR(50) NOT NULL,
        [targetId] NVARCHAR(50),                  -- User or Role affected
        [performedBy] NVARCHAR(50) NOT NULL,      -- User who performed action
        [details] NVARCHAR(MAX),                  -- JSON metadata
        [ipAddress] NVARCHAR(50),
        [created_at] DATETIME DEFAULT GETDATE()
    )
    
    CREATE INDEX IX_PermissionAudit_Action ON [dbo].[PermissionAuditLog]([action])
    CREATE INDEX IX_PermissionAudit_PerformedBy ON [dbo].[PermissionAuditLog]([performedBy])
    CREATE INDEX IX_PermissionAudit_CreatedAt ON [dbo].[PermissionAuditLog]([created_at])
    
    PRINT '✓ Created PermissionAuditLog table'
END
ELSE
    PRINT 'ℹ PermissionAuditLog table already exists'
GO

-- =============================================
-- 6. SEED DEFAULT PERMISSIONS
-- =============================================
PRINT ''
PRINT 'Seeding default permissions...'
GO

-- Helper function to generate permission ID
DECLARE @PermissionCount INT = 0

-- Users permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'users', 'view', 'users:view', 'View user list and details', 'User Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'users:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'users', 'create', 'users:create', 'Create new users', 'User Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'users:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'users', 'edit', 'users:edit', 'Edit user details and settings', 'User Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'users:edit')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'users', 'delete', 'users:delete', 'Delete users from system', 'User Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'users:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'users', 'reset_password', 'users:reset_password', 'Reset user passwords', 'User Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'users:reset_password')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Environment permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'environments', 'view', 'environments:view', 'View environments and farm systems', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'environments:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'environments', 'create', 'environments:create', 'Create new environments', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'environments:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'environments', 'edit', 'environments:edit', 'Edit environment configurations', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'environments:edit')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'environments', 'delete', 'environments:delete', 'Delete environments', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'environments:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Server permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'servers', 'view', 'servers:view', 'View server configurations', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'servers:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'servers', 'create', 'servers:create', 'Add new servers', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'servers:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'servers', 'edit', 'servers:edit', 'Edit server details', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'servers:edit')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'servers', 'delete', 'servers:delete', 'Delete servers', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'servers:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'servers', 'execute', 'servers:execute', 'Test connections and execute server actions', 'Infrastructure'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'servers:execute')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Database permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'databases', 'view', 'databases:view', 'View database configurations', 'Data Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'databases:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'databases', 'create', 'databases:create', 'Add new database connections', 'Data Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'databases:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'databases', 'edit', 'databases:edit', 'Edit database configurations', 'Data Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'databases:edit')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'databases', 'delete', 'databases:delete', 'Delete database connections', 'Data Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'databases:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'databases', 'execute', 'databases:execute', 'Test database connections', 'Data Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'databases:execute')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Credentials permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'credentials', 'view', 'credentials:view', 'View stored credentials', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'credentials:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'credentials', 'create', 'credentials:create', 'Create new credentials', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'credentials:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'credentials', 'edit', 'credentials:edit', 'Edit credential details', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'credentials:edit')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'credentials', 'delete', 'credentials:delete', 'Delete credentials', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'credentials:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'credentials', 'reveal', 'credentials:reveal', 'View decrypted passwords', 'Security'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'credentials:reveal')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

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

-- Messages permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'messages', 'view', 'messages:view', 'View messages', 'Communication'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'messages:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'messages', 'create', 'messages:create', 'Create and send messages', 'Communication'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'messages:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'messages', 'delete', 'messages:delete', 'Delete messages', 'Communication'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'messages:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Files permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'files', 'view', 'files:view', 'View file attachments', 'File Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'files:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'files', 'upload', 'files:upload', 'Upload file attachments', 'File Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'files:upload')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'files', 'download', 'files:download', 'Download file attachments', 'File Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'files:download')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'files', 'delete', 'files:delete', 'Delete file attachments', 'File Management'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'files:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Audit permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'audit', 'view', 'audit:view', 'View audit logs', 'System'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'audit:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'audit', 'export', 'audit:export', 'Export audit logs', 'System'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'audit:export')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Settings permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'settings', 'view', 'settings:view', 'View system settings', 'System'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'settings:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'settings', 'edit', 'settings:edit', 'Edit system settings', 'System'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'settings:edit')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Roles permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'roles', 'view', 'roles:view', 'View roles and permissions', 'Administration'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'roles:view')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'roles', 'create', 'roles:create', 'Create new roles', 'Administration'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'roles:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'roles', 'edit', 'roles:edit', 'Edit role permissions', 'Administration'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'roles:edit')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'roles', 'delete', 'roles:delete', 'Delete custom roles', 'Administration'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'roles:delete')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'roles', 'assign', 'roles:assign', 'Assign roles to users', 'Administration'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'roles:assign')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Backup permissions
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'backups', 'create', 'backups:create', 'Create database backups', 'System'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'backups:create')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), 'backups', 'restore', 'backups:restore', 'Restore from backups', 'System'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = 'backups:restore')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

-- Wildcard permission (super admin)
INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category)
SELECT NEWID(), '*', '*', '*:*', 'All permissions (Super Admin)', 'Administration'
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE permission = '*:*')
SET @PermissionCount = @PermissionCount + @@ROWCOUNT

PRINT '✓ Seeded ' + CAST(@PermissionCount AS NVARCHAR) + ' permissions'
GO

-- =============================================
-- 7. SEED DEFAULT ROLES
-- =============================================
PRINT ''
PRINT 'Seeding default roles...'
GO

DECLARE @RoleCount INT = 0

-- Super Admin Role
DECLARE @SuperAdminId NVARCHAR(50) = NEWID()
INSERT INTO [dbo].[Roles] (id, name, displayName, description, color, icon, level, isSystem)
SELECT @SuperAdminId, 'super_admin', 'Super Admin', 'Complete system access with all permissions', '#8b5cf6', 'shield', 100, 1
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE name = 'super_admin')
SET @RoleCount = @RoleCount + @@ROWCOUNT

-- Admin Role
DECLARE @AdminId NVARCHAR(50) = NEWID()
INSERT INTO [dbo].[Roles] (id, name, displayName, description, color, icon, level, isSystem)
SELECT @AdminId, 'admin', 'Administrator', 'Full operational control except role management', '#6366f1', 'user-check', 90, 1
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE name = 'admin')
SET @RoleCount = @RoleCount + @@ROWCOUNT

-- Manager Role
DECLARE @ManagerId NVARCHAR(50) = NEWID()
INSERT INTO [dbo].[Roles] (id, name, displayName, description, color, icon, level, isSystem)
SELECT @ManagerId, 'manager', 'Manager', 'Oversee infrastructure and view all resources', '#f59e0b', 'briefcase', 70, 1
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE name = 'manager')
SET @RoleCount = @RoleCount + @@ROWCOUNT

-- Operator Role
DECLARE @OperatorId NVARCHAR(50) = NEWID()
INSERT INTO [dbo].[Roles] (id, name, displayName, description, color, icon, level, isSystem)
SELECT @OperatorId, 'operator', 'Operator', 'Deploy and manage infrastructure resources', '#10b981', 'cpu', 50, 1
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE name = 'operator')
SET @RoleCount = @RoleCount + @@ROWCOUNT

-- Viewer Role
DECLARE @ViewerId NVARCHAR(50) = NEWID()
INSERT INTO [dbo].[Roles] (id, name, displayName, description, color, icon, level, isSystem)
SELECT @ViewerId, 'viewer', 'Viewer', 'Read-only access to system resources', '#64748b', 'eye', 10, 1
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE name = 'viewer')
SET @RoleCount = @RoleCount + @@ROWCOUNT

PRINT '✓ Seeded ' + CAST(@RoleCount AS NVARCHAR) + ' roles'
GO

-- =============================================
-- 8. ASSIGN PERMISSIONS TO ROLES
-- =============================================
PRINT ''
PRINT 'Assigning permissions to roles...'
GO

DECLARE @AssignCount INT = 0

-- Super Admin: Gets wildcard permission
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), r.id, p.id
FROM [dbo].[Roles] r
CROSS JOIN [dbo].[Permissions] p
WHERE r.name = 'super_admin' 
  AND p.permission = '*:*'
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[RolePermissions] 
      WHERE roleId = r.id AND permissionId = p.id
  )
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Admin: All permissions except role management
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), r.id, p.id
FROM [dbo].[Roles] r
CROSS JOIN [dbo].[Permissions] p
WHERE r.name = 'admin' 
  AND p.resource NOT IN ('roles', '*')
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[RolePermissions] 
      WHERE roleId = r.id AND permissionId = p.id
  )
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Admin: Can view roles but not modify
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), r.id, p.id
FROM [dbo].[Roles] r
CROSS JOIN [dbo].[Permissions] p
WHERE r.name = 'admin' 
  AND p.permission = 'roles:view'
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[RolePermissions] 
      WHERE roleId = r.id AND permissionId = p.id
  )
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Manager: View all, manage environments and servers (excluding Password Manager)
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), r.id, p.id
FROM [dbo].[Roles] r
CROSS JOIN [dbo].[Permissions] p
WHERE r.name = 'manager' 
  AND (
      p.action = 'view' OR
      p.permission IN (
          'environments:create', 'environments:edit', 'environments:delete',
          'servers:create', 'servers:edit', 'servers:delete', 'servers:execute',
          'databases:create', 'databases:edit', 'databases:delete', 'databases:execute'
      )
  )
  AND p.resource != 'passwords'
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[RolePermissions] 
      WHERE roleId = r.id AND permissionId = p.id
  )
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Operator: Create, edit, and execute on environments, servers, databases, and credentials (excluding Password Manager)
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), r.id, p.id
FROM [dbo].[Roles] r
CROSS JOIN [dbo].[Permissions] p
WHERE r.name = 'operator' 
  AND (
      p.resource IN ('environments', 'servers', 'databases', 'credentials', 'files', 'messages') AND
      p.action IN ('view', 'create', 'edit', 'execute', 'upload', 'download')
  )
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[RolePermissions] 
      WHERE roleId = r.id AND permissionId = p.id
  )
SET @AssignCount = @AssignCount + @@ROWCOUNT

-- Viewer: View-only permissions
INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
SELECT NEWID(), r.id, p.id
FROM [dbo].[Roles] r
CROSS JOIN [dbo].[Permissions] p
WHERE r.name = 'viewer' 
  AND p.action = 'view'
  AND p.resource NOT IN ('roles', 'settings', 'passwords', '*')
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[RolePermissions] 
      WHERE roleId = r.id AND permissionId = p.id
  )
SET @AssignCount = @AssignCount + @@ROWCOUNT

PRINT '✓ Assigned ' + CAST(@AssignCount AS NVARCHAR) + ' role-permission mappings'
GO

-- =============================================
-- 9. MIGRATE EXISTING USERS TO NEW SYSTEM
-- =============================================
PRINT ''
PRINT 'Migrating existing users to role-based system...'
GO

DECLARE @MigrateCount INT = 0

-- Map old role field to new role system
INSERT INTO [dbo].[UserRoles] (id, userId, roleId)
SELECT NEWID(), u.id, r.id
FROM [dbo].[Users] u
CROSS JOIN [dbo].[Roles] r
WHERE 
    -- Super Admin mapping
    (LOWER(u.role) LIKE '%super admin%' AND r.name = 'super_admin') OR
    -- Admin mapping
    (LOWER(u.role) = 'admin' AND r.name = 'admin') OR
    -- Manager mapping
    (LOWER(u.role) = 'manager' AND r.name = 'manager') OR
    -- Operator mapping
    (LOWER(u.role) = 'operator' AND r.name = 'operator') OR
    -- Viewer mapping
    (LOWER(u.role) = 'viewer' AND r.name = 'viewer')
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[UserRoles] 
    WHERE userId = u.id AND roleId = r.id
)

SET @MigrateCount = @@ROWCOUNT
PRINT '✓ Migrated ' + CAST(@MigrateCount AS NVARCHAR) + ' users to new role system'
GO

-- Auto-assign Super Admin to the first admin user if no Super Admin exists
DECLARE @FirstAdminCount INT = 0

INSERT INTO [dbo].[UserRoles] (id, userId, roleId)
SELECT TOP 1 NEWID(), u.id, r.id
FROM [dbo].[Users] u
CROSS JOIN [dbo].[Roles] r
WHERE 
    LOWER(u.role) = 'admin' 
    AND r.name = 'super_admin'
    AND u.isActive = 1
    AND NOT EXISTS (
        SELECT 1 FROM [dbo].[UserRoles] ur2
        INNER JOIN [dbo].[Roles] r2 ON ur2.roleId = r2.id
        WHERE r2.name = 'super_admin'
    )
    AND NOT EXISTS (
        SELECT 1 FROM [dbo].[UserRoles] 
        WHERE userId = u.id AND roleId = r.id
    )
ORDER BY u.created_at ASC

SET @FirstAdminCount = @@ROWCOUNT
IF @FirstAdminCount > 0
    PRINT '✓ Auto-assigned Super Admin role to first admin user'
GO

-- =============================================
-- 10. HELPER VIEWS
-- =============================================

-- View: User Permissions (Flattened)
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

-- View: Role Summary
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
-- 11. STORED PROCEDURES
-- =============================================

-- Procedure: Check User Permission
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_CheckUserPermission')
    DROP PROCEDURE [dbo].[sp_CheckUserPermission]
GO

CREATE PROCEDURE [dbo].[sp_CheckUserPermission]
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

PRINT '✓ Created sp_CheckUserPermission stored procedure'
GO

-- Procedure: Get User Permissions
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetUserPermissions')
    DROP PROCEDURE [dbo].[sp_GetUserPermissions]
GO

CREATE PROCEDURE [dbo].[sp_GetUserPermissions]
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

PRINT '✓ Created sp_GetUserPermissions stored procedure'
GO

-- =============================================
-- FINAL SUMMARY
-- =============================================
PRINT ''
PRINT '========================================='
PRINT '✓ OrbisHub Permissions System Installed'
PRINT '========================================='
PRINT ''
PRINT 'Tables Created:'
PRINT '  • Permissions'
PRINT '  • Roles'
PRINT '  • RolePermissions'
PRINT '  • UserRoles'
PRINT '  • PermissionAuditLog'
PRINT ''
PRINT 'Views Created:'
PRINT '  • vw_UserPermissions'
PRINT '  • vw_RoleSummary'
PRINT ''
PRINT 'Stored Procedures:'
PRINT '  • sp_CheckUserPermission'
PRINT '  • sp_GetUserPermissions'
PRINT ''
PRINT 'Default Roles:'
PRINT '  • Super Admin (Level 100)'
PRINT '  • Administrator (Level 90)'
PRINT '  • Manager (Level 70)'
PRINT '  • Operator (Level 50)'
PRINT '  • Viewer (Level 10)'
PRINT ''
PRINT 'Next Steps:'
PRINT '  1. Include permissions-service.js in your app'
PRINT '  2. Include permissions-ui.js for dynamic UI'
PRINT '  3. Test permissions with PermissionsService API'
PRINT ''
GO
