# Email Server Profile - Installation Guide

## Prerequisites

- OrbisHub Desktop installed
- Access to SQL Server database (same database as OrbisHub)
- SMTP server credentials (Gmail, Outlook, SendGrid, or custom)
- Node.js package `nodemailer` (automatically installed with OrbisHub Desktop)

## Installation Steps

### Step 1: Run Database Schema

Execute the email schema SQL script to create the necessary tables and default templates.

**Option A: From OrbisHub Desktop (Recommended)**
1. The schema will be applied automatically during OrbisHub updates
2. No manual action required

**Option B: Manual Installation (If needed)**
1. Open SQL Server Management Studio (SSMS)
2. Connect to your OrbisHub database
3. Open `Functions/EmailServerProfile/email-schema.sql`
4. Execute the script against your OrbisHub database

Expected tables created:
- `EmailServerProfiles`
- `EmailQueue`
- `EmailTemplates`
- `EmailSentHistory`

### Step 2: Install Node Dependencies

The `nodemailer` package is required for sending emails.

**Automatic Installation:**
```powershell
# Navigate to OrbisHub Desktop directory
cd "C:\Program Files\OrbisHub Desktop\resources\app"

# Install dependencies (if not already installed)
npm install
```

**Manual Installation (if needed):**
```powershell
npm install nodemailer@^6.9.7
```

### Step 3: Verify Installation

1. Launch OrbisHub Desktop
2. Navigate to **System Configuration** (admin section)
3. Click on the **Email Server Profile** tab
4. You should see an empty state with "No Email Server Profiles"

### Step 4: Create Your First Email Profile

#### For Gmail Users

1. Click **Create Email Profile**
2. Fill in the form:
   - **Profile Name**: `Gmail SMTP`
   - **Description**: `Company Gmail SMTP server`
   - **SMTP Host**: `smtp.gmail.com`
   - **SMTP Port**: `587`
   - **Use TLS**: ✅ Checked
   - **Use SSL**: ✅ Checked
   - **Require Authentication**: ✅ Checked
   - **Username**: `your-email@gmail.com`
   - **Password**: (see App Password section below)
   - **From Email**: `your-email@gmail.com`
   - **From Name**: `OrbisHub System`
   - **Set as Default**: ✅ Checked
   - **Active**: ✅ Checked
3. Click **Save Profile**

**Gmail App Password Setup:**
1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** if not already enabled
3. Click **App passwords**
4. Select **Other (Custom name)**
5. Name it "OrbisHub Desktop"
6. Click **Generate**
7. Copy the 16-character password (without spaces)
8. Use this as the password in your email profile

#### For Outlook / Office 365 Users

1. Click **Create Email Profile**
2. Fill in the form:
   - **Profile Name**: `Outlook SMTP`
   - **SMTP Host**: `smtp.office365.com`
   - **SMTP Port**: `587`
   - **Use TLS**: ✅ Checked
   - **Username**: `your-email@outlook.com`
   - **Password**: Your Outlook password
   - **From Email**: `your-email@outlook.com`
   - **From Name**: `OrbisHub System`
   - **Set as Default**: ✅ Checked
3. Click **Save Profile**

#### For SendGrid Users

1. Click **Create Email Profile**
2. Fill in the form:
   - **Profile Name**: `SendGrid SMTP`
   - **SMTP Host**: `smtp.sendgrid.net`
   - **SMTP Port**: `587`
   - **Use TLS**: ✅ Checked
   - **Username**: `apikey` (literal string)
   - **Password**: Your SendGrid API Key
   - **From Email**: Your verified sender email
   - **From Name**: `OrbisHub System`
   - **Set as Default**: ✅ Checked
3. Click **Save Profile**

**SendGrid API Key Setup:**
1. Log into SendGrid
2. Go to **Settings → API Keys**
3. Click **Create API Key**
4. Select **Restricted Access**
5. Enable **Mail Send** permission
6. Copy the API key

### Step 5: Test Your Configuration

1. In the email profiles list, find your newly created profile
2. Click the **Test Connection** button (lightning bolt icon)
3. Enter your email address to receive the test email
4. Click **Send Test Email**
5. Check your inbox for the test email
6. If successful, the status will update to "✓ success"

### Step 6: Configure Email Templates (Optional)

Default templates are automatically created:
- Password Reset Request
- Bug Report Notification
- Account Locked Notification

