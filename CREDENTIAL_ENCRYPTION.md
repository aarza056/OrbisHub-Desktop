# Credential Password Encryption

## Overview

Credential passwords are now encrypted in the database using AES-256-CBC encryption. This provides an additional layer of security for stored credentials.

## How It Works

### Encryption Algorithm
- **Algorithm**: AES-256-CBC (Advanced Encryption Standard with 256-bit key)
- **Key Derivation**: Generated using `scrypt` with a secret passphrase and salt
- **Format**: Encrypted passwords are stored as `IV:ENCRYPTED_DATA` where IV is the initialization vector

### Automatic Encryption/Decryption

1. **When Saving Credentials**:
   - Plain-text password entered by user
   - `Data.syncAll()` checks if password is already encrypted (contains ':')
   - If not encrypted, encrypts password using `electronAPI.encryptMessage()`
   - Stores encrypted password in database

2. **When Loading Credentials**:
   - `Data.loadAll()` fetches credentials from database
   - Checks if password is encrypted (contains ':')
   - If encrypted, decrypts password using `electronAPI.decryptMessage()`
   - Returns plain-text password to application for use

### Backward Compatibility

The implementation is backward compatible:
- Existing plain-text passwords will be automatically encrypted on next save
- The system detects encryption by checking for the ':' separator in the password
- Plain-text passwords (legacy data) can still be read and used

## Migration of Existing Credentials

If you have existing credentials with plain-text passwords, you should run a one-time migration:

### Option 1: Automatic Migration (Recommended)

1. Open the application
2. Open Developer Tools (F12)
3. Navigate to the Console tab
4. Run the migration script:
   ```javascript
   // Load and execute migration script
   const script = document.createElement('script');
   script.src = './utils/migrate-credentials.js';
   document.head.appendChild(script);
   ```

5. Monitor the console output for migration progress
6. The script will:
   - Check all credentials in the database
   - Encrypt any plain-text passwords
   - Skip already-encrypted passwords
   - Report a summary of changes

### Option 2: Manual Migration

Alternatively, you can trigger encryption by:
1. Opening each credential in the UI
2. Clicking "Save" without making changes
3. This will trigger the encryption on save

### Verification

After migration, you can verify encryption worked:

1. Check the database directly:
   ```sql
   SELECT name, username, password FROM Credentials
   ```
   
2. Encrypted passwords should look like:
   ```
   a1b2c3d4e5f6g7h8:9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z...
   ```
   (A hex string IV, followed by ':', followed by encrypted hex data)

3. In the application UI, passwords should still work normally for RDP/SSH connections

## Security Considerations

### Current Implementation
- Encryption key is hardcoded in `main.js` using a passphrase
- Key is derived using `scrypt` for additional security
- Encryption happens in the main Electron process
- Passwords are decrypted when loaded into application memory

### Recommendations for Production

For enhanced security in production environments:

1. **Secure Key Storage**:
   - Store encryption key in environment variables or secure key management system
   - Consider using hardware security modules (HSM) for key storage
   - Rotate encryption keys periodically

2. **User-Specific Encryption**:
   - Generate unique encryption keys per user or organization
   - Require user password for key derivation

3. **At-Rest Protection**:
   - Enable database encryption (TDE - Transparent Data Encryption)
   - Use encrypted file systems for database storage

4. **Access Control**:
   - Limit database access to application service account only
   - Use SQL Server row-level security for multi-tenant scenarios
   - Enable database auditing for credential access

5. **Network Security**:
   - Always use encrypted connections (TLS/SSL) to database
   - Enable the `encrypt: true` option in database config

## Technical Details

### Files Modified

- `app/services/data.js`:
  - Modified `loadAll()` to decrypt passwords when loading
  - Modified `syncAll()` to encrypt passwords when saving

### New Files

- `app/utils/migrate-credentials.js`: Migration utility for existing credentials
- `CREDENTIAL_ENCRYPTION.md`: This documentation file

### Dependencies

Uses existing Electron crypto module via:
- `window.electronAPI.encryptMessage(text)`
- `window.electronAPI.decryptMessage(encryptedText)`

Implemented in `main.js`:
- `encryptMessage()` - Encrypts using AES-256-CBC
- `decryptMessage()` - Decrypts and handles legacy plain-text

## Testing

After implementing encryption, test the following scenarios:

1. **Create New Credential**: 
   - Add a new credential with password
   - Verify it's encrypted in database
   - Verify it works for RDP/SSH connection

2. **Edit Existing Credential**:
   - Edit credential and change password
   - Verify new password is encrypted
   - Verify connection still works

3. **Legacy Credential**:
   - If you have old plain-text credentials
   - Verify they still work (backward compatibility)
   - Verify they get encrypted on next save

4. **Connection Test**:
   - Use credential for RDP connection
   - Use credential for SSH connection
   - Verify decryption happens correctly

## Troubleshooting

### Passwords Not Working After Migration

If RDP/SSH connections fail after migration:

1. Check browser console for decryption errors
2. Verify the credential password in database (should contain ':')
3. Try re-entering the password in the UI
4. Check main process logs for encryption/decryption errors

### Migration Script Errors

If migration script reports errors:

1. Ensure you're running it in the application (not browser context)
2. Check that `window.DB` and `window.electronAPI` are available
3. Review database connection status
4. Check for database permissions

### Database Query Errors

If you see "Invalid object name 'Credentials'":

1. Ensure database migrations have been run
2. Check database connection in Settings
3. Verify Credentials table exists in database

## Future Enhancements

Potential improvements for future versions:

1. Master password for additional encryption layer
2. Key rotation capability
3. Export/import with re-encryption
4. Per-credential encryption keys
5. Integration with enterprise key management systems
6. Compliance reporting (HIPAA, PCI-DSS, etc.)
