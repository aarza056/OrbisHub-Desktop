# Password Manager

A secure password management system for OrbisHub Desktop, similar to KeePass.

## Features

- 🔐 **Secure Storage**: Passwords are encrypted before storage in the database
- 🔍 **Search & Filter**: Quickly find passwords by name, username, or URL
- 📁 **Categories**: Organize passwords into categories (Personal, Work, Financial, etc.)
- ⭐ **Favorites**: Mark frequently used passwords as favorites
- 👁️ **Password Visibility**: Toggle password visibility with eye icon
- 📋 **Copy to Clipboard**: Double-click or use copy button to copy credentials
- 🎲 **Password Generator**: Generate strong, random passwords
- 💪 **Password Strength**: Visual indicator of password strength
- 📝 **Notes**: Store additional notes with each password entry
- 🔗 **URL Storage**: Save website URLs with credentials
- 📊 **Audit Trail**: Track who accessed passwords and when

## Database Schema

The Password Manager uses three main tables:

1. **PasswordEntries**: Stores encrypted password data
2. **PasswordCategories**: Predefined categories for organization
3. **PasswordAccessLog**: Audit trail of password access

## Files

- `password-schema.sql` - Database schema
- `password-service.js` - Backend service (CRUD operations, encryption)
- `password-ui.js` - Frontend UI controller
- `password-ui.css` - Styling

## Usage

### Adding a Password

1. Click the "Add Password" button
2. Fill in the required fields (Name, Username, Password)
3. Optionally add URL, category, notes
4. Use the password generator if needed
5. Click "Create Password"

### Viewing a Password

1. Select a password from the list
2. Click the eye icon to show/hide the password
3. Use copy buttons to copy username or password to clipboard

### Editing a Password

1. Select a password from the list
2. Click the "Edit" button
3. Modify fields as needed
4. Click "Update Password"

### Deleting a Password

1. Select a password from the list
2. Click the "Delete" button
3. Confirm deletion

## Security

The current implementation uses a simple XOR-based encryption with session-based keys for demonstration purposes. For production use, consider implementing:

- Web Crypto API with proper key derivation (PBKDF2)
- AES-256-GCM encryption
- Secure key storage
- Multi-factor authentication
- Auto-lock after inactivity
- Master password protection

## Installation

1. Run the database schema script: `password-schema.sql`
2. Add the Password Manager to your navigation menu
3. Include the JavaScript and CSS files in your HTML
4. Initialize with `PasswordUI.init()`

## Integration

The Password Manager is integrated into the OrbisHub Desktop application and appears in the left navigation menu under "Ticket Management".
