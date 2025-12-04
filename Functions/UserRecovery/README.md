# User Recovery - Password Reset via Email

## Overview

The **User Recovery** feature provides a secure password reset mechanism for OrbisHub users via email. This feature integrates with the Email Server Profile system to send password reset tokens and allows users to recover their accounts without administrator intervention.

## Features

### 🔐 Core Functionality
- **Self-Service Password Reset**: Users can reset their own passwords
- **Email-Based Verification**: Secure token delivery via email
- **Token Expiration**: Reset tokens expire after 60 minutes
- **Security Logging**: All recovery attempts are logged for audit
- **Account Protection**: Prevents brute force and enumeration attacks

### 📧 Email Integration
- Uses the default Email Server Profile for sending emails
- Professional HTML email templates
- Confirmation emails after password reset
- Customizable email content

### 🔒 Security Features
- **Password Validation**: Enforces strong password requirements
- **Token-Based Authentication**: Cryptographically secure tokens
- **One-Time Use**: Tokens can only be used once
- **Automatic Expiration**: Old tokens are automatically invalidated
- **Audit Trail**: Complete logging of all recovery activities

## How It Works

### User Flow

1. **Request Reset**
   - User clicks "Forgot Password" on login screen
   - Enters username or email address
   - System sends reset token via email

2. **Verify Token**
   - User receives email with reset token
   - User enters token in the application
   - System validates token and expiration

3. **Reset Password**
   - User creates new password
   - System validates password strength
   - Password is updated and token is marked as used

4. **Confirmation**
   - User receives confirmation email
   - User can login with new password

### System Flow

```
┌─────────────┐
│ User Requests│
│   Reset     │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ System Validates    │
│ User & Email Exists │
└──────┬──────────────┘
       │
       ▼
┌─────────────────┐
│ Generate Secure │
│     Token       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Queue Email    │
│  with Token     │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ User Enters     │
│     Token       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Verify Token    │
│  Not Expired    │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ User Sets New   │
│    Password     │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Update Password │
│  Mark Token Used│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Send Confirmation│
│      Email      │
└─────────────────┘
```

## Database Schema

### PasswordResetTokens Table
Stores temporary tokens for password reset requests.

| Column | Type | Description |
|--------|------|-------------|
| id | NVARCHAR(50) | Primary key |
| userId | NVARCHAR(50) | Foreign key to Users |
| token | NVARCHAR(255) | Secure reset token (unique) |
| expiresAt | DATETIME2 | Token expiration timestamp |
| isUsed | BIT | Whether token has been used |
| usedAt | DATETIME2 | When token was used |
| requestedAt | DATETIME2 | When reset was requested |
| requestIp | NVARCHAR(50) | IP address of request |
| userAgent | NVARCHAR(500) | Browser/client info |
| emailSentTo | NVARCHAR(255) | Email address |
| emailSentAt | DATETIME2 | When email was sent |
| emailStatus | NVARCHAR(50) | Email status |

### AccountRecoveryLog Table
Audit log for all recovery attempts.

| Column | Type | Description |
|--------|------|-------------|
| id | NVARCHAR(50) | Primary key |
| userId | NVARCHAR(50) | Foreign key to Users |
| username | NVARCHAR(50) | Username attempted |
| email | NVARCHAR(255) | Email used |
| action | NVARCHAR(50) | Action type |
| status | NVARCHAR(50) | Success/failed/blocked |
| requestIp | NVARCHAR(50) | IP address |
| userAgent | NVARCHAR(500) | Browser/client |
| failureReason | NVARCHAR(500) | Error details |
| metadata | NVARCHAR(MAX) | Additional JSON data |
| createdAt | DATETIME2 | Timestamp |

## API Reference

### RecoveryService

#### `requestPasswordReset(usernameOrEmail)`
Request a password reset for a user.

```javascript
const result = await RecoveryService.requestPasswordReset('john.doe@company.com');
// Returns: { success: true, message: '...', tokenId: '...' }
```

#### `verifyResetToken(token)`
Verify a password reset token is valid.

```javascript
const result = await RecoveryService.verifyResetToken('abc123...');
// Returns: { success: true, valid: true, user: {...}, expiresAt: '...' }
```

#### `resetPassword(token, newPassword)`
Reset a user's password with a valid token.

