# OrbisHub Desktop - Permissions Audit Report

**Date:** December 8, 2025  
**Purpose:** Comprehensive review of all UI actions and their permission requirements

---

## ✅ PROTECTED (Already Has Permission Checks)

### User Management
- ✅ **Create User** (`addUserBtn`) - `users:create` or `*:*`
- ✅ **Edit User** (row button) - `users:edit` or `*:*`
- ✅ **Delete User** (row button) - `users:delete` or `*:*`
- ✅ **Unlock Account** (row button) - `users:edit` or `*:*`

### Environment Management
- ✅ **Add Farm System** (`addEnvBtn`) - `environments:create` or `*:*`

### Server Management
- ✅ **Add Server** (`addServerBtn`) - `servers:create` or `*:*`

### Credential Management
- ✅ **Add Credential** (`addCredentialBtn`) - `credentials:create` or `*:*`

### Role & Permissions Management
- ✅ **Permissions Tab** (tab button) - `roles:view` or `*:*`
- ✅ **Create Custom Role** (`createRoleBtn`) - Always visible (consider adding permission)
- ✅ **Manage Roles** (user role assignment) - `roles:assign` or `*:*`

### Password Manager (ADMIN ONLY)
- ✅ **Password Manager Tab** (navigation) - `passwords:view` or `*:*`
- ✅ **Add Password** (`addPasswordBtn`) - `passwords:create` or `*:*`
- ✅ **Manage Categories** (`manageCategoriesBtn`) - `passwords:edit` or `*:*`
- ✅ **Edit Password** (row buttons) - `passwords:edit` or `*:*`
- ✅ **Delete Password** (row buttons) - `passwords:delete` or `*:*`

**Note:** Entire Password Manager section restricted to Admin and Super Admin roles only

---

## ⚠️ NEEDS PROTECTION (Missing Permission Checks)

### Environment Management ✅ **CRITICAL ITEMS PROTECTED**
- ✅ **Edit Environment** (row button in environment list) - `environments:edit` or `*:*`
  
- ✅ **Delete Environment** (row button in environment list) - `environments:delete` or `*:*`

- ✅ **Map Servers/Agents** (`envDetailsMapServersBtn`) - `environments:edit` or `*:*`

- ✅ **Deploy** (`envDetailsDeployBtn`) - `environments:execute` or `*:*`

- ✅ **Show Solutions** (`envDetailsSolutionsBtn`) - No permission needed (OK for viewers)

### Server Management ✅ **CRITICAL ITEMS PROTECTED**
- ✅ **Edit Server** (`data-action="server-edit"` in server list) - `servers:edit` or `*:*`

- ✅ **Delete Server** (`data-action="server-delete"` in server list) - `servers:delete` or `*:*`

- ✅ **Connect to Server** (`data-action="server-connect"`) - `servers:execute` or `*:*`

- ✅ **Unlock Server** (`data-action="unlock"` in server list) - `servers:edit` or `*:*`

- ✅ **Check Server Health** (`checkServerHealthBtn`) - No permission needed (OK for viewers)

### Credential Management ✅ **CRITICAL ITEMS PROTECTED**
- ✅ **Edit Credential** (`data-action="edit"` in credential list) - `credentials:edit` or `*:*`

- ✅ **Delete Credential** (`data-action="delete"` in credential list) - `credentials:delete` or `*:*`

### Database Management
- ❌ **Add Database** (`addDatabaseBtn`)
  - **Required Permission:** `databases:create` or `*:*`
  - **Impact:** Viewers can create databases

- ❌ **Edit Database** (row button in database list)
  - **Required Permission:** `databases:edit` or `*:*`
  - **Impact:** Viewers can modify database configs

- ❌ **Delete Database** (row button in database list)
  - **Required Permission:** `databases:delete` or `*:*`
  - **Impact:** Viewers can delete databases

- ❌ **Test DB Connection** (`testDbConnectionBtn`)
  - **Required Permission:** `databases:execute` or `*:*`

- ❌ **Create Database** (`createDatabaseBtn`)
  - **Required Permission:** `databases:create` or `*:*`

### Audit Log Management ✅ **CRITICAL ITEMS PROTECTED**
- ✅ **Clear Audit Log** (`clearAuditBtn`) - `audit:delete` or `*:*`

- ✅ **Refresh Audit** (`refreshAuditBtn`) - No permission needed (OK for viewers)

### File Management
- ❌ **Upload Files** (file upload buttons)
  - **Required Permission:** `files:upload` or `*:*`
  - **Impact:** Viewers can upload files

