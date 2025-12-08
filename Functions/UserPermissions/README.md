# User Permissions System

## Overview
Comprehensive Role-Based Access Control (RBAC) system for OrbisHub with granular permissions, role management, and dynamic UI control.

## Features
- ✅ **Granular Permissions** - Fine-grained control over actions and resources
- ✅ **Role Management** - Create, edit, and assign roles with custom permissions
- ✅ **Permission Checking** - Simple API for checking user permissions
- ✅ **Dynamic UI** - Automatically show/hide UI elements based on permissions
- ✅ **Audit Trail** - Track all permission and role changes
- ✅ **Database-Driven** - All permissions stored in SQL Server
- ✅ **Inheritance** - Roles can inherit permissions from other roles

## Architecture

### Permission Structure
Permissions follow the pattern: `resource:action`

**Resources:**
- `users` - User accounts
- `environments` - Farm systems/environments
- `servers` - Server configurations
- `databases` - Database connections
- `credentials` - Stored credentials
- `messages` - Message system
- `files` - File attachments
- `audit` - Audit logs
- `settings` - System settings
- `roles` - Role management
- `backups` - Database backups
- `integrations` - Third-party integrations

**Actions:**
- `view` - Read/view resource
- `create` - Create new resource
- `edit` - Modify existing resource
- `delete` - Remove resource
- `execute` - Execute actions (e.g., test connection, deploy)
- `export` - Export data
- `import` - Import data

**Examples:**
- `users:view` - View user list
- `users:create` - Create new users
- `users:edit` - Edit user details
- `servers:delete` - Delete servers
- `credentials:view` - View credentials
- `audit:export` - Export audit logs

### Special Permissions
- `*:*` - Wildcard (all permissions)
- `admin:*` - All admin functions
- `users:*` - All user-related actions

## Database Schema

### Tables Created
1. **Permissions** - Master list of all available permissions
2. **Roles** - Role definitions
3. **RolePermissions** - Many-to-many mapping
4. **UserRoles** - User role assignments (extends Users table)

### Migrations
Run the schema file to create all necessary tables:
```sql
-- Execute: permissions-schema.sql
```

## Installation

### Step 1: Run Database Schema
```sql
-- In SQL Server Management Studio or Azure Data Studio
-- Execute: Functions/UserPermissions/permissions-schema.sql
```

### Step 2: Include Service File
Add to your `index.html` before app-main.js:
```html
<script src="../Functions/UserPermissions/permissions-service.js"></script>
```

### Step 3: Include UI Components
Add to your `index.html` after other stylesheets:
```html
<link rel="stylesheet" href="../Functions/UserPermissions/permissions-ui.css">
<script src="../Functions/UserPermissions/permissions-ui.js"></script>
<script src="../Functions/UserPermissions/permissions-manager-ui.js"></script>
```

### Step 4: Initialize
The system auto-initializes on app load and seeds default roles.

## 🖥️ Viewing in the UI

### Where to See Permissions:

1. **Navigation**: Click on **"Users / Permissions"** in the left sidebar
2. **Users Tab**: Shows all users with their current roles
3. **Permissions Tab**: 
   - **Roles & Permissions** - View and edit role permissions
   - **User Role Assignments** - Assign/remove roles from users
   - **Audit Log** - Track all permission changes

### UI Features:

- ✅ **Visual Role Cards** - See each role with color coding and permission counts
- ✅ **User Management** - Assign multiple roles to users
- ✅ **Permission Editor** - Edit which permissions each role has (coming soon - full modal)
- ✅ **Audit Trail** - View who changed what permissions and when
- ✅ **Permission Badges** - Visual indicators of user roles throughout the app

## Usage

### Checking Permissions (JavaScript)

```javascript
// Check single permission
if (await PermissionsService.hasPermission('users:create')) {
    // Show create user button
}

// Check multiple permissions (any)
if (await PermissionsService.hasAnyPermission(['users:edit', 'users:delete'])) {
    // Show user actions menu
}

// Check multiple permissions (all)
if (await PermissionsService.hasAllPermissions(['servers:view', 'servers:execute'])) {
    // Show test connection button
}

// Get all user permissions
const permissions = await PermissionsService.getUserPermissions()
console.log(permissions) // ['users:view', 'servers:create', ...]
```

### Dynamic UI Control

```html
<!-- Automatically hidden if user lacks permission -->
<button data-permission="users:create">+ Create User</button>
<button data-permission="servers:delete" class="btn-danger">Delete Server</button>

<!-- Requires ALL permissions -->
<button data-permissions-all="credentials:view,credentials:edit">Edit Credential</button>

<!-- Requires ANY permission -->
<button data-permissions-any="admin:*,settings:edit">Settings</button>
```

### Role Management API

