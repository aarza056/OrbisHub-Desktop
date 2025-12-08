/**
 * OrbisHub Permissions Service
 * Provides comprehensive role-based access control (RBAC)
 * 
 * @version 1.0.0
 * @created 2025-12-08
 */

(function(global) {
    'use strict';

    /**
     * Permissions Service
     * Main API for checking and managing user permissions
     */
    class PermissionsService {
        constructor() {
            this.cache = new Map(); // userId -> Set<permission>
            this.cacheExpiry = new Map(); // userId -> timestamp
            this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
            this.currentUserId = null;
            this.initialized = false;
        }

        /**
         * Initialize the permissions service
         * Should be called after user login
         */
        async init(userId) {
            if (!userId) {
                console.warn('[Permissions] No userId provided, using session');
                const session = getSession ? getSession() : null;
                userId = session?.id;
            }

            if (!userId) {
                throw new Error('Cannot initialize permissions: No user logged in');
            }

            this.currentUserId = userId;
            await this.loadPermissions(userId);
            this.initialized = true;
            console.log('[Permissions] Service initialized for user:', userId);
        }

        /**
         * Load permissions for a user from database
         */
        async loadPermissions(userId) {
            try {
                const result = await DB.query(
                    'EXEC sp_GetUserPermissions @param0',
                    [{ value: userId }]
                );

                if (result && result.success && result.data) {
                    const permissions = new Set(result.data.map(p => p.permission));
                    this.cache.set(userId, permissions);
                    this.cacheExpiry.set(userId, Date.now() + this.CACHE_TTL);
                    
                    console.log(`[Permissions] Loaded ${permissions.size} permissions for user ${userId}`);
                    return permissions;
                }

                console.warn('[Permissions] No permissions found for user:', userId);
                return new Set();
            } catch (error) {
                console.error('[Permissions] Failed to load permissions:', error);
                return new Set();
            }
        }

        /**
         * Get permissions from cache or load if expired
         */
        async getPermissions(userId = null) {
            userId = userId || this.currentUserId;
            if (!userId) {
                throw new Error('No user ID available');
            }

            // Check cache
            const cached = this.cache.get(userId);
            const expiry = this.cacheExpiry.get(userId);

            if (cached && expiry && Date.now() < expiry) {
                return cached;
            }

            // Reload
            return await this.loadPermissions(userId);
        }

        /**
         * Check if user has a specific permission
         * Supports wildcards: *:* and resource:*
         */
        async hasPermission(permission, userId = null) {
            try {
                const permissions = await this.getPermissions(userId);
                
                // Check for exact match
                if (permissions.has(permission)) {
                    return true;
                }

                // Check for wildcard all
                if (permissions.has('*:*')) {
                    return true;
                }

                // Check for resource wildcard (e.g., users:* matches users:create)
                const [resource] = permission.split(':');
                if (permissions.has(`${resource}:*`)) {
                    return true;
                }

                return false;
            } catch (error) {
                console.error('[Permissions] Error checking permission:', error);
                return false;
            }
        }

        /**
         * Check if user has ANY of the specified permissions
         */
        async hasAnyPermission(permissionList, userId = null) {
            if (!Array.isArray(permissionList) || permissionList.length === 0) {
                return false;
            }

            for (const permission of permissionList) {
                if (await this.hasPermission(permission, userId)) {
                    return true;
                }
            }

            return false;
        }

        /**
         * Check if user has ALL of the specified permissions
         */
        async hasAllPermissions(permissionList, userId = null) {
            if (!Array.isArray(permissionList) || permissionList.length === 0) {
                return false;
            }

            for (const permission of permissionList) {
                if (!(await this.hasPermission(permission, userId))) {
                    return false;
                }
            }

            return true;
        }

        /**
         * Get all permissions for a user as array
         */
        async getUserPermissions(userId = null) {
            const permissions = await this.getPermissions(userId);
            return Array.from(permissions);
        }

        /**
         * Clear permission cache (call after role changes)
         */
        clearCache(userId = null) {
            if (userId) {
                this.cache.delete(userId);
                this.cacheExpiry.delete(userId);
                console.log('[Permissions] Cache cleared for user:', userId);
            } else {
                this.cache.clear();
                this.cacheExpiry.clear();
                console.log('[Permissions] All cache cleared');
            }
        }

        /**
         * Get all available permissions
         */
        async getAllPermissions() {
            try {
                const result = await DB.query(`
                    SELECT id, resource, action, permission, description, category 
                    FROM Permissions 
                    WHERE isActive = 1 
                    ORDER BY category, resource, action
                `);

                return result?.data || [];
            } catch (error) {
                console.error('[Permissions] Failed to get all permissions:', error);
                return [];
            }
        }

        /**
         * Get all roles
         */
        async getRoles() {
            try {
                const result = await DB.query(`
                    SELECT id, name, displayName, description, color, icon, level, isSystem
                    FROM Roles 
                    WHERE isActive = 1 
                    ORDER BY level DESC
                `);

                return result?.data || [];
            } catch (error) {
                console.error('[Permissions] Failed to get roles:', error);
                return [];
            }
        }

        /**
         * Get role details with permissions
         */
        async getRole(roleId) {
            try {
                // Get role
                const roleResult = await DB.query(
                    'SELECT * FROM Roles WHERE id = @param0 OR name = @param0',
                    [{ value: roleId }]
                );

                if (!roleResult?.data?.[0]) {
                    throw new Error('Role not found');
                }

                const role = roleResult.data[0];

                // Get permissions
                const permResult = await DB.query(`
                    SELECT p.id, p.permission, p.description, p.category, p.resource, p.action
                    FROM RolePermissions rp
                    INNER JOIN Permissions p ON rp.permissionId = p.id
                    WHERE rp.roleId = @param0 AND p.isActive = 1
                    ORDER BY p.category, p.resource, p.action
                `, [{ value: role.id }]);

                role.permissions = permResult?.data || [];

                return role;
            } catch (error) {
                console.error('[Permissions] Failed to get role:', error);
                return null;
            }
        }

        /**
         * Get user's roles
         */
        async getUserRoles(userId = null) {
            userId = userId || this.currentUserId;
            if (!userId) {
                throw new Error('No user ID available');
            }

            try {
                const result = await DB.query(`
                    SELECT r.id, r.name, r.displayName, r.description, r.color, r.icon, r.level
                    FROM UserRoles ur
                    INNER JOIN Roles r ON ur.roleId = r.id
                    WHERE ur.userId = @param0 AND r.isActive = 1
                    ORDER BY r.level DESC
                `, [{ value: userId }]);

                return result?.data || [];
            } catch (error) {
                console.error('[Permissions] Failed to get user roles:', error);
                return [];
            }
        }

        /**
         * Create a new role
         */
        async createRole(roleData) {
            try {
                const roleId = uid();
                
                await DB.execute(`
                    INSERT INTO Roles (id, name, displayName, description, color, icon, level, isSystem)
                    VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, 0)
                `, [
                    { value: roleId },
                    { value: roleData.name },
                    { value: roleData.displayName || roleData.name },
                    { value: roleData.description || '' },
                    { value: roleData.color || '#64748b' },
                    { value: roleData.icon || 'user' },
                    { value: roleData.level || 50 }
                ]);

                // Add permissions if provided
                if (roleData.permissions && Array.isArray(roleData.permissions)) {
                    await this.updateRolePermissions(roleId, roleData.permissions);
                }

                // Audit log
                await this.logPermissionAudit('role_create', 'role', roleId, null, {
                    name: roleData.name,
                    displayName: roleData.displayName
                });

                console.log('[Permissions] Role created:', roleData.name);
                return { success: true, roleId };
            } catch (error) {
                console.error('[Permissions] Failed to create role:', error);
                return { success: false, error: error.message };
            }
        }

        /**
         * Update role permissions
         */
        async updateRolePermissions(roleId, permissionIds) {
            try {
                // Delete existing permissions
                await DB.execute(
                    'DELETE FROM RolePermissions WHERE roleId = @param0',
                    [{ value: roleId }]
                );

                // Add new permissions (permissionIds are the actual IDs, not permission strings)
                for (const permissionId of permissionIds) {
                    await DB.execute(`
                        INSERT INTO RolePermissions (id, roleId, permissionId, granted_by)
                        VALUES (@param0, @param1, @param2, @param3)
                    `, [
                        { value: uid() },
                        { value: roleId },
                        { value: permissionId },
                        { value: this.currentUserId }
                    ]);
                }

                await this.logPermissionAudit('role_permissions_updated', 'role', roleId, null, {
                    permissionCount: permissionIds.length
                });

                console.log('[Permissions] Role permissions updated:', roleId);
                return { success: true };
            } catch (error) {
                console.error('[Permissions] Failed to update role permissions:', error);
                return { success: false, error: error.message };
            }
        }

        /**
         * Assign roles to a user
         */
        async assignRolesToUser(userId, roleIds) {
            try {
                // Delete existing role assignments
                await DB.execute(
                    'DELETE FROM UserRoles WHERE userId = @param0',
                    [{ value: userId }]
                );

                // Add new role assignments
                for (const roleId of roleIds) {
                    await DB.execute(`
                        INSERT INTO UserRoles (id, userId, roleId, assigned_by)
                        VALUES (@param0, @param1, @param2, @param3)
                    `, [
                        { value: uid() },
                        { value: userId },
                        { value: roleId },
                        { value: this.currentUserId }
                    ]);
                }

                await this.logPermissionAudit('user_roles_assigned', 'user', userId, null, {
                    roleCount: roleIds.length
                });

                // Clear user's permission cache
                this.cache.delete(userId);
                this.cacheExpiry.delete(userId);

                console.log('[Permissions] User roles assigned:', userId);
                return { success: true };
            } catch (error) {
                console.error('[Permissions] Failed to assign roles:', error);
                return { success: false, error: error.message };
            }
        }

        /**
         * Delete a custom role
         */
        async deleteRole(roleId) {
            try {
                // Check if system role
                const roleResult = await DB.query(
                    'SELECT isSystem FROM Roles WHERE id = @param0',
                    [{ value: roleId }]
                );

                if (roleResult?.data?.[0]?.isSystem) {
                    throw new Error('Cannot delete system role');
                }

                // Delete role (cascade deletes permissions and user assignments)
                await DB.execute(
                    'DELETE FROM Roles WHERE id = @param0',
                    [{ value: roleId }]
                );

                // Audit log
                await this.logPermissionAudit('role_delete', 'role', roleId, null, {
                    deletedBy: this.currentUserId
                });

                // Clear all cache
                this.clearCache();

                console.log('[Permissions] Role deleted');
                return { success: true };
            } catch (error) {
                console.error('[Permissions] Failed to delete role:', error);
                return { success: false, error: error.message };
            }
        }

        /**
         * Log permission audit event
         */
        async logPermissionAudit(action, entityType, entityId, targetId, details) {
            try {
                await DB.execute(`
                    INSERT INTO PermissionAuditLog 
                    (id, action, entityType, entityId, targetId, performedBy, details, ipAddress)
                    VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7)
                `, [
                    { value: uid() },
                    { value: action },
                    { value: entityType },
                    { value: entityId },
                    { value: targetId },
                    { value: this.currentUserId },
                    { value: JSON.stringify(details) },
                    { value: getLocalIP ? getLocalIP() : '0.0.0.0' }
                ]);
            } catch (error) {
                console.error('[Permissions] Failed to log audit:', error);
            }
        }

        /**
         * Helper: Check if user is admin
         */
        async isAdmin(userId = null) {
            return await this.hasAnyPermission(['*:*', 'admin:*'], userId);
        }

        /**
         * Helper: Check if user is super admin
         */
        async isSuperAdmin(userId = null) {
            return await this.hasPermission('*:*', userId);
        }
    }

    // Create global instance
    const permissionsService = new PermissionsService();

    // Expose to global scope
    global.PermissionsService = permissionsService;

    // Auto-initialize on user login (if session exists)
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                // Wait a bit for session to be set
                setTimeout(async () => {
                    const session = typeof getSession !== 'undefined' ? getSession() : null;
                    if (session?.id) {
                        await permissionsService.init(session.id);
                        console.log('[Permissions] Auto-initialized from session');
                    }
                }, 500);
            } catch (error) {
                console.log('[Permissions] Auto-init skipped:', error.message);
            }
        });
    }

    console.log('[Permissions] Service loaded');

})(typeof window !== 'undefined' ? window : global);
