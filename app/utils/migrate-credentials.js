/**
 * Utility to migrate existing plain-text credential passwords to encrypted format
 * Run this once after deploying the encryption feature to encrypt existing credentials
 */

(async function migrateCredentials() {
  if (!window || !window.DB || !window.electronAPI) {
    console.error('Migration script must run in application context');
    return;
  }

  const db = window.DB;
  
  try {
    console.log('🔄 Starting credential password migration...');
    
    // Fetch all credentials from database
    const credsQ = await db.query('SELECT * FROM Credentials', []);
    
    if (!credsQ.success || !credsQ.data) {
      console.error('❌ Failed to fetch credentials:', credsQ.error);
      return;
    }
    
    const credentials = credsQ.data;
    console.log(`📋 Found ${credentials.length} credential(s) to check`);
    
    let migratedCount = 0;
    let alreadyEncryptedCount = 0;
    let errorCount = 0;
    
    for (const cred of credentials) {
      // Check if password is already encrypted (contains ':' separator)
      if (cred.password && cred.password.includes(':')) {
        console.log(`✓ Credential "${cred.name}" already encrypted`);
        alreadyEncryptedCount++;
        continue;
      }
      
      // Encrypt the plain-text password
      try {
        const encryptResult = await window.electronAPI.encryptMessage(cred.password);
        
        if (encryptResult.success) {
          // Update the credential in database
          await db.execute(
            'UPDATE Credentials SET password = @param0 WHERE id = @param1',
            [
              { value: encryptResult.encrypted },
              { value: cred.id }
            ]
          );
          
          console.log(`✓ Migrated credential "${cred.name}" (ID: ${cred.id})`);
          migratedCount++;
        } else {
          console.error(`❌ Failed to encrypt credential "${cred.name}":`, encryptResult.error);
          errorCount++;
        }
      } catch (err) {
        console.error(`❌ Error migrating credential "${cred.name}":`, err);
        errorCount++;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✓ Migrated: ${migratedCount}`);
    console.log(`   ✓ Already encrypted: ${alreadyEncryptedCount}`);
    console.log(`   ✗ Errors: ${errorCount}`);
    console.log(`   Total: ${credentials.length}`);
    
    if (errorCount === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log('\n⚠️ Migration completed with errors. Please review the logs above.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
})();
