# Email Server Profile - OrbisHub

## Overview

The Email Server Profile module provides comprehensive email functionality for OrbisHub, similar to CRM Dynamics Email Server Profiles. It enables:

- **Password Recovery**: Send reset links to users who forgot their passwords
- **Bug Report Notifications**: Automatically notify admins about reported bugs
- **Account Alerts**: Send lockout and security notifications
- **Custom Emails**: Use templates for any automated email communication

## Features

### 📧 Email Server Profiles
- Multiple SMTP server configurations
- Support for Gmail, Outlook, SendGrid, and custom SMTP servers
- Secure password encryption (AES-256)
- SSL/TLS support
- Connection testing before going live
- Default profile selection
- Rate limiting (hourly/daily)

### 📬 Email Queue System
- Automatic retry mechanism with configurable attempts
- Priority-based sending (1-10 scale)
- Queue status tracking (pending, sending, sent, failed)
- Failed email tracking with error messages
- Scheduled retry with exponential backoff

### 📝 Email Templates
- Pre-built templates for common scenarios
- Variable substitution ({{userName}}, {{resetLink}}, etc.)
- HTML and plain text versions
- Custom template creation
- System templates (protected from deletion)

### 📊 Sent Email History
- Archive of all sent emails
- Searchable by recipient, type, date
- Audit trail for compliance
- Body preview for quick reference

## Architecture

```
Functions/EmailServerProfile/
├── email-schema.sql          # Database tables and default templates
├── email-service.js          # Core email operations (send, queue, templates)
├── email-ui.js              # UI controller for profile management
├── email-ui.css             # Styles for email configuration UI
├── email-modals.html        # Modal dialogs for email operations
├── README.md                # This file
└── INSTALLATION.md          # Installation guide
```

## Database Schema

### EmailServerProfiles
Stores SMTP server configurations with encrypted credentials.

**Key Fields:**
- `name`, `description` - Profile identification
- `smtpHost`, `smtpPort`, `useSSL`, `useTLS` - Server configuration
- `username`, `password_encrypted` - Authentication (password is AES-256 encrypted)
- `fromEmail`, `fromName`, `replyToEmail` - Sender information
- `isActive`, `isDefault` - Profile status
- `maxRetriesOnFailure`, `retryIntervalMinutes` - Retry logic
- `maxEmailsPerHour`, `maxEmailsPerDay` - Rate limiting
- `lastTestDate`, `lastTestStatus` - Connection testing

### EmailQueue
Manages outbound email queue with retry logic.

**Key Fields:**
- `toEmail`, `subject`, `bodyHtml`, `bodyText` - Email content
- `emailType` - Type of email (password_reset, bug_report, notification, etc.)
- `status` - Queue status (pending, sending, sent, failed, cancelled)
- `priority` - Priority level (1-10, lower = higher priority)
- `attempts`, `maxAttempts` - Retry tracking
- `nextRetryDate` - Scheduled retry time
- `errorMessage` - Last error if failed

### EmailTemplates
Reusable HTML email templates with variable substitution.

**Key Fields:**
- `name`, `description` - Template identification
- `emailType` - Associated email type
- `subject`, `bodyHtml`, `bodyText` - Template content
- `variables` - JSON array of available variables
- `isSystem` - System templates (cannot be deleted)

### EmailSentHistory
Archive of successfully sent emails for audit purposes.

**Key Fields:**
- `toEmail`, `subject`, `emailType` - Email metadata
- `sentAt`, `sentBy` - Audit information
- `bodyPreview` - First 1000 chars for search
- `relatedEntityType`, `relatedEntityId` - Context linking

## Usage

### Creating an Email Profile

1. Navigate to **System Configuration → Email Server Profile**
2. Click **Create Email Profile**
3. Fill in the profile details:
   - **Profile Name**: Descriptive name (e.g., "Company SMTP")
   - **SMTP Host**: Your mail server (e.g., smtp.gmail.com)
   - **SMTP Port**: Usually 587 (TLS) or 465 (SSL)
   - **Security**: Enable SSL/TLS as required
   - **Authentication**: Provide username and password
   - **From Email/Name**: Sender information
   - **Advanced Settings**: Configure retries and rate limits
4. Click **Save Profile**
5. Test the connection using the test button

### Common SMTP Configurations

#### Gmail
```
Host: smtp.gmail.com
Port: 587
Security: TLS
Username: your-email@gmail.com
Password: App Password (not regular password)
```
**Note**: Generate an App Password at Google Account → Security → 2-Step Verification → App passwords

