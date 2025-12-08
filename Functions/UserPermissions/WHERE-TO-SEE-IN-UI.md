# 🖥️ Where to See Permissions in the UI

## Quick Start Guide

### 1️⃣ **Setup (First Time Only)**

#### A. Run Database Schema
Open SQL Server Management Studio and run:
```
Functions/UserPermissions/permissions-schema.sql
```

#### B. Include JavaScript Files
Add these lines to `app/index.html` **before** the `<script src="app-main.js">` line:

```html
<!-- User Permissions System -->
<link rel="stylesheet" href="../Functions/UserPermissions/permissions-ui.css">
<script src="../Functions/UserPermissions/permissions-service.js"></script>
<script src="../Functions/UserPermissions/permissions-ui.js"></script>
<script src="../Functions/UserPermissions/permissions-manager-ui.js"></script>
```

### 2️⃣ **Viewing the Permissions UI**

1. **Launch OrbisHub Desktop** and login as admin
2. **Click "Users / Permissions"** in the left sidebar navigation
3. You'll see **two tabs**:

---

## 📋 **Users Tab** (First Tab)

Shows all users in the system with their basic info.

**What you see:**
- User list with names, emails, positions
- Current role displayed for each user (from old `role` field)
- Search and filter options

**Future enhancement:** This will show the new multi-role badges once users are assigned roles.

---

## 🔐 **Permissions Tab** (Second Tab)

This is where the **new permissions system** lives! Click this tab to see:

### **Sub-Tabs:**

#### 🎭 **1. Roles & Permissions** (Default view)
Shows all available roles with their permissions.

**What you'll see:**
- **Super Admin** card - Purple badge, all permissions (wildcard `*:*`)
- **Administrator** card - Blue badge, all except role management
- **Manager** card - Orange badge, view all + manage infrastructure
- **Operator** card - Green badge, deploy and manage resources
- **Viewer** card - Gray badge, read-only access

**Features:**
- Permission count for each role
- Color-coded role badges
- Category tags (e.g., "User Management (5)", "Infrastructure (8)")
- **Edit** button to modify role permissions (Super Admin only)
- **Delete** button for custom roles
- **+ Create Custom Role** button (top right)

#### 👥 **2. User Role Assignments**
Manage which users have which roles.

**What you'll see:**
- List of all users
- Their currently assigned roles shown as colored badges
- **Manage Roles** button for each user

**Actions:**
- Click "Manage Roles" to assign/remove roles from a user
- Users can have multiple roles
- Role badges are color-coded matching the role definitions

#### 📊 **3. Audit Log**
Track all permission and role changes.

**What you'll see:**
- Recent permission changes (last 100)
- Who made the change
- What changed (role assignments, permission grants, etc.)
- When it happened
- IP address of the user who made the change

---

## 🎨 **Visual Indicators Throughout the App**

Once you add `data-permission` attributes to buttons/elements, they will:

### **Automatically Hide** if user lacks permission:
```html
<button data-permission="users:create">+ Create User</button>
```

### **Show only to Admins:**
```html
<div data-admin-only>Admin Panel Content</div>
```

### **Require specific permissions:**
```html
<button data-permissions-all="servers:view,servers:execute">Test Server</button>
```

---

## 🚀 **Quick Test**

After setup, try this in the browser console (F12):

```javascript
// Check if loaded
console.log(PermissionsService)
console.log(PermissionsManagerUI)

// View your permissions
await PermissionsService.getUserPermissions()

// View your roles
await PermissionsService.getUserRoles()

// Check specific permission
await PermissionsService.hasPermission('users:create')
```

---

## 📸 **What You'll See (Step by Step)**

### **Step 1: Navigate to Users/Permissions**
Click the sidebar menu item with the user icon that says "Users / Permissions"

### **Step 2: Click "Permissions" Tab**
You'll see two tabs at the top:
- **Users** (current user list)
- **Permissions** ← **Click this!**

### **Step 3: Explore the Sub-Tabs**
Three sub-tabs will appear:
1. **Roles & Permissions** - See all 5 default roles with permission summaries
2. **User Role Assignments** - Assign roles to users
3. **Audit Log** - View permission change history

### **Step 4: Try Editing (Super Admin Only)**
1. Click **Edit** on any role card
2. Modal opens showing all permissions grouped by category
3. Check/uncheck permissions
4. Click **Save** to update

---

## 🔧 **Troubleshooting**

### "I don't see the Permissions tab"
- Check that you included the JavaScript files in `index.html`
- Check browser console (F12) for errors
- Ensure database schema was run successfully

### "Permissions tab is empty"
- Run the `permissions-schema.sql` file in SQL Server
- Check browser console for errors
- Verify `PermissionsService` is loaded: `console.log(PermissionsService)`

### "I see the tab but no data"
- Open browser console (F12)
- Check for errors
- Run: `await PermissionsService.getRoles()` to test database connection

### "Role cards show but no edit button"
- Edit buttons only show for Super Admin role
- System roles can't be edited by regular admins
- Check your current role: `await PermissionsService.getUserRoles()`

---

## 📝 **Next Steps**

1. **Assign roles to users** - Use the "User Role Assignments" tab
2. **Create custom roles** - Click "+ Create Custom Role"
3. **Add permission checks** - Add `data-permission` attributes to UI elements
4. **Protect actions** - Add permission checks in your JavaScript code
5. **Monitor changes** - Review the Audit Log regularly

---

## 💡 **Pro Tips**

- **Multi-role support**: Users can have multiple roles (e.g., "Admin" + "Operator")
- **Permission inheritance**: Roles are additive - user gets all permissions from all their roles
- **Wildcard permissions**: `*:*` grants everything, `users:*` grants all user actions
- **Cache refresh**: Permissions are cached for 5 minutes - logout/login to refresh immediately
- **Audit everything**: All permission changes are logged with user, IP, and timestamp

---

## 📞 **Support**

If you encounter issues:
1. Check the [README.md](README.md) for detailed API documentation
2. Check the [INSTALLATION.md](INSTALLATION.md) for setup steps
3. Review browser console (F12) for error messages
4. Check SQL Server for table structure
