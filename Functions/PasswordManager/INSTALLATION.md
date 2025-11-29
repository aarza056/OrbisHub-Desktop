# Password Manager - Installation Guide

## Quick Start

Follow these steps to install and set up the Password Manager in OrbisHub Desktop.

## 1. Database Setup

Run the database schema script to create the required tables:

```sql
-- Execute the password-schema.sql file in your SQL Server database
-- This will create:
-- - PasswordEntries table
-- - PasswordCategories table
-- - PasswordAccessLog table
```

**Option A: Using SQL Server Management Studio (SSMS)**
1. Open SSMS and connect to your OrbisHub database
2. Open the file `Functions/PasswordManager/password-schema.sql`
3. Execute the script (F5)

**Option B: Using Command Line**
```powershell
sqlcmd -S localhost\SQLEXPRESS -d OrbisHub -i "Functions\PasswordManager\password-schema.sql"
```

## 2. Verify Installation

The Password Manager should now appear in the left navigation menu under "Ticket Management".

## 3. First-Time Setup

1. Click on "Password Manager" in the navigation menu
2. Click "Add Password" to create your first entry
3. The default categories are automatically created:
   - Personal
   - Work
   - Financial
   - Social Media
   - Email
   - Development
   - Database
   - Server
   - Other

## 4. Usage

### Adding a Password
1. Click the "Add Password" button
2. Fill in required fields (Name, Username, Password)
3. Optionally use the password generator for strong passwords
4. Add URL, category, and notes as needed
5. Click "Create Password"

### Searching & Filtering
- Use the search box to find passwords by name, username, or URL
- Click on categories in the sidebar to filter
- Click "Favorites" to show only starred passwords

### Viewing & Copying
- Click on any password in the list to view details
- Click the eye icon to show/hide the password
- Click copy buttons to copy credentials to clipboard
- All access is logged in the audit trail

### Editing & Deleting
- Click "Edit" to modify a password entry
- Click "Delete" to remove (requires confirmation)

## 5. Security Notes

⚠️ **Important**: The current implementation uses basic encryption for demonstration purposes.

For production use, consider implementing:
- Web Crypto API with PBKDF2 key derivation
- AES-256-GCM encryption
- Master password protection
- Auto-lock after inactivity
- Two-factor authentication

## 6. Troubleshooting

**Password Manager doesn't appear in menu**
- Ensure you've added the navigation button in `index.html`
- Check browser console for JavaScript errors
- Verify all files are loaded (check Network tab)

**Can't create passwords**
- Verify database tables were created successfully
- Check SQL Server permissions
- Review browser console for errors

**Encryption errors**
- Ensure you're logged in (encryption uses session data)
- Try refreshing the page
- Check browser console for detailed error messages

## 7. File Structure

```
Functions/PasswordManager/
├── password-schema.sql      # Database schema
├── password-service.js      # Backend service
├── password-ui.js          # Frontend UI
├── password-ui.css         # Styling
├── README.md              # Documentation
└── INSTALLATION.md        # This file
```

## 8. Support

For issues or questions:
1. Check the README.md file
2. Review browser console for errors
3. Verify database schema is installed correctly
4. Ensure all JavaScript files are loaded

## 9. Next Steps

After installation:
- [ ] Import existing passwords (if any)
- [ ] Set up password categories
- [ ] Configure audit logging
- [ ] Train users on password manager usage
- [ ] Consider implementing enhanced security features