To customize templates:
1. Query the `EmailTemplates` table in your database
2. Update the `subject`, `bodyHtml`, and `bodyText` fields
3. Ensure variable placeholders (e.g., `{{userName}}`) remain intact

### Step 7: Enable Email Features

Once your profile is configured and tested, the following features become available:

✅ **Password Recovery** - Users can request password reset links  
✅ **Bug Report Notifications** - Admins receive emails when bugs are reported  
✅ **Account Lockout Alerts** - Users are notified when their account is locked  
✅ **Custom Notifications** - Send emails programmatically from the app

## Troubleshooting

### Issue: "Test email failed - Authentication failed"

**Solution:**
- **Gmail**: Ensure you're using an App Password, not your regular password
- **Outlook**: Check if 2FA is enabled; may need an app password
- **All providers**: Verify username and password are correct

### Issue: "Connection timeout"

**Solution:**
1. Check firewall settings - ensure outbound connections on ports 587/465 are allowed
2. Verify SMTP host is correct (no typos)
3. Try alternative ports (587 for TLS, 465 for SSL, 25 for plain)

### Issue: "SSL/TLS error"

**Solution:**
1. For port 587, ensure **Use TLS** is checked
2. For port 465, ensure **Use SSL** is checked
3. Some servers require both TLS and SSL checked

### Issue: "Emails stuck in queue"

**Solution:**
1. Check the EmailQueue table: `SELECT * FROM EmailQueue WHERE status = 'pending'`
2. Review error messages: `SELECT id, toEmail, errorMessage FROM EmailQueue WHERE status = 'failed'`
3. Ensure email profile is **Active**
4. Check `maxEmailsPerHour` / `maxEmailsPerDay` limits

### Issue: "Password encryption error"

**Solution:**
1. The encryption happens automatically in main.js
2. If errors persist, check `main.js` for the `encryptMessage()` function
3. Ensure the ENCRYPTION_KEY is properly initialized

## Advanced Configuration

### Multiple Email Profiles

You can create multiple profiles for different purposes:

```
1. Gmail - Default, for general notifications
2. SendGrid - High-priority, for password resets
3. Internal Exchange - For internal team communications
```

### Rate Limiting

To avoid being flagged as spam:

```
Max Emails Per Hour: 100
Max Emails Per Day: 1000
```

Adjust based on your SMTP provider's limits.

### Custom Retry Logic

Default settings:
- **Max Retries**: 3
- **Retry Interval**: 5 minutes

For critical emails, consider:
- **Max Retries**: 5
- **Retry Interval**: 2 minutes

## Verification Checklist

After installation, verify:

- [ ] Database tables created successfully
- [ ] nodemailer package installed
- [ ] Email Server Profile tab visible in System Configuration
- [ ] At least one email profile created
- [ ] Test email sent and received successfully
- [ ] Default profile is set and active
- [ ] Email templates exist in EmailTemplates table

## Next Steps

1. **Integrate with User Management**: Enable "Forgot Password" functionality
2. **Configure Bug Reporting**: Set up admin notification emails
3. **Monitor Queue**: Regularly check EmailQueue for failed emails
4. **Review Audit Logs**: Monitor EmailSentHistory for compliance

## Support

For issues or questions:
1. Check the main [README.md](README.md) for detailed documentation
2. Review SQL Server error logs
3. Check Electron app console for JavaScript errors
4. Verify network connectivity and firewall rules

## Common Email Provider Settings

| Provider | SMTP Host | Port | Security | Notes |
|----------|-----------|------|----------|-------|
| Gmail | smtp.gmail.com | 587 | TLS | Requires App Password |
| Outlook | smtp.office365.com | 587 | TLS | May require App Password if 2FA enabled |
| Yahoo | smtp.mail.yahoo.com | 587 | TLS | Requires App Password |
| SendGrid | smtp.sendgrid.net | 587 | TLS | Use 'apikey' as username |
| Mailgun | smtp.mailgun.org | 587 | TLS | Use Mailgun SMTP credentials |
| Amazon SES | email-smtp.{region}.amazonaws.com | 587 | TLS | Use SMTP credentials from SES console |

---

**Installation Complete!** 🎉

Your OrbisHub Email Server Profile is now ready to send emails for password recovery, bug notifications, and more.