```javascript
// Get all roles
const roles = await PermissionsService.getRoles()

// Get role details with permissions
const role = await PermissionsService.getRole('operator')

// Create custom role
await PermissionsService.createRole({
    name: 'Developer',
    description: 'Development team members',
    permissions: ['servers:view', 'databases:view', 'credentials:view']
})

// Update role permissions
await PermissionsService.updateRolePermissions('developer', [
    'servers:view', 
    'servers:create',
    'databases:view'
])

// Assign role to user
await PermissionsService.assignUserRole(userId, 'developer')

// Remove role from user
await PermissionsService.removeUserRole(userId, 'developer')
```

### Integration Examples

#### Protect Admin Functions
```javascript
async function deleteUser(userId) {
    // Check permission first
    if (!await PermissionsService.hasPermission('users:delete')) {
        showToast('You do not have permission to delete users', 'error')
        return
    }
    
    // Proceed with deletion
    await DB.execute('DELETE FROM Users WHERE id = @param0', [userId])
}
```

#### Conditional Menu Items
```javascript
async function renderNavigation() {
    const nav = []
    
    if (await PermissionsService.hasPermission('users:view')) {
        nav.push({ label: 'Users', view: 'users' })
    }
    
    if (await PermissionsService.hasPermission('servers:view')) {
        nav.push({ label: 'Servers', view: 'servers' })
    }
    
    renderMenu(nav)
}
```

## Default Roles

### Super Admin
- **Permissions:** `*:*` (all permissions)
- **Description:** Complete system control
- **Use Case:** System administrators

### Admin
- **Permissions:** All except role management
- **Description:** Full operational control
- **Use Case:** Team leads, senior staff

### Manager
- **Permissions:** View all, manage environments/servers
- **Description:** Oversee infrastructure
- **Use Case:** Project managers, architects

### Operator
- **Permissions:** Deploy, execute, manage resources
- **Description:** Daily operations
- **Use Case:** DevOps, system operators

### Viewer
- **Permissions:** Read-only access
- **Description:** View-only access
- **Use Case:** Stakeholders, junior staff, auditors

## Security Best Practices

1. **Principle of Least Privilege** - Grant minimum permissions needed
2. **Regular Audits** - Review role assignments quarterly
3. **Separation of Duties** - No single user should have all critical permissions
4. **Role Rotation** - Change sensitive role assignments periodically
5. **Audit Everything** - Log all permission checks and changes

## Troubleshooting

### Permissions Not Working
1. Verify database schema is installed
2. Check user has assigned role: `SELECT * FROM UserRoles WHERE userId = ?`
3. Verify role has permissions: `SELECT * FROM RolePermissions WHERE roleId = ?`
4. Check browser console for errors

### UI Elements Not Hiding
1. Ensure `permissions-ui.js` is loaded after `permissions-service.js`
2. Verify `data-permission` attributes are correct
3. Check that `initPermissionUI()` is called after DOM load

### Performance Issues
- Permissions are cached per session
- Cache invalidates on role change
- Consider caching role permissions in localStorage for offline scenarios

## API Reference

### PermissionsService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `hasPermission(permission)` | `permission: string` | `Promise<boolean>` | Check if user has specific permission |
| `hasAnyPermission(permissions)` | `permissions: string[]` | `Promise<boolean>` | Check if user has any of the permissions |
| `hasAllPermissions(permissions)` | `permissions: string[]` | `Promise<boolean>` | Check if user has all permissions |
| `getUserPermissions(userId?)` | `userId?: string` | `Promise<string[]>` | Get all user permissions |
| `getRoles()` | - | `Promise<Role[]>` | Get all roles |
| `getRole(roleId)` | `roleId: string` | `Promise<Role>` | Get role with permissions |
| `createRole(role)` | `role: RoleInput` | `Promise<void>` | Create new role |
| `updateRolePermissions(roleId, permissions)` | `roleId: string, permissions: string[]` | `Promise<void>` | Update role permissions |
| `assignUserRole(userId, roleId)` | `userId: string, roleId: string` | `Promise<void>` | Assign role to user |
| `removeUserRole(userId, roleId)` | `userId: string, roleId: string` | `Promise<void>` | Remove role from user |
| `clearCache()` | - | `void` | Clear permission cache |

## Future Enhancements

- [ ] **Permission Groups** - Logical grouping of permissions
- [ ] **Temporary Permissions** - Time-based permission grants
- [ ] **Permission Delegation** - Users can delegate specific permissions
- [ ] **Permission Request Workflow** - Users request, admins approve
- [ ] **Context-Based Permissions** - Permissions based on resource ownership
- [ ] **API Rate Limiting** - Per-role API limits
- [ ] **Multi-tenancy** - Organization-level permission isolation

## Support
For issues or questions, contact your system administrator or refer to the main OrbisHub documentation.