```javascript
const result = await RecoveryService.resetPassword('abc123...', 'NewSecurePass123');
// Returns: { success: true, message: 'Password successfully reset...' }
```

#### `validatePassword(password)`
Validate password meets requirements.

```javascript
const validation = RecoveryService.validatePassword('MyPass123');
// Returns: { valid: true } or { valid: false, message: '...' }
```

#### `cleanupExpiredTokens(retentionDays)`
Clean up old expired tokens (admin function).

```javascript
const result = await RecoveryService.cleanupExpiredTokens(30);
// Returns: { success: true, data: { DeletedTokens: 5, DeletedLogEntries: 10 } }
```

### RecoveryUI

#### `openForgotPasswordModal()`
Opens the password recovery modal.

```javascript
RecoveryUI.openForgotPasswordModal();
```

#### `closeForgotPasswordModal()`
Closes the password recovery modal.

```javascript
RecoveryUI.closeForgotPasswordModal();
```

## Password Requirements

- Minimum 8 characters
- Maximum 128 characters
- At least one letter (a-z or A-Z)
- At least one number (0-9)

## Security Considerations

### Protection Against Attacks

1. **User Enumeration Prevention**
   - Always returns success message regardless of user existence
   - Prevents attackers from discovering valid usernames

2. **Token Security**
   - Cryptographically secure random tokens (256-bit)
   - One-time use only
   - Automatic expiration (60 minutes)
   - Stored hashed in database

3. **Rate Limiting** (Recommended)
   - Implement rate limiting on reset requests
   - Track requests by IP address
   - Limit to 3 requests per hour per IP

4. **Email Verification**
   - Only users with valid email addresses can reset
   - Email must be registered in system

5. **Audit Logging**
   - All recovery attempts logged
   - Failed attempts tracked
   - Includes IP and user agent

### Best Practices

1. **Regular Token Cleanup**
   - Run cleanup job weekly or monthly
   - Remove expired tokens older than 30 days

2. **Monitor Recovery Logs**
   - Review failed attempts regularly
   - Look for suspicious patterns

3. **Email Security**
   - Use SSL/TLS for email transmission
   - Configure SPF/DKIM for email domain

4. **User Education**
   - Inform users about password requirements
   - Warn about phishing attempts

## Email Templates

### Password Reset Email
Professional HTML email with:
- Reset token clearly displayed
- Step-by-step instructions
- Expiration time warning
- Security notice

### Password Changed Confirmation
Confirmation email sent after successful reset with security notice.

## Troubleshooting

### User Not Receiving Email

1. **Check Email Profile**
   - Ensure default email profile is active
   - Test email profile connection

2. **Verify User Email**
   - User must have valid email in database
   - Email must not be empty

3. **Check Email Queue**
   - Query EmailQueue table for pending emails
   - Check for failed email status

4. **Spam Folder**
   - Instruct users to check spam/junk folder
   - Whitelist sender domain

### Token Validation Fails

1. **Token Expired**
   - Tokens expire after 60 minutes
   - Request new reset token

2. **Token Already Used**
   - Each token can only be used once
   - Request new reset token

3. **Invalid Token**
   - Ensure token is copied exactly
   - Check for extra spaces or characters

### Password Reset Fails

1. **Password Requirements**
   - Verify password meets minimum requirements
   - Check password length and complexity

2. **Database Connection**
   - Ensure database is accessible
   - Check connection string

3. **Permissions**
   - Verify user has permission to update Users table

## Maintenance

### Cleanup Old Tokens

Run this SQL or use the service method:

```sql
EXEC sp_CleanupExpiredResetTokens @retentionDays = 30;
```

Or in JavaScript:
```javascript
await RecoveryService.cleanupExpiredTokens(30);
```

### View Recovery Logs

```sql
SELECT TOP 100 *
FROM AccountRecoveryLog
ORDER BY createdAt DESC;
```

### Check Active Tokens

```sql
SELECT u.username, u.email, p.token, p.expiresAt, p.isUsed
FROM PasswordResetTokens p
INNER JOIN Users u ON p.userId = u.id
WHERE p.isUsed = 0 AND p.expiresAt > GETDATE()
ORDER BY p.requestedAt DESC;
```

## Integration

See [INSTALLATION.md](INSTALLATION.md) for detailed integration instructions.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review audit logs for errors
3. Contact your system administrator

## License

Part of the OrbisHub Desktop application.
