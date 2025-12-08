# Installation Guide - User Permissions System

## Prerequisites
- OrbisHub Desktop installed
- SQL Server database configured
- Admin access to the database

## Step-by-Step Installation

### 1. Database Setup

#### Option A: Using SQL Server Management Studio (SSMS)
1. Open SSMS and connect to your OrbisHub database
2. Open the file `Functions/UserPermissions/permissions-schema.sql`
3. Execute the script (F5)
4. Verify success messages in the output

#### Option B: Using Azure Data Studio
1. Open Azure Data Studio
2. Connect to your OrbisHub database
3. Open the file `Functions/UserPermissions/permissions-schema.sql`
4. Run the script
5. Check for success messages

#### Option C: Using OrbisHub Desktop Console
```javascript
// Not recommended - use SSMS instead for schema changes
// This is just for reference
```

**Expected Output:**
```
✓ Created Permissions table
✓ Created Roles table
✓ Created RolePermissions table
✓ Created UserRoles table
✓ Created PermissionAuditLog table
✓ Seeded 45 permissions
✓ Seeded 5 roles
✓ Assigned 156 role-permission mappings
✓ Migrated X users to new role system
✓ Auto-assigned Super Admin role to first admin user
✓ Created vw_UserPermissions view
✓ Created vw_RoleSummary view
✓ Created sp_CheckUserPermission stored procedure
✓ Created sp_GetUserPermissions stored procedure
```

**Important:** The schema automatically assigns the Super Admin role to the first admin user. If you've already set up the system and your admin doesn't have Super Admin, run:
```sql
Functions/UserPermissions/assign-super-admin.sql
```

### 2. Frontend Integration

#### A. Include Service Files
Add these lines to your `app/index.html` **before** the `app-main.js` script tag:

```html
<!-- User Permissions System -->
<link rel="stylesheet" href="../Functions/UserPermissions/permissions-ui.css">
<script src="../Functions/UserPermissions/permissions-service.js"></script>
<script src="../Functions/UserPermissions/permissions-ui.js"></script>
```

**Find this section in index.html:**
```html
<!-- Your existing scripts -->
<script src="app.js"></script>
<!-- ADD PERMISSIONS HERE -->
<link rel="stylesheet" href="../Functions/UserPermissions/permissions-ui.css">
<script src="../Functions/UserPermissions/permissions-service.js"></script>
<script src="../Functions/UserPermissions/permissions-ui.js"></script>
<!-- Then app-main.js -->
<script src="app-main.js"></script>
```

#### B. Initialize on Login
The system auto-initializes, but you can manually initialize after login:

In your login handler (in `app-main.js`), add:
```javascript
// After successful login
setSession(user)

// Initialize permissions
if (window.PermissionsService) {
    await window.PermissionsService.init(user.id)
}
```

### 3. Verify Installation

#### A. Check Database
Run this query in SSMS:
```sql
-- Check tables exist
SELECT name FROM sys.tables 
WHERE name IN ('Permissions', 'Roles', 'RolePermissions', 'UserRoles', 'PermissionAuditLog')

-- Check default roles
SELECT name, displayName, level FROM Roles ORDER BY level DESC

-- Check permissions count
SELECT COUNT(*) AS TotalPermissions FROM Permissions

-- Check your user's permissions
SELECT * FROM vw_UserPermissions WHERE username = 'your_username'
```

#### B. Check Frontend Console
1. Open OrbisHub Desktop
2. Press F12 to open Developer Tools
3. Go to Console tab
4. Look for these messages:
```
[Permissions] Service loaded
[Permissions] Auto-initialized from session
[Permissions] Loaded 45 permissions for user <user_id>
[PermissionUI] UI controller loaded
[PermissionUI] UI controller initialized
[PermissionUI] Permissions applied to UI elements
```

#### C. Test Permission Check
In the browser console (F12), run:
```javascript
// Check if service is loaded
console.log(window.PermissionsService)

// Check your permissions
await PermissionsService.getUserPermissions()

// Test a permission
await PermissionsService.hasPermission('users:create')

// Check your roles
await PermissionsService.getUserRoles()
```

### 4. Apply to Existing UI Elements

#### A. Protect Buttons
Add `data-permission` attribute to buttons:

