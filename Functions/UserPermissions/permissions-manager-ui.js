/**
 * OrbisHub Permissions Manager UI
 * Dynamic UI for managing roles, permissions, and user assignments
 * 
 * @version 1.0.0
 * @created 2025-12-08
 */

(function(global) {
    'use strict';

    /**
     * Permissions Manager UI
     * Renders and manages the permissions tab in the admin panel
     */
    class PermissionsManagerUI {
        constructor() {
            this.roles = [];
            this.permissions = [];
            this.users = [];
            this.initialized = false;
        }

        /**
         * Initialize the permissions manager UI
         */
        async init() {
            console.log('[PermissionsManagerUI] Init called');
            
            if (!global.PermissionsService) {
                console.error('[PermissionsManagerUI] PermissionsService not loaded');
                return;
            }

            // Initialize PermissionsService if not already initialized
            if (!global.PermissionsService.initialized) {
                console.log('[PermissionsManagerUI] Initializing PermissionsService...');
                try {
                    const session = typeof getSession === 'function' ? getSession() : null;
                    console.log('[PermissionsManagerUI] Session:', session);
                    if (!session || !session.id) {
                        console.warn('[PermissionsManagerUI] No user session found, skipping permissions initialization');
                        this.renderEmptyState();
                        return;
                    }
                    await global.PermissionsService.init(session.id);
                    console.log('[PermissionsManagerUI] PermissionsService initialized');
                } catch (error) {
                    console.error('[PermissionsManagerUI] Failed to initialize PermissionsService:', error);
                    this.renderErrorState(error.message);
                    return;
                }
            }

            console.log('[PermissionsManagerUI] Loading data...');
            await this.loadData();
            console.log('[PermissionsManagerUI] Rendering UI...');
            this.renderPermissionsTab();
            this.attachEventListeners();
            
            // Apply permissions to UI elements after rendering
            if (global.PermissionUI && global.PermissionUI.initialized) {
                await global.PermissionUI.applyPermissions();
            }
            
            this.initialized = true;

            console.log('[PermissionsManagerUI] Initialized successfully');
        }

        /**
         * Load all necessary data
         */
        async loadData() {
            try {
                // Load roles
                this.roles = await PermissionsService.getRoles();
                
                // Load all permissions
                this.permissions = await PermissionsService.getAllPermissions();
                
                // Load users
                const usersResult = await DB.query('SELECT id, username, name, email, role FROM Users WHERE isActive = 1');
                this.users = usersResult?.data || [];
                
                console.log('[PermissionsManagerUI] Loaded:', this.roles.length, 'roles,', this.permissions.length, 'permissions,', this.users.length, 'users');
            } catch (error) {
                console.error('[PermissionsManagerUI] Failed to load data:', error);
            }
        }

        /**
         * Render the permissions tab with dynamic content
         */
        async renderPermissionsTab() {
            const permissionsTab = document.getElementById('permissions-tab');
            if (!permissionsTab) {
                console.warn('[PermissionsManagerUI] Permissions tab not found');
                return;
            }

            // Create tabbed interface
            const html = `
                <div class="card">
                    <div style="display: flex; gap: 16px; border-bottom: 1px solid var(--border); margin-bottom: 24px;">
                        <button class="perm-subtab active" data-subtab="roles-view" style="padding: 12px 16px; background: none; border: none; border-bottom: 2px solid var(--primary); cursor: pointer; font-weight: 600; color: var(--text);">
                            Roles & Permissions
                        </button>
                        <button class="perm-subtab" data-subtab="users-view" style="padding: 12px 16px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-weight: 600; color: var(--muted);">
                            User Role Assignments
                        </button>
                        <button class="perm-subtab" data-subtab="audit-view" style="padding: 12px 16px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-weight: 600; color: var(--muted);">
                            Audit Log
                        </button>
                    </div>

                    <!-- Roles View -->
                    <div id="roles-view" class="perm-subtab-content">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <div>
                                <h3 style="margin: 0; color: var(--text);">Roles & Permissions</h3>
                                <p class="muted" style="margin: 4px 0 0 0; font-size: 13px; color: var(--muted);">Manage role permissions and create custom roles</p>
                            </div>
                            <button id="createRoleBtn" class="btn btn-primary">
                                + Create Custom Role
                            </button>
                        </div>
                        <div id="rolesContainer" class="stack" style="gap: 16px;"></div>
                    </div>

                    <!-- Users View -->
                    <div id="users-view" class="perm-subtab-content" style="display: none;">
                        <div style="margin-bottom: 16px;">
                            <h3 style="margin: 0; color: var(--text);">User Role Assignments</h3>
                            <p class="muted" style="margin: 4px 0 0 0; font-size: 13px; color: var(--muted);">Assign roles to users</p>
                        </div>
                        <div id="userRolesContainer"></div>
                    </div>

                    <!-- Audit View -->
                    <div id="audit-view" class="perm-subtab-content" style="display: none;">
                        <div style="margin-bottom: 16px;">
                            <h3 style="margin: 0; color: var(--text);">Permission Audit Log</h3>
                            <p class="muted" style="margin: 4px 0 0 0; font-size: 13px; color: var(--muted);">Track all permission and role changes</p>
                        </div>
                        <div id="permissionAuditContainer"></div>
                    </div>
                </div>
            `;

            permissionsTab.innerHTML = html;

            // Render initial views
            await this.renderRoles();
            await this.renderUserRoles();
            await this.renderAuditLog();

            // Setup subtab navigation
            this.setupSubtabs();
        }

        /**
         * Render roles with their permissions
         */
        async renderRoles() {
            const container = document.getElementById('rolesContainer');
            if (!container) return;

            container.innerHTML = '<div class="spinner"></div>';

            try {
                const rolesHtml = await Promise.all(this.roles.map(async role => {
                    const roleDetails = await PermissionsService.getRole(role.id);
                    const permissionCount = roleDetails?.permissions?.length || 0;
                    
                    // Group permissions by category
                    const permsByCategory = {};
                    if (roleDetails?.permissions) {
                        roleDetails.permissions.forEach(perm => {
                            const cat = perm.category || 'Other';
                            if (!permsByCategory[cat]) permsByCategory[cat] = [];
                            permsByCategory[cat].push(perm);
                        });
                    }

                    const isEditable = !role.isSystem || await PermissionsService.isSuperAdmin();
                    const canDelete = !role.isSystem && await PermissionsService.hasPermission('roles:delete');

                    return `
                        <div class="permission-role-card" data-role-id="${role.id}">
                            <div class="permission-role-header">
                                <div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <h4 style="margin: 0; font-size: 16px; color: ${role.color || '#6366f1'};">
                                            ${role.displayName || role.name}
                                        </h4>
                                        ${role.isSystem ? '<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; font-size: 10px; padding: 2px 8px;">SYSTEM</span>' : ''}
                                    </div>
                                    <p class="muted" style="margin: 4px 0 0 0; font-size: 13px;">${role.description || ''}</p>
                                    <p class="muted" style="margin: 4px 0 0 0; font-size: 11px;">${permissionCount} permissions • Level ${role.level}</p>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    ${isEditable ? `<button class="btn btn-ghost btn-sm edit-role-btn" data-role-id="${role.id}" data-permission="roles:edit">Edit</button>` : ''}
                                    ${canDelete ? `<button class="btn btn-ghost btn-sm btn-danger delete-role-btn" data-role-id="${role.id}" data-permission="roles:delete">Delete</button>` : ''}
                                </div>
                            </div>
                            <div class="permissions-summary" style="margin-top: 12px;">
                                ${Object.keys(permsByCategory).slice(0, 3).map(cat => 
                                    `<span class="permission-tag">${cat} (${permsByCategory[cat].length})</span>`
                                ).join('')}
                                ${Object.keys(permsByCategory).length > 3 ? `<span class="permission-tag">+${Object.keys(permsByCategory).length - 3} more</span>` : ''}
                            </div>
                        </div>
                    `;
                }));

                container.innerHTML = rolesHtml.join('');
            } catch (error) {
                console.error('[PermissionsManagerUI] Failed to render roles:', error);
                container.innerHTML = '<p class="muted">Failed to load roles</p>';
            }
        }

        /**
         * Render user role assignments
         */
        async renderUserRoles() {
            const container = document.getElementById('userRolesContainer');
            if (!container) {
                console.warn('[PermissionsManagerUI] userRolesContainer not found');
                return;
            }

            container.innerHTML = '<div class="spinner"></div>';

            console.log('[PermissionsManagerUI] Rendering', this.users.length, 'users');

            try {
                const userRolesHtml = await Promise.all(this.users.map(async user => {
                    const userRoles = await PermissionsService.getUserRoles(user.id);
                    const roleNames = userRoles.map(r => r.displayName || r.name).join(', ') || 'No roles assigned';
                    
                    return `
                        <div class="card" style="margin-bottom: 12px; padding: 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 600;">${user.name || user.username}</div>
                                    <div class="muted" style="font-size: 12px;">${user.email || user.username}</div>
                                    <div style="margin-top: 4px;">
                                        ${userRoles.map(r => `<span class="role-badge ${r.name}" style="background: ${r.color}20; color: ${r.color}; padding: 2px 8px; border-radius: 6px; font-size: 11px; margin-right: 4px;">${r.displayName}</span>`).join('')}
                                        ${userRoles.length === 0 ? '<span class="muted" style="font-size: 11px;">No roles</span>' : ''}
                                    </div>
                                </div>
                                <button class="btn btn-ghost btn-sm assign-role-btn" data-user-id="${user.id}" data-user-name="${user.name || user.username}" data-permission="roles:assign">
                                    Manage Roles
                                </button>
                            </div>
                        </div>
                    `;
                }));

                container.innerHTML = userRolesHtml.join('');
                console.log('[PermissionsManagerUI] User roles rendered');
            } catch (error) {
                console.error('[PermissionsManagerUI] Failed to render user roles:', error);
                container.innerHTML = '<p class="muted">Failed to load user roles</p>';
            }
        }

        /**
         * Render audit log
         */
        async renderAuditLog() {
            const container = document.getElementById('permissionAuditContainer');
            if (!container) return;

            try {
                const result = await DB.query(`
                    SELECT TOP 100 
                        pal.*,
                        u.username as performedByUsername
                    FROM PermissionAuditLog pal
                    LEFT JOIN Users u ON pal.performedBy = u.id
                    ORDER BY pal.created_at DESC
                `);

                if (!result?.data || result.data.length === 0) {
                    container.innerHTML = '<p class="muted">No audit entries yet</p>';
                    return;
                }

                const auditHtml = result.data.map(entry => {
                    const date = new Date(entry.created_at);
                    return `
                        <div class="card" style="margin-bottom: 8px; padding: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <div style="font-weight: 600; font-size: 13px;">${entry.action.replace(/_/g, ' ').toUpperCase()}</div>
                                    <div class="muted" style="font-size: 12px; margin-top: 2px;">
                                        ${entry.entityType} • ${entry.performedByUsername || 'Unknown'} • ${entry.ipAddress || 'Unknown IP'}
                                    </div>
                                    ${entry.details ? `<div class="muted" style="font-size: 11px; margin-top: 4px;">${JSON.stringify(JSON.parse(entry.details), null, 2).substring(0, 100)}...</div>` : ''}
                                </div>
                                <div class="muted" style="font-size: 11px; white-space: nowrap;">
                                    ${date.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                container.innerHTML = auditHtml;
            } catch (error) {
                console.error('[PermissionsManagerUI] Failed to render audit log:', error);
                container.innerHTML = '<p class="muted">Failed to load audit log</p>';
            }
        }

        /**
         * Setup subtab navigation
         */
        setupSubtabs() {
            const subtabButtons = document.querySelectorAll('.perm-subtab');
            subtabButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetTab = btn.getAttribute('data-subtab');
                    
                    // Update buttons
                    subtabButtons.forEach(b => {
                        b.classList.remove('active');
                        b.style.borderBottomColor = 'transparent';
                        b.style.color = 'var(--muted)';
                    });
                    btn.classList.add('active');
                    btn.style.borderBottomColor = 'var(--primary)';
                    btn.style.color = 'var(--text)';
                    
                    // Update content
                    document.querySelectorAll('.perm-subtab-content').forEach(content => {
                        content.style.display = 'none';
                    });
                    const targetContent = document.getElementById(targetTab);
                    if (targetContent) {
                        targetContent.style.display = 'block';
                    }
                });
            });
        }

        /**
         * Attach event listeners
         */
        attachEventListeners() {
            // Edit role button
            document.addEventListener('click', async (e) => {
                if (e.target.closest('.edit-role-btn')) {
                    const roleId = e.target.closest('.edit-role-btn').getAttribute('data-role-id');
                    await this.showEditRoleModal(roleId);
                }
            });

            // Assign role button
            document.addEventListener('click', async (e) => {
                if (e.target.closest('.assign-role-btn')) {
                    const userId = e.target.closest('.assign-role-btn').getAttribute('data-user-id');
                    const userName = e.target.closest('.assign-role-btn').getAttribute('data-user-name');
                    await this.showAssignRoleModal(userId, userName);
                }
            });

            // Delete role button
            document.addEventListener('click', async (e) => {
                if (e.target.closest('.delete-role-btn')) {
                    const roleId = e.target.closest('.delete-role-btn').getAttribute('data-role-id');
                    await this.deleteRole(roleId);
                }
            });

            // Create role button
            const createRoleBtn = document.getElementById('createRoleBtn');
            if (createRoleBtn) {
                createRoleBtn.addEventListener('click', () => this.showCreateRoleModal());
            }

            // Save role permissions button
            const saveRolePermissionsBtn = document.getElementById('saveRolePermissionsBtn');
            if (saveRolePermissionsBtn) {
                saveRolePermissionsBtn.addEventListener('click', async () => {
                    await this.saveRolePermissions();
                });
            }

            // Save user roles button
            const saveUserRolesBtn = document.getElementById('saveUserRolesBtn');
            if (saveUserRolesBtn) {
                saveUserRolesBtn.addEventListener('click', async () => {
                    await this.saveUserRoles();
                });
            }

            // Save new role button
            const saveNewRoleBtn = document.getElementById('saveNewRoleBtn');
            if (saveNewRoleBtn) {
                saveNewRoleBtn.addEventListener('click', async () => {
                    await this.saveNewRole();
                });
            }
        }

        /**
         * Show edit role modal
         */
        async showEditRoleModal(roleId) {
            const role = await PermissionsService.getRole(roleId);
            if (!role) return;

            const modal = document.getElementById('editRoleModal');
            const content = document.getElementById('editRoleContent');
            if (!modal || !content) return;

            // Group permissions by category
            const permsByCategory = {};
            this.permissions.forEach(perm => {
                const cat = perm.category || 'Other';
                if (!permsByCategory[cat]) permsByCategory[cat] = [];
                permsByCategory[cat].push(perm);
            });

            // Get current role permissions
            const currentPermIds = new Set(role.permissions?.map(p => p.id) || []);

            // Build the UI
            const html = `
                <div style="margin-bottom: 16px;">
                    <h4 style="margin: 0 0 4px 0; color: var(--text);">${role.displayName || role.name}</h4>
                    <p class="muted" style="margin: 0; font-size: 13px; color: var(--muted);">${role.description || ''}</p>
                    ${role.isSystem ? '<p class="muted" style="margin: 8px 0 0 0; font-size: 12px; color: #facc15;">⚠️ System role - changes affect core functionality</p>' : ''}
                </div>
                ${Object.keys(permsByCategory).map(category => `
                    <div style="margin-bottom: 20px;">
                        <h5 style="margin: 0 0 12px 0; color: var(--primary); font-size: 14px;">${category}</h5>
                        <div class="permission-grid">
                            ${permsByCategory[category].map(perm => `
                                <label class="permission-item" style="display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
                                    <input type="checkbox" value="${perm.id}" ${currentPermIds.has(perm.id) ? 'checked' : ''} 
                                           data-permission-id="${perm.id}" class="role-permission-checkbox">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 500; font-size: 13px; color: var(--text);">${perm.resource}:${perm.action}</div>
                                        ${perm.description ? `<div class="muted" style="font-size: 11px; margin-top: 2px; color: var(--muted);">${perm.description}</div>` : ''}
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            `;

            content.innerHTML = html;

            // Store roleId for save handler
            modal.dataset.roleId = roleId;

            try {
                modal.showModal();
            } catch (e) {
                modal.setAttribute('open', '');
            }
        }

        /**
         * Show assign role modal
         */
        async showAssignRoleModal(userId, userName) {
            const userRoles = await PermissionsService.getUserRoles(userId);
            const userRoleIds = new Set(userRoles.map(r => r.id));

            const modal = document.getElementById('assignRoleModal');
            const content = document.getElementById('assignRoleContent');
            const userNameEl = document.getElementById('assignRoleUserName');
            if (!modal || !content || !userNameEl) return;

            userNameEl.textContent = `Assign roles to ${userName}`;

            const rolesHtml = this.roles.map(role => `
                <label class="permission-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 8px; cursor: pointer; transition: background 0.2s; border: 1px solid var(--border); margin-bottom: 8px;">
                    <input type="checkbox" value="${role.id}" ${userRoleIds.has(role.id) ? 'checked' : ''} 
                           data-role-id="${role.id}" class="user-role-checkbox">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 14px;">${role.displayName || role.name}</div>
                        <div class="muted" style="font-size: 12px;">${role.description || ''}</div>
                        <div class="muted" style="font-size: 11px; margin-top: 4px;">Level ${role.level}</div>
                    </div>
                    ${role.isSystem ? '<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; font-size: 10px; padding: 2px 8px;">SYSTEM</span>' : ''}
                </label>
            `).join('');

            content.innerHTML = rolesHtml;

            // Store userId for save handler
            modal.dataset.userId = userId;
            modal.dataset.userName = userName;

            try {
                modal.showModal();
            } catch (e) {
                modal.setAttribute('open', '');
            }
        }

        /**
         * Save role permissions
         */
        async saveRolePermissions() {
            const modal = document.getElementById('editRoleModal');
            if (!modal) return;

            const roleId = modal.dataset.roleId;
            if (!roleId) return;

            // Get all checked permission checkboxes
            const checkboxes = modal.querySelectorAll('.role-permission-checkbox');
            const selectedPermissionIds = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            try {
                const result = await PermissionsService.updateRolePermissions(roleId, selectedPermissionIds);
                
                if (result.success) {
                    if (typeof showToast !== 'undefined') {
                        showToast('Role permissions updated successfully', 'success');
                    }
                    await this.loadData();
                    await this.renderRoles();
                    modal.close();
                } else {
                    alert('Failed to update role permissions: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('[PermissionsManagerUI] Failed to save role permissions:', error);
                alert('Failed to update role permissions: ' + error.message);
            }
        }

        /**
         * Save user roles
         */
        async saveUserRoles() {
            const modal = document.getElementById('assignRoleModal');
            if (!modal) return;

            const userId = modal.dataset.userId;
            const userName = modal.dataset.userName;
            if (!userId) return;

            // Get all checked role checkboxes
            const checkboxes = modal.querySelectorAll('.user-role-checkbox');
            const selectedRoleIds = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            try {
                const result = await PermissionsService.assignRolesToUser(userId, selectedRoleIds);
                
                if (result.success) {
                    if (typeof showToast !== 'undefined') {
                        showToast(`Roles updated for ${userName}`, 'success');
                    }
                    await this.loadData();
                    await this.renderUserRoles();
                    modal.close();
                } else {
                    alert('Failed to assign roles: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('[PermissionsManagerUI] Failed to save user roles:', error);
                alert('Failed to assign roles: ' + error.message);
            }
        }

        /**
         * Show create role modal
         */
        async showCreateRoleModal() {
            const modal = document.getElementById('createRoleModal');
            const permissionsContainer = document.getElementById('createRolePermissions');
            if (!modal || !permissionsContainer) {
                console.error('[PermissionsManagerUI] Create role modal elements not found');
                return;
            }

            // Clear form
            document.getElementById('newRoleName').value = '';
            document.getElementById('newRoleDisplayName').value = '';
            document.getElementById('newRoleDescription').value = '';
            document.getElementById('newRoleLevel').value = '10';
            document.getElementById('newRoleColor').value = '#6366f1';

            // Group permissions by category
            const permsByCategory = {};
            this.permissions.forEach(perm => {
                const cat = perm.category || 'Other';
                if (!permsByCategory[cat]) permsByCategory[cat] = [];
                permsByCategory[cat].push(perm);
            });

            // Build permissions UI
            const permissionsHtml = Object.keys(permsByCategory).map(category => `
                <div style="margin-bottom: 20px;">
                    <h5 style="margin: 0 0 12px 0; color: var(--primary); font-size: 14px;">${category}</h5>
                    <div class="permission-grid">
                        ${permsByCategory[category].map(perm => `
                            <label class="permission-item" style="display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
                                <input type="checkbox" value="${perm.id}" data-permission-id="${perm.id}" class="new-role-permission-checkbox">
                                <div style="flex: 1;">
                                    <div style="font-weight: 500; font-size: 13px; color: var(--text);">${perm.resource}:${perm.action}</div>
                                    ${perm.description ? `<div class="muted" style="font-size: 11px; margin-top: 2px; color: var(--muted);">${perm.description}</div>` : ''}
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `).join('');

            permissionsContainer.innerHTML = permissionsHtml;

            try {
                modal.showModal();
            } catch (e) {
                modal.setAttribute('open', '');
            }
        }

        /**
         * Save new role
         */
        async saveNewRole() {
            const modal = document.getElementById('createRoleModal');
            if (!modal) return;

            // Get form values
            const name = document.getElementById('newRoleName').value.trim();
            const displayName = document.getElementById('newRoleDisplayName').value.trim();
            const description = document.getElementById('newRoleDescription').value.trim();
            const level = parseInt(document.getElementById('newRoleLevel').value);
            const color = document.getElementById('newRoleColor').value;

            // Validate
            if (!name) {
                alert('Please enter a role name');
                return;
            }

            if (!level || level < 1 || level > 100) {
                alert('Please enter a valid level (1-100)');
                return;
            }

            // Get selected permissions
            const checkboxes = modal.querySelectorAll('.new-role-permission-checkbox');
            const selectedPermissionIds = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            if (selectedPermissionIds.length === 0) {
                if (!confirm('No permissions selected. Do you want to create a role with no permissions?')) {
                    return;
                }
            }

            try {
                const result = await PermissionsService.createRole({
                    name: name,
                    displayName: displayName || name,
                    description: description,
                    level: level,
                    color: color,
                    isSystem: false,
                    permissions: selectedPermissionIds
                });

                if (result.success) {
                    if (typeof showToast !== 'undefined') {
                        showToast('Custom role created successfully', 'success');
                    }
                    await this.loadData();
                    await this.renderRoles();
                    modal.close();
                } else {
                    alert('Failed to create role: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('[PermissionsManagerUI] Failed to create role:', error);
                alert('Failed to create role: ' + error.message);
            }
        }

        /**
         * Delete role
         */
        async deleteRole(roleId) {
            if (!confirm('Are you sure you want to delete this role? This cannot be undone.')) {
                return;
            }

            const result = await PermissionsService.deleteRole(roleId);
            if (result.success) {
                if (typeof showToast !== 'undefined') {
                    showToast('Role deleted successfully', 'success');
                }
                await this.loadData();
                await this.renderRoles();
            } else {
                alert('Failed to delete role: ' + (result.error || 'Unknown error'));
            }
        }

        /**
         * Refresh the UI
         */
        async refresh() {
            await this.loadData();
            await this.renderRoles();
            await this.renderUserRoles();
            await this.renderAuditLog();
        }

        /**
         * Render empty state when no user is logged in
         */
        renderEmptyState() {
            const permissionsTab = document.getElementById('permissions-tab');
            if (!permissionsTab) return;
            
            permissionsTab.innerHTML = `
                <div class="card" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
                    <h3 style="margin: 0 0 8px 0;">Permissions Not Available</h3>
                    <p class="muted">Please log in to manage permissions.</p>
                </div>
            `;
        }

        /**
         * Render error state
         */
        renderErrorState(message) {
            const permissionsTab = document.getElementById('permissions-tab');
            if (!permissionsTab) return;
            
            permissionsTab.innerHTML = `
                <div class="card" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                    <h3 style="margin: 0 0 8px 0; color: var(--danger);">Failed to Load Permissions</h3>
                    <p class="muted">${message}</p>
                    <button class="btn btn-primary" onclick="PermissionsManagerUI.init()" style="margin-top: 16px;">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    // Create global instance
    const permissionsManagerUI = new PermissionsManagerUI();

    // Expose to global scope
    global.PermissionsManagerUI = permissionsManagerUI;

    // Auto-initialize when permissions tab becomes visible
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            // Wait for navigation system to be ready
            setTimeout(() => {
                // Initialize when users section is clicked
                const usersNavBtn = document.querySelector('[data-view="admin-users"]');
                if (usersNavBtn) {
                    usersNavBtn.addEventListener('click', () => {
                        setTimeout(() => {
                            if (!permissionsManagerUI.initialized) {
                                permissionsManagerUI.init();
                            }
                        }, 100);
                    });
                }
                
                // Also initialize when permissions tab is clicked
                document.addEventListener('click', (e) => {
                    const permTab = e.target.closest('[data-tab="permissions-tab"]');
                    if (permTab && !permissionsManagerUI.initialized) {
                        setTimeout(() => {
                            permissionsManagerUI.init();
                        }, 100);
                    }
                });
            }, 1000);
        });
    }

    console.log('[PermissionsManagerUI] Loaded');

})(typeof window !== 'undefined' ? window : global);
