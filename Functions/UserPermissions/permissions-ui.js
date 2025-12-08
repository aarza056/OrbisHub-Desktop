/**
 * OrbisHub Permissions UI Controller
 * Manages dynamic UI elements based on user permissions
 * 
 * @version 1.0.0
 * @created 2025-12-08
 */

(function(global) {
    'use strict';

    /**
     * Permission UI Manager
     * Automatically shows/hides UI elements based on permissions
     */
    class PermissionUI {
        constructor() {
            this.observer = null;
            this.initialized = false;
        }

        /**
         * Initialize permission-based UI control
         */
        async init() {
            if (!global.PermissionsService) {
                console.error('[PermissionUI] PermissionsService not found. Load permissions-service.js first.');
                return;
            }

            // Initialize PermissionsService if needed
            if (!global.PermissionsService.initialized) {
                try {
                    const session = typeof getSession === 'function' ? getSession() : null;
                    if (!session || !session.id) {
                        console.log('[PermissionUI] No user session, skipping initialization');
                        return;
                    }
                    await global.PermissionsService.init(session.id);
                } catch (error) {
                    console.error('[PermissionUI] Failed to initialize PermissionsService:', error);
                    return;
                }
            }

            await this.applyPermissions();
            this.watchForChanges();
            this.initialized = true;

            console.log('[PermissionUI] UI controller initialized');
        }

        /**
         * Apply permissions to all elements with permission attributes
         */
        async applyPermissions() {
            // Check if user is logged in
            if (!global.PermissionsService || !global.PermissionsService.currentUserId) {
                console.log('[PermissionUI] No user logged in, skipping permission application');
                return;
            }

            try {
                // Handle single permission requirement
                const singlePermElements = document.querySelectorAll('[data-permission]');
                for (const element of singlePermElements) {
                    const permission = element.getAttribute('data-permission');
                    const hasPermission = await global.PermissionsService.hasPermission(permission);
                    this.toggleElement(element, hasPermission);
                }

                // Handle multiple permissions (all required)
                const allPermElements = document.querySelectorAll('[data-permissions-all]');
                for (const element of allPermElements) {
                    const permissions = element.getAttribute('data-permissions-all').split(',').map(p => p.trim());
                    const hasPermission = await global.PermissionsService.hasAllPermissions(permissions);
                    this.toggleElement(element, hasPermission);
                }

                // Handle multiple permissions (any required)
                const anyPermElements = document.querySelectorAll('[data-permissions-any]');
                for (const element of anyPermElements) {
                    const permissions = element.getAttribute('data-permissions-any').split(',').map(p => p.trim());
                    const hasPermission = await global.PermissionsService.hasAnyPermission(permissions);
                    this.toggleElement(element, hasPermission);
                }

                // Handle role-based visibility
                const roleElements = document.querySelectorAll('[data-role]');
                for (const element of roleElements) {
                    const requiredRole = element.getAttribute('data-role');
                    const userRoles = await global.PermissionsService.getUserRoles();
                    const hasRole = userRoles.some(r => r.name === requiredRole);
                    this.toggleElement(element, hasRole);
                }

                // Handle admin-only elements
                const adminElements = document.querySelectorAll('[data-admin-only]');
                for (const element of adminElements) {
                    const isAdmin = await global.PermissionsService.isAdmin();
                    this.toggleElement(element, isAdmin);
                }

                // Handle super-admin-only elements
                const superAdminElements = document.querySelectorAll('[data-super-admin-only]');
                for (const element of superAdminElements) {
                    const isSuperAdmin = await global.PermissionsService.isSuperAdmin();
                    this.toggleElement(element, isSuperAdmin);
                }

                console.log('[PermissionUI] Permissions applied to UI elements');
            } catch (error) {
                console.error('[PermissionUI] Error applying permissions:', error);
            }
        }

        /**
         * Toggle element visibility based on permission
         */
        toggleElement(element, hasPermission) {
            if (!element) return;

            const action = element.getAttribute('data-permission-action') || 'hide';

            if (action === 'hide') {
                // Hide element if no permission
                if (hasPermission) {
                    element.style.display = '';
                    element.removeAttribute('disabled');
                } else {
                    element.style.display = 'none';
                }
            } else if (action === 'disable') {
                // Disable element if no permission
                element.disabled = !hasPermission;
                if (hasPermission) {
                    element.classList.remove('permission-disabled');
                } else {
                    element.classList.add('permission-disabled');
                }
            }
        }

        /**
         * Watch for DOM changes and apply permissions to new elements
         */
        watchForChanges() {
            if (this.observer) {
                this.observer.disconnect();
            }

            this.observer = new MutationObserver((mutations) => {
                let needsUpdate = false;

                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1) { // Element node
                                if (this.hasPermissionAttribute(node)) {
                                    needsUpdate = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                if (needsUpdate) {
                    this.applyPermissions();
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        /**
         * Check if element or its children have permission attributes
         */
        hasPermissionAttribute(element) {
            if (element.hasAttribute('data-permission') ||
                element.hasAttribute('data-permissions-all') ||
                element.hasAttribute('data-permissions-any') ||
                element.hasAttribute('data-role') ||
                element.hasAttribute('data-admin-only') ||
                element.hasAttribute('data-super-admin-only')) {
                return true;
            }

            // Check children
            return element.querySelector('[data-permission], [data-permissions-all], [data-permissions-any], [data-role], [data-admin-only], [data-super-admin-only]') !== null;
        }

        /**
         * Refresh permissions on all elements
         */
        async refresh() {
            console.log('[PermissionUI] Refreshing permissions...');
            global.PermissionsService.clearCache();
            await global.PermissionsService.init(global.PermissionsService.currentUserId);
            await this.applyPermissions();
        }

        /**
         * Show permission error toast
         */
        showPermissionError(message = 'You do not have permission to perform this action') {
            if (typeof showToast !== 'undefined') {
                showToast(message, 'error');
            } else {
                alert(message);
            }
        }

        /**
         * Create a permission-guarded action wrapper
         */
        guardAction(permission, action, errorMessage) {
            return async (...args) => {
                const hasPermission = await global.PermissionsService.hasPermission(permission);
                
                if (hasPermission) {
                    return await action(...args);
                } else {
                    this.showPermissionError(errorMessage);
                    console.warn(`[PermissionUI] Action blocked: ${permission}`);
                    return null;
                }
            };
        }

        /**
         * Attach permission guard to a button click
         */
        guardButton(buttonSelector, permission, action, errorMessage) {
            const button = typeof buttonSelector === 'string' 
                ? document.querySelector(buttonSelector)
                : buttonSelector;

            if (!button) {
                console.warn('[PermissionUI] Button not found:', buttonSelector);
                return;
            }

            button.addEventListener('click', async (e) => {
                e.preventDefault();
                const hasPermission = await global.PermissionsService.hasPermission(permission);
                
                if (hasPermission) {
                    await action(e);
                } else {
                    this.showPermissionError(errorMessage);
                }
            });
        }
    }

    // Create global instance
    const permissionUI = new PermissionUI();

    // Expose to global scope
    global.PermissionUI = permissionUI;

    // Initialize after successful login
    // The main app should call PermissionUI.init() after user authentication
    console.log('[PermissionUI] UI controller loaded - call PermissionUI.init() after login');

    /**
     * Helper function to check permission before executing
     * Usage: await requirePermission('users:create', () => createUser())
     */
    global.requirePermission = async function(permission, action, errorMessage) {
        const hasPermission = await global.PermissionsService.hasPermission(permission);
        
        if (hasPermission) {
            return await action();
        } else {
            permissionUI.showPermissionError(errorMessage || 
                `You need "${permission}" permission to perform this action`);
            return null;
        }
    };

    /**
     * Helper function to check if current user has permission
     * Usage: if (await canDo('users:delete')) { ... }
     */
    global.canDo = async function(permission) {
        return await global.PermissionsService.hasPermission(permission);
    };

    console.log('[PermissionUI] UI controller loaded');

})(typeof window !== 'undefined' ? window : global);
