# User Recovery Installation Guide

This guide will walk you through installing and configuring the User Recovery feature in OrbisHub Desktop.

## Prerequisites

Before installing the User Recovery feature, ensure you have:

1. ✅ **Email Server Profile Configured**
   - At least one active Email Server Profile
   - Profile set as default
   - SMTP credentials tested and working

2. ✅ **Database Access**
   - SQL Server connection established
   - Permissions to create tables and stored procedures
   - Users table with email column

3. ✅ **OrbisHub Desktop Application**
   - Main application running
   - Database connection working
   - User authentication system functional

## Installation Steps

### Step 1: Install Database Schema

The database schema creates the necessary tables and stored procedures for password recovery.

#### Option A: Using SQL Server Management Studio (SSMS)

1. Open SQL Server Management Studio
2. Connect to your OrbisHub database
3. Open the file: `Functions/UserRecovery/recovery-schema.sql`
4. Execute the script (F5)
5. Verify output shows successful table creation

```sql
-- Expected output:
-- Table PasswordResetTokens created successfully
-- Table AccountRecoveryLog created successfully
-- Stored procedure sp_CreatePasswordResetToken created
-- Stored procedure sp_VerifyPasswordResetToken created
-- Stored procedure sp_CleanupExpiredResetTokens created
-- Stored procedure sp_GetUserForRecovery created
```

#### Option B: Using Command Line (sqlcmd)

```powershell
sqlcmd -S YOUR_SERVER -d OrbisHub -i "Functions\UserRecovery\recovery-schema.sql"
```

#### Verify Installation

Run this query to verify tables were created:

```sql
SELECT name FROM sys.tables 
WHERE name IN ('PasswordResetTokens', 'AccountRecoveryLog');

SELECT name FROM sys.procedures 
WHERE name LIKE 'sp_%Reset%' OR name LIKE 'sp_%Recovery%';
```

### Step 2: Add Script References to index.html

Add the User Recovery scripts to your main HTML file.

Open `app/index.html` and add these script tags **after** the Email Service scripts:

```html
<!-- Email Server Profile (should already exist) -->
<script src="../Functions/EmailServerProfile/email-service.js"></script>
<script src="../Functions/EmailServerProfile/email-ui.js"></script>

<!-- User Recovery (NEW - Add these) -->
<link rel="stylesheet" href="../Functions/UserRecovery/recovery-ui.css">
<script src="../Functions/UserRecovery/recovery-service.js"></script>
<script src="../Functions/UserRecovery/recovery-ui.js"></script>
```

**Important**: Recovery service must be loaded **after** Email Service since it depends on it.

### Step 3: Add Forgot Password Link to Login Screen

Modify your login screen to include a "Forgot Password" link.

#### Find Your Login Form

Locate your login form in `app/index.html`. It typically looks like:

```html
<form id="loginForm">
  <input type="text" id="loginUsername" />
  <input type="password" id="loginPassword" />
  <button type="submit">Login</button>
</form>
```

#### Add Forgot Password Link

Add this link below your login button:

```html
<form id="loginForm">
  <input type="text" id="loginUsername" placeholder="Username" />
  <input type="password" id="loginPassword" placeholder="Password" />
  <button type="submit">Login</button>
  
  <!-- NEW: Forgot Password Link -->
  <div style="text-align: center; margin-top: 15px;">
    <a href="#" class="forgot-password-link" onclick="RecoveryUI.openForgotPasswordModal(); return false;">
      Forgot Password?
    </a>
  </div>
</form>
```

### Step 4: Ensure Users Have Email Addresses

The recovery feature requires users to have email addresses in the database.

#### Check Current Users

```sql
SELECT id, username, email, name
FROM Users
WHERE email IS NULL OR email = '';
```

#### Add Missing Emails

Update users who don't have email addresses:

```sql
-- Update individual user
UPDATE Users 
SET email = 'user@company.com' 
WHERE username = 'john.doe';

-- Or bulk update (adjust as needed)
UPDATE Users 
SET email = username + '@yourcompany.com' 
WHERE email IS NULL OR email = '';
```

### Step 5: Configure Email Server Profile

Ensure you have a default email server profile configured.

1. **Open OrbisHub Desktop**
2. **Navigate to Settings → Email Server Profiles**
3. **Create or Configure Profile**:
   - Set SMTP server details
   - Configure authentication
   - Test the connection
   - Mark as "Default" and "Active"

#### Quick Test

```javascript
// In browser console, test email service
const profile = await EmailService.getDefaultProfile();
console.log('Default profile:', profile);
```

### Step 6: Test the Installation

#### Test 1: Open Recovery Modal

1. Go to login screen
2. Click "Forgot Password?" link
3. Modal should open with request form

#### Test 2: Request Password Reset

1. Enter a valid username or email
2. Click "Send Reset Email"
3. Check Email Queue table:

```sql
SELECT TOP 5 * FROM EmailQueue 
WHERE category = 'password-reset'
ORDER BY createdAt DESC;
```

#### Test 3: Verify Token Generation

```sql
SELECT TOP 5 u.username, p.token, p.expiresAt, p.emailStatus
FROM PasswordResetTokens p
INNER JOIN Users u ON p.userId = u.id
ORDER BY p.requestedAt DESC;
```

#### Test 4: Complete Password Reset

1. Copy token from email (or database)
2. Click "I have a reset token"
3. Enter token
4. Set new password
5. Login with new password

### Step 7: Configure Email Template (Optional)

If you want to customize the email template:

1. **Using Database**:
   ```sql
   UPDATE EmailTemplates 
   SET bodyHtml = '<your custom HTML>',
       bodyText = 'your custom text'
   WHERE name = 'Password Reset';
   ```