- ❌ **Download Files** (file download buttons)
  - **Required Permission:** `files:download` or `*:*`
  - **Impact:** May be OK for viewers to download

- ❌ **Delete Files** (file delete buttons)
  - **Required Permission:** `files:delete` or `*:*`
  - **Impact:** Viewers can delete files

### Messaging System
- ❌ **Create Channel** (`createChannelBtn`, `createChannelBtnSidebar`)
  - **Required Permission:** `messages:create` or `*:*`
  - **Impact:** Viewers can create channels

- ❌ **New Message** (`newMessageBtn`)
  - **Required Permission:** `messages:create` or `*:*`
  - **Impact:** May want to allow viewers to send messages

- ❌ **Send Message** (`messagesSendBtn`, `sendMessageBtn`)
  - **Required Permission:** `messages:create` or `*:*`
  - **Impact:** Consider if viewers should send messages

### Ticket Management
- ❌ **Create Ticket** (`createTicketBtn`)
  - **Required Permission:** `tickets:create` or `*:*`
  - **Impact:** May want to allow viewers to create tickets

- ❌ **Refresh Tickets** (`refreshTicketsBtn`)
  - **Required Permission:** `tickets:view` (OK for viewers)

### Password Manager ✅ **PROTECTED - ADMIN ONLY**
- ✅ **Password Manager Tab** (navigation) - `passwords:view` or `*:*`
  - **Restricted to:** Admin and Super Admin only
  
- ✅ **Add Password** (`addPasswordBtn`) - `passwords:create` or `*:*`

- ✅ **Manage Categories** (`manageCategoriesBtn`) - `passwords:edit` or `*:*`

- ✅ **Edit Password** (buttons in password list) - `passwords:edit` or `*:*`

- ✅ **Delete Password** (buttons in password list) - `passwords:delete` or `*:*`

- ✅ **Delete Category** (`deleteCategoryConfirmBtn`) - `passwords:delete` or `*:*`

**Note:** All password permissions are excluded from Manager, Operator, and Viewer roles

### Email Profile Management
- ❌ **Create Email Profile** (`createEmailProfileBtn`)
  - **Required Permission:** `settings:edit` or `*:*`
  - **Impact:** Viewers can create email profiles

### System Settings
- ❌ **Save Notifications** (`saveNotificationsBtn`)
  - **Required Permission:** `settings:edit` or `*:*`
  - **Impact:** Viewers can modify notification settings

- ❌ **Test Notification** (`testNotificationBtn`)
  - **Required Permission:** `settings:edit` or `*:*`

- ❌ **Test Core Service** (`testCoreServiceBtn`)
  - **Required Permission:** `settings:edit` or `*:*`

- ❌ **Save Core Service** (`saveCoreServiceBtn`)
  - **Required Permission:** `settings:edit` or `*:*`

### Database Maintenance ✅ **ALL CRITICAL OPERATIONS PROTECTED**
- ✅ **Rebuild Indexes** (`rebuildIndexesBtn`) - `databases:execute` or `*:*`

- ✅ **Update Statistics** (`updateStatisticsBtn`) - `databases:execute` or `*:*`

- ✅ **Shrink Database** (`shrinkDatabaseBtn`) - `databases:execute` or `*:*`

- ✅ **Backup Database** (`backupDatabaseBtn`) - `databases:execute` or `*:*`

- ✅ **Cleanup Audit** (`cleanupAuditBtn`) - `databases:execute` or `*:*`

- ✅ **Cleanup Orphans** (`cleanupOrphansBtn`) - `databases:execute` or `*:*`

- ✅ **Check DB Health** (`checkDbHealthBtn`) - No permission needed (OK for viewers)

### Data Import/Export
- ❌ **Export Data** (`exportDataBtn`) - `settings:view` or `*:*`
  - **Impact:** MEDIUM - Data exposure risk

- ❌ **Import Data** (`importDataBtn`) - `settings:edit` or `*:*`
  - **Impact:** HIGH - Can corrupt data

- ✅ **Clear All Data** (`clearAllDataBtn`) - `settings:delete` or `*:*` ✅ **PROTECTED**
  - **Impact:** CRITICAL - Complete data loss

### Bug Reporting
- ❌ **Submit Bug** (`bugSubmitBtn`)
  - **Required Permission:** May want to allow all users
  - **Impact:** LOW - Feedback mechanism

### Agent Management
- ❌ **Agent Operations** (buttons in Agent UI)
  - **Required Permission:** `agents:execute` or `*:*`
  - **Impact:** Viewers can control agents

