# Troubleshooting: Admin User Not Created

## Problem
After installing OrbisHub and setting up the database, the login page says "admin/admin" but there's no user in the database.

## Root Causes

### 1. **Database Connection Pool Issue**
The most common cause is that after running migrations, the database connection pool is not properly initialized when `createDefaultAdmin()` runs.

### 2. **Silent Failure**
The `dbExecute` call may be failing but the error is being swallowed.

### 3. **Timing Issue**
The admin user creation happens immediately after migrations, and the connection might not be fully ready.

## Diagnostic Steps

### Step 1: Check if Users table exists
```sql
SELECT * FROM sys.tables WHERE name = 'Users'
```

### Step 2: Check if any users exist
```sql
SELECT * FROM Users
```

### Step 3: Run the diagnostic script
Execute the `diagnose-admin-user.sql` script in this directory against your OrbisHub database.

## Solution Options

### Option A: Manual Admin User Creation (Quick Fix)

1. Open SQL Server Management Studio (SSMS)
2. Connect to your database
3. Run this script to create the admin user:

```sql
-- Delete existing admin user if any
DELETE FROM Users WHERE username = 'admin'

-- Create new admin user
DECLARE @adminId NVARCHAR(50) = NEWID()

INSERT INTO Users (
    id, username, password, name, email, role, position, squad,
    lastLogin, lastActivity, ip, isActive, changePasswordOnLogin, created_at
) 
VALUES (
    @adminId, 
    'admin', 
    'admin',  -- Plain text password (temporary - change on first login)
    'Administrator', 
    'admin@orbishub.com', 
    'Super Admin', 
    'System Administrator', 
    'IT Operations',
    0,
    0,
    '127.0.0.1',
    1,
    1,  -- Force password change on first login
    GETDATE()
)

-- Verify
SELECT id, username, name, role, created_at FROM Users WHERE username = 'admin'
```

4. Now try logging in with `admin` / `admin`

### Option B: Re-run Setup Wizard

1. Delete the database configuration:
   - Close OrbisHub Desktop
   - Navigate to: `%APPDATA%\OrbisHub Desktop\`
   - Delete `db-config.json`
   - Restart OrbisHub Desktop
   - Go through the setup wizard again

### Option C: Use the "Reset Database & Create Admin" Button

1. In OrbisHub Desktop, go to **Admin Panel** → **Database Management**
2. Look for "Reset Database & Create Admin" or similar button
3. Click it to recreate the admin user

## Code Fix Applied

The following fix has been applied to `app-main.js`:

- Added proper error checking after `dbExecute` call
- Now throws an error if the INSERT fails
- Added console logging to track admin user creation
- Returns the result for verification

## Preventing This Issue

### For Future Installations:

1. **Ensure database connection is stable** before running migrations
2. **Check console logs** in Developer Tools (F12) during setup
3. **Verify Users table** is created before attempting user creation
4. **Add retry logic** for admin user creation if initial attempt fails

## Technical Details

### Where Admin User is Created
- **File**: `app-main.js`
- **Function**: `createDefaultAdmin()`
- **Called From**: `runMigrations()` during setup wizard step 3

### Database Requirements
- SQL Server 2016 or later
- User table must exist with proper schema
- Database connection pool must be initialized

### Expected Behavior
1. Setup wizard runs migrations
2. Creates all tables including `Users`
3. Immediately creates admin user with username `admin` and password `admin`
4. User should be visible in `Users` table

## Need More Help?

If the issue persists after trying these solutions:

1. **Check the console logs**: Open Developer Tools (F12) and look for error messages
2. **Check database permissions**: Ensure the SQL user has INSERT permissions on the Users table
3. **Verify migrations completed**: Check if all tables were created successfully
4. **Review connection string**: Ensure it's pointing to the correct database

## Testing the Fix

After applying the fix, you can test it by:

1. Deleting all users from the database:
   ```sql
   DELETE FROM Users
   ```

2. In OrbisHub Desktop console (F12), run:
   ```javascript
   createDefaultAdmin().then(r => console.log('Result:', r)).catch(e => console.error('Error:', e))
   ```

3. Check if the user was created:
   ```sql
   SELECT * FROM Users WHERE username = 'admin'
   ```