```html
<!-- Before -->
<button id="createUserBtn" class="btn">+ Create User</button>

<!-- After -->
<button id="createUserBtn" class="btn" data-permission="users:create">
    + Create User
</button>
```

#### B. Protect Menu Items
```html
<!-- Before -->
<button class="nav__btn" data-view="admin-users">Users</button>

<!-- After -->
<button class="nav__btn" data-view="admin-users" data-permission="users:view">
    Users
</button>
```

#### C. Protect Actions in Code
```javascript
// Before
async function deleteUser(userId) {
    await DB.execute('DELETE FROM Users WHERE id = @param0', [userId])
}

// After
async function deleteUser(userId) {
    // Check permission first
    if (!await PermissionsService.hasPermission('users:delete')) {
        showToast('You do not have permission to delete users', 'error')
        return
    }
    
    await DB.execute('DELETE FROM Users WHERE id = @param0', [userId])
}
```

### 5. Migrate Existing Users

The schema automatically migrates users based on their existing `role` field:

| Old Role Field | New Role Assignment |
|---------------|-------------------|
| "Super Admin" | super_admin |
| "Admin" | admin |
| "Manager" | manager |
| "Operator" | operator |
| "Viewer" | viewer |

**Verify migration:**
```sql
SELECT 
    u.username,
    u.role AS old_role,
    r.name AS new_role,
    r.displayName
FROM Users u
INNER JOIN UserRoles ur ON u.id = ur.userId
INNER JOIN Roles r ON ur.roleId = r.id
```

### 6. Post-Installation Tasks

#### A. Assign Roles to Existing Users
If some users weren't auto-migrated:

```javascript
// In browser console or create admin interface
await PermissionsService.assignUserRole('user-id-here', 'admin')
```

#### B. Test Role Permissions
Login as different users and verify they see appropriate UI elements.

#### C. Review Audit Logs
Check permission audit logs:
```sql
SELECT TOP 100 * 
FROM PermissionAuditLog 
ORDER BY created_at DESC
```

### 7. Common Issues & Solutions

#### Issue: "PermissionsService not found"
**Solution:** Ensure `permissions-service.js` is loaded before `permissions-ui.js` and `app-main.js`

#### Issue: "No permissions found for user"
**Solution:** 
1. Check user has a role assigned:
   ```sql
   SELECT * FROM UserRoles WHERE userId = 'user-id'
   ```
2. If not, assign a role:
   ```javascript
   await PermissionsService.assignUserRole('user-id', 'admin')
   ```

#### Issue: UI elements not hiding
**Solution:** 
1. Check `data-permission` attribute is spelled correctly
2. Verify permission name matches database (case-sensitive):
   ```sql
   SELECT permission FROM Permissions WHERE resource = 'users'
   ```
3. Check console for errors (F12)

#### Issue: "Cannot read property 'init' of undefined"
**Solution:** Permissions service hasn't loaded yet. Add delay:
```javascript
setTimeout(async () => {
    await PermissionsService.init(user.id)
}, 500)
```

### 8. Rollback Instructions

If you need to rollback the permissions system:

```sql
-- Drop tables in correct order (respects foreign keys)
DROP TABLE IF EXISTS PermissionAuditLog
DROP TABLE IF EXISTS UserRoles
DROP TABLE IF EXISTS RolePermissions
DROP TABLE IF EXISTS Roles
DROP TABLE IF EXISTS Permissions

-- Drop views
DROP VIEW IF EXISTS vw_UserPermissions
DROP VIEW IF EXISTS vw_RoleSummary

-- Drop procedures
DROP PROCEDURE IF EXISTS sp_CheckUserPermission
DROP PROCEDURE IF EXISTS sp_GetUserPermissions
```

Then remove the script tags from `index.html`.

### 9. Next Steps

1. **Review default permissions** - Adjust role permissions as needed
2. **Create custom roles** - Define roles specific to your organization
3. **Apply to all features** - Add permission checks to all CRUD operations
4. **Train users** - Explain new permission system to team
5. **Monitor audit logs** - Review permission changes regularly

## Support

For issues or questions:
- Check the main [README.md](README.md)
- Review [Troubleshooting Guide](#7-common-issues--solutions)
- Check browser console for error messages (F12)
- Review SQL Server error logs
