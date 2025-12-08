USE [OrbisHub]
GO

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

PRINT 'View vw_UserPermissions created successfully'
GO