2. **Using Code**:
   - Edit `recovery-service.js`
   - Modify `generateResetEmail()` method

## Post-Installation Configuration

### Set Up Token Cleanup Job

Create a scheduled task to clean up old tokens weekly.

#### SQL Server Agent Job

```sql
-- Create job to run weekly
EXEC sp_CleanupExpiredResetTokens @retentionDays = 30;
```

#### Windows Task Scheduler

Create a task that runs this PowerShell script weekly:

```powershell
# cleanup-recovery-tokens.ps1
sqlcmd -S YOUR_SERVER -d OrbisHub -Q "EXEC sp_CleanupExpiredResetTokens @retentionDays = 30"
```

### Configure Security Settings

#### Adjust Token Expiration (Optional)

Edit `recovery-service.js` to change default expiration:

```javascript
// Find this line in requestPasswordReset():
const expiryMinutes = 60; // Change to desired minutes
```

#### Customize Password Requirements

Edit `validatePassword()` in `recovery-service.js`:

```javascript
validatePassword(password) {
  if (!password || password.length < 12) { // Increase minimum
    return {
      valid: false,
      message: 'Password must be at least 12 characters long'
    };
  }
  
  // Add more requirements as needed
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one uppercase letter'
    };
  }
  
  // ... more validations
}
```

## Troubleshooting Installation

### Issue: Scripts Not Loading

**Symptoms**: `RecoveryService is not defined` error in console

**Solution**:
1. Verify script paths in index.html
2. Check browser console for 404 errors
3. Ensure EmailService is loaded first
4. Hard refresh browser (Ctrl+F5)

### Issue: Database Tables Not Created

**Symptoms**: SQL errors when requesting reset

**Solution**:
1. Re-run recovery-schema.sql
2. Check SQL Server error log
3. Verify database permissions
4. Ensure OrbisHub database is selected

### Issue: Emails Not Sending

**Symptoms**: Reset requested but no email received

**Solution**:
1. Verify Email Server Profile is active and default
2. Check EmailQueue table for status
3. Test email profile connection
4. Review email service logs
5. Check spam folder

### Issue: Token Verification Fails

**Symptoms**: "Invalid or expired token" message

**Solution**:
1. Verify token copied correctly (no extra spaces)
2. Check token expiration time
3. Ensure token hasn't been used already
4. Query PasswordResetTokens table directly

### Issue: Users Can't Reset

**Symptoms**: "No email associated with account" error

**Solution**:
1. Verify users have email addresses in database
2. Update Users table with email addresses
3. Ensure email column is not NULL

## Security Checklist

After installation, verify these security measures:

- [ ] Email Server Profile uses SSL/TLS
- [ ] Password requirements are appropriate for your organization
- [ ] Token expiration is reasonable (60 minutes recommended)
- [ ] Cleanup job is scheduled
- [ ] Audit logs are being created
- [ ] Test account lockout doesn't interfere with reset
- [ ] Recovery logs are monitored

## Monitoring and Maintenance

### View Recent Recovery Activity

```sql
-- Last 50 recovery attempts
SELECT TOP 50 
  username, 
  email, 
  action, 
  status, 
  failureReason,
  createdAt
FROM AccountRecoveryLog
ORDER BY createdAt DESC;
```

### View Active Tokens

```sql
-- Currently valid tokens
SELECT 
  u.username,
  u.email,
  p.requestedAt,
  p.expiresAt,
  DATEDIFF(MINUTE, GETDATE(), p.expiresAt) as MinutesRemaining
FROM PasswordResetTokens p
INNER JOIN Users u ON p.userId = u.id
WHERE p.isUsed = 0 AND p.expiresAt > GETDATE()
ORDER BY p.requestedAt DESC;
```

### Monitor Email Queue

```sql
-- Password reset emails
SELECT 
  status,
  COUNT(*) as Count
FROM EmailQueue
WHERE category = 'password-reset'
  AND createdAt > DATEADD(DAY, -7, GETDATE())
GROUP BY status;
```

## Uninstallation

If you need to remove the User Recovery feature:

### 1. Remove Script References

Remove from `app/index.html`:
```html
<!-- Remove these lines -->
<link rel="stylesheet" href="../Functions/UserRecovery/recovery-ui.css">
<script src="../Functions/UserRecovery/recovery-service.js"></script>
<script src="../Functions/UserRecovery/recovery-ui.js"></script>
```

### 2. Remove Forgot Password Link

Remove the forgot password link from your login form.

### 3. Drop Database Objects (Optional)

```sql
-- Drop tables and procedures
DROP TABLE IF EXISTS AccountRecoveryLog;
DROP TABLE IF EXISTS PasswordResetTokens;

DROP PROCEDURE IF EXISTS sp_CreatePasswordResetToken;
DROP PROCEDURE IF EXISTS sp_VerifyPasswordResetToken;
DROP PROCEDURE IF EXISTS sp_CleanupExpiredResetTokens;
DROP PROCEDURE IF EXISTS sp_GetUserForRecovery;
```

## Support

If you encounter issues during installation:

1. Check the [README.md](README.md) for feature documentation
2. Review the troubleshooting section above
3. Check browser console for JavaScript errors
4. Review SQL Server error logs
5. Contact your system administrator

## Next Steps

After successful installation:

1. ✅ Test the complete recovery flow with a test user
2. ✅ Configure token cleanup schedule
3. ✅ Update user email addresses if needed
4. ✅ Train users on the new feature
5. ✅ Monitor recovery logs for the first week
6. ✅ Adjust settings based on user feedback

## Version History

- **v1.0** - Initial release with email-based password recovery