---

## 📋 OK TO LEAVE PUBLIC (Safe for All Users)

### Navigation & UI
- ✅ **Sign Out** (`signOutBtn`) - All users should be able to sign out
- ✅ **View Profile** (`viewProfileBtn`) - All users can view their profile
- ✅ **Change Password** (`changePasswordBtn`) - All users should change password
- ✅ **Exit Application** (`confirmExitBtn`) - All users can close app
- ✅ **Refresh** buttons for viewing data - Generally OK
- ✅ **Search/Filter** buttons - OK for viewers
- ✅ **Pagination** buttons - OK for viewers

### Setup & Configuration
- ✅ **Initial Setup Wizard** - Needed before authentication
- ✅ **Database Configuration** (first-time setup) - Pre-authentication

---

## 🎯 PRIORITY LEVELS

### ✅ 🔴 CRITICAL (COMPLETED!)
1. ✅ **Environment Edit/Delete/Deploy** - Protected with permissions
2. ✅ **Server Edit/Delete/Connect** - Protected with permissions
3. ✅ **Credential Edit/Delete** - Protected with permissions
4. ✅ **Database Maintenance Operations** - All protected
5. ✅ **Clear All Data** - Protected with settings:delete
6. ✅ **Audit Log Clear** - Protected with audit:delete

### 🟡 HIGH (Fix Soon)
1. **Database Create/Edit/Delete** - Operational risk
2. **File Upload/Delete** - Storage and security
3. **Import Data** - Data corruption risk
4. **Password Manager Operations** - Security
5. **System Settings** - Configuration integrity

### 🟢 MEDIUM (Fix When Possible)
1. **Email Profile Management** - Configuration
2. **Channel/Message Creation** - Consider business rules
3. **Ticket Creation** - May want to allow
4. **Agent Operations** - Operational control
5. **Export Data** - Information disclosure

### ⚪ LOW (Review & Decide)
1. **Bug Reporting** - May want to allow all users
2. **Test Connections** - Generally harmless
3. **Refresh Operations** - Generally safe

---

## 📝 RECOMMENDED PERMISSION MAPPING

```javascript
// Environments
'environments:view'   → Viewers ✓
'environments:create' → Operators, Managers, Admins, Super Admins
'environments:edit'   → Operators, Managers, Admins, Super Admins
'environments:delete' → Managers, Admins, Super Admins
'environments:execute'→ Operators, Managers, Admins, Super Admins

// Servers
'servers:view'        → Viewers ✓
'servers:create'      → Operators, Managers, Admins, Super Admins
'servers:edit'        → Operators, Managers, Admins, Super Admins
'servers:delete'      → Managers, Admins, Super Admins
'servers:execute'     → Operators, Managers, Admins, Super Admins

// Credentials
'credentials:view'    → Viewers ✓
'credentials:create'  → Managers, Admins, Super Admins
'credentials:edit'    → Managers, Admins, Super Admins
'credentials:delete'  → Managers, Admins, Super Admins

// Databases
'databases:view'      → Viewers ✓
'databases:create'    → Managers, Admins, Super Admins
'databases:edit'      → Managers, Admins, Super Admins
'databases:delete'    → Admins, Super Admins
'databases:execute'   → Admins, Super Admins

// Audit
'audit:view'          → Managers, Admins, Super Admins
'audit:delete'        → Super Admins only

// Files
'files:view'          → Viewers ✓
'files:upload'        → Operators, Managers, Admins, Super Admins
'files:download'      → Viewers ✓
'files:delete'        → Managers, Admins, Super Admins

// Messages
'messages:view'       → All users
'messages:create'     → All users (or restrict per business rules)

// Settings
'settings:view'       → Admins, Super Admins
'settings:edit'       → Admins, Super Admins
'settings:delete'     → Super Admins only
```

---

## 🔧 NEXT STEPS

1. **Phase 1 (CRITICAL):** Add permission checks to environment/server/credential edit/delete
2. **Phase 2 (HIGH):** Protect database operations and file management
3. **Phase 3 (MEDIUM):** Add permissions to remaining administrative functions
4. **Phase 4 (LOW):** Review and decide on messaging/tickets/bugs

---

## 📌 NOTES

- All permission attributes should use `data-permissions-any="permission,*:*"` format
- After adding attributes, ensure `PermissionUI.applyPermissions()` is called
- Consider adding server-side permission checks as well
- Test thoroughly with each role level
- Document any business logic exceptions