#### Outlook / Office 365
```
Host: smtp.office365.com
Port: 587
Security: TLS
Username: your-email@outlook.com
Password: Your account password
```

#### SendGrid
```
Host: smtp.sendgrid.net
Port: 587
Security: TLS
Username: apikey
Password: Your SendGrid API Key
```

### Sending Emails Programmatically

```javascript
// Queue a password reset email
const emailId = await window.EmailService.sendPasswordResetEmail(
    userId,
    userEmail,
    userName,
    resetToken
);

// Queue a bug report email
const emailId = await window.EmailService.sendBugReportEmail(
    bugData,
    recipientEmail
);

// Queue custom email
const emailId = await window.EmailService.queueEmail({
    toEmail: 'user@example.com',
    toName: 'User Name',
    subject: 'Your Subject',
    bodyHtml: '<p>Your HTML content</p>',
    bodyText: 'Your plain text content',
    emailType: 'custom',
    priority: 5
});

// Send immediately (or retry queue item)
await window.EmailService.sendQueuedEmail(emailId);
```

### Using Templates

```javascript
// Get template
const templates = await window.EmailService.getTemplates('password_reset');
const template = templates[0];

// Render with variables
const rendered = window.EmailService.renderTemplate(template, {
    userName: 'John Doe',
    resetLink: 'https://app.com/reset?token=xyz',
    expiryTime: '30 minutes'
});

// Queue email
await window.EmailService.queueEmail({
    toEmail: 'john@example.com',
    subject: rendered.subject,
    bodyHtml: rendered.bodyHtml,
    bodyText: rendered.bodyText,
    emailType: 'password_reset'
});
```

## Security

- **Password Encryption**: SMTP passwords are encrypted using AES-256-CBC before storage
- **Secure Connection**: SSL/TLS support for encrypted SMTP connections
- **Credential Isolation**: Each profile has independent credentials
- **Audit Trail**: All sent emails are logged in EmailSentHistory

## Troubleshooting

### Test Email Fails

1. **Verify SMTP credentials** - Ensure username/password are correct
2. **Check port and security settings** - Port 587 usually requires TLS, 465 requires SSL
3. **Firewall/Network** - Ensure outbound SMTP ports are not blocked
4. **Gmail App Password** - Use an App Password, not your regular password
5. **Check logs** - Review the error message in the test result

### Emails Stuck in Queue

1. **Check profile status** - Ensure the email profile is **Active**
2. **Review error messages** - Check the `errorMessage` field in EmailQueue
3. **Retry failed emails** - They will retry automatically based on retry settings
4. **Manual retry** - Use the Email Queue viewer to retry specific emails

### Rate Limiting

If emails are being rate-limited:
1. Check `maxEmailsPerHour` and `maxEmailsPerDay` settings
2. Adjust limits in the email profile configuration
3. Consider adding additional email profiles for load distribution

## API Reference

### EmailService Methods

- `getAllProfiles()` - Get all email server profiles
- `getDefaultProfile()` - Get active default profile
- `getProfileById(profileId)` - Get specific profile
- `createProfile(profile)` - Create new profile
- `updateProfile(profileId, updates)` - Update existing profile
- `deleteProfile(profileId)` - Delete profile
- `testProfile(profileId, testEmail)` - Test connection and send test email
- `queueEmail(emailData)` - Add email to queue
- `sendQueuedEmail(emailQueueId)` - Send email from queue
- `getQueueItems(filters)` - Get queue items with optional filters
- `getTemplates(emailType)` - Get templates by type
- `renderTemplate(template, variables)` - Render template with variables
- `sendPasswordResetEmail(userId, userEmail, userName, resetToken)` - Queue password reset
- `sendBugReportEmail(bugData, recipientEmail)` - Queue bug report
- `getSentHistory(filters)` - Get sent email history

## Integration Points

The Email Server Profile integrates with:

- **User Management**: Password reset functionality
- **Bug Reporting**: Automatic bug notification emails
- **Security**: Account lockout notifications
- **Audit System**: All email activity is logged
- **Future Features**: Ticket notifications, deployment alerts, system health reports

## Best Practices

1. **Test First**: Always test your SMTP configuration before going live
2. **Use Default Profile**: Set one profile as default for convenience
3. **Monitor Queue**: Regularly check the email queue for failed emails
4. **Rate Limiting**: Set appropriate limits to avoid being flagged as spam
5. **Template Variables**: Use templates for consistent, professional emails
6. **Audit Compliance**: Retain sent email history for compliance needs

## License

Part of OrbisHub - By Admins, For Admins
