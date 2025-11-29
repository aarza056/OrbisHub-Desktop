/**
 * Password Manager Service
 * Handles all password CRUD operations, encryption, and business logic
 */

(function () {
  if (!window || !window.DB) {
    console.error('Password Service: DB not available');
    return;
  }

  const db = window.DB;

  // Simple encryption/decryption using base64 encoding with a session-based key
  // Note: For production, consider using Web Crypto API with proper key derivation
  let encryptionKey = null;

  function initializeEncryption() {
    // Generate a session-based encryption key from user session
    const session = window.getSession ? window.getSession() : null;
    if (session && session.id) {
      encryptionKey = btoa(session.id + '-' + session.username);
    } else {
      encryptionKey = btoa('default-key-' + Date.now());
    }
  }

  function simpleEncrypt(text) {
    if (!encryptionKey) initializeEncryption();
    try {
      // XOR-based encryption with base64
      const keyBytes = encryptionKey.split('').map(c => c.charCodeAt(0));
      const textBytes = text.split('').map(c => c.charCodeAt(0));
      const encrypted = textBytes.map((byte, i) => byte ^ keyBytes[i % keyBytes.length]);
      return btoa(String.fromCharCode(...encrypted));
    } catch (e) {
      console.error('Encryption error:', e);
      return btoa(text); // Fallback to simple base64
    }
  }

  function simpleDecrypt(encrypted) {
    if (!encryptionKey) initializeEncryption();
    try {
      const decoded = atob(encrypted);
      const keyBytes = encryptionKey.split('').map(c => c.charCodeAt(0));
      const encryptedBytes = decoded.split('').map(c => c.charCodeAt(0));
      const decrypted = encryptedBytes.map((byte, i) => byte ^ keyBytes[i % keyBytes.length]);
      return String.fromCharCode(...decrypted);
    } catch (e) {
      console.error('Decryption error:', e);
      try {
        return atob(encrypted); // Fallback to simple base64 decode
      } catch {
        return '';
      }
    }
  }

  // ==================== PASSWORD OPERATIONS ====================

  /**
   * Get all password entries with filters
   */
  async function getPasswords(filters = {}) {
    try {
      let query = `
        SELECT 
          p.id,
          p.name,
          p.username,
          p.password_encrypted,
          p.url,
          p.notes,
          p.category,
          p.tags,
          p.created_at,
          p.updated_at,
          p.last_accessed,
          p.is_favorite,
          u.username as created_by_username,
          u.name as created_by_name,
          c.color as category_color,
          c.icon as category_icon
        FROM PasswordEntries p
        INNER JOIN Users u ON p.created_by = u.id
        LEFT JOIN PasswordCategories c ON p.category = c.name
        WHERE 1=1
      `;

      const params = [];

      // Filter by search term (name, username, or url)
      if (filters.search) {
        query += ` AND (p.name LIKE @param${params.length} OR p.username LIKE @param${params.length} OR p.url LIKE @param${params.length})`;
        params.push({ value: `%${filters.search}%` });
      }

      // Filter by category
      if (filters.category) {
        query += ` AND p.category = @param${params.length}`;
        params.push({ value: filters.category });
      }

      // Filter by favorites
      if (filters.favorites) {
        query += ` AND p.is_favorite = 1`;
      }

      // Order by
      const orderBy = filters.orderBy || 'name';
      const orderDir = filters.orderDir || 'ASC';
      query += ` ORDER BY p.${orderBy} ${orderDir}`;

      const result = await db.query(query, params);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Decrypt passwords for display (will be re-encrypted for storage)
      const passwords = result.data.map(p => ({
        ...p,
        password_decrypted: simpleDecrypt(p.password_encrypted)
      }));

      return { success: true, data: passwords };
    } catch (error) {
      console.error('Get passwords error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a single password entry by ID
   */
  async function getPassword(id) {
    try {
      const result = await db.query(
        `SELECT 
          p.*,
          u.username as created_by_username,
          u.name as created_by_name
        FROM PasswordEntries p
        INNER JOIN Users u ON p.created_by = u.id
        WHERE p.id = @param0`,
        [{ value: id }]
      );

      if (!result.success || result.data.length === 0) {
        return { success: false, error: 'Password entry not found' };
      }

      const password = result.data[0];
      password.password_decrypted = simpleDecrypt(password.password_encrypted);

      // Log access
      await logPasswordAccess(id, 'view');

      // Update last accessed time
      await db.query(
        'UPDATE PasswordEntries SET last_accessed = GETDATE() WHERE id = @param0',
        [{ value: id }]
      );

      return { success: true, data: password };
    } catch (error) {
      console.error('Get password error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new password entry
   */
  async function createPassword(data) {
    try {
      const session = window.getSession ? window.getSession() : null;
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const encrypted = simpleEncrypt(data.password);

      const result = await db.query(
        `INSERT INTO PasswordEntries (name, username, password_encrypted, url, notes, category, tags, created_by, is_favorite)
         OUTPUT INSERTED.id
         VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8)`,
        [
          { value: data.name },
          { value: data.username },
          { value: encrypted },
          { value: data.url || null },
          { value: data.notes || null },
          { value: data.category || 'Other' },
          { value: data.tags || null },
          { value: session.id },
          { value: data.isFavorite || false }
        ]
      );

      if (!result.success || result.data.length === 0) {
        return { success: false, error: result.error || 'Failed to create password entry' };
      }

      const newId = result.data[0].id;
      await logPasswordAccess(newId, 'create');

      return { success: true, data: { id: newId } };
    } catch (error) {
      console.error('Create password error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a password entry
   */
  async function updatePassword(id, data) {
    try {
      const updates = [];
      const params = [];

      if (data.name !== undefined) {
        updates.push(`name = @param${params.length}`);
        params.push({ value: data.name });
      }
      if (data.username !== undefined) {
        updates.push(`username = @param${params.length}`);
        params.push({ value: data.username });
      }
      if (data.password !== undefined) {
        updates.push(`password_encrypted = @param${params.length}`);
        params.push({ value: simpleEncrypt(data.password) });
      }
      if (data.url !== undefined) {
        updates.push(`url = @param${params.length}`);
        params.push({ value: data.url });
      }
      if (data.notes !== undefined) {
        updates.push(`notes = @param${params.length}`);
        params.push({ value: data.notes });
      }
      if (data.category !== undefined) {
        updates.push(`category = @param${params.length}`);
        params.push({ value: data.category });
      }
      if (data.tags !== undefined) {
        updates.push(`tags = @param${params.length}`);
        params.push({ value: data.tags });
      }
      if (data.isFavorite !== undefined) {
        updates.push(`is_favorite = @param${params.length}`);
        params.push({ value: data.isFavorite });
      }

      updates.push('updated_at = GETDATE()');

      const query = `UPDATE PasswordEntries SET ${updates.join(', ')} WHERE id = @param${params.length}`;
      params.push({ value: id });
      const result = await db.query(query, params);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      await logPasswordAccess(id, 'edit');

      return { success: true };
    } catch (error) {
      console.error('Update password error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a password entry
   */
  async function deletePassword(id) {
    try {
      await logPasswordAccess(id, 'delete');

      const result = await db.query(
        'DELETE FROM PasswordEntries WHERE id = @param0',
        [{ value: id }]
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      console.error('Delete password error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all categories
   */
  async function getCategories() {
    try {
      const result = await db.query(
        'SELECT id, name, color, icon FROM PasswordCategories ORDER BY name'
      );
      return result;
    } catch (error) {
      console.error('Get categories error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log password access for audit trail
   */
  async function logPasswordAccess(passwordId, action) {
    try {
      const session = window.getSession ? window.getSession() : null;
      if (!session) return;

      await db.query(
        `INSERT INTO PasswordAccessLog (password_entry_id, user_id, action)
         VALUES (@param0, @param1, @param2)`,
        [
          { value: passwordId },
          { value: session.id },
          { value: action }
        ]
      );
    } catch (error) {
      console.error('Log password access error:', error);
    }
  }

  /**
   * Get password access log
   */
  async function getAccessLog(passwordId) {
    try {
      const result = await db.query(
        `SELECT 
          l.action,
          l.accessed_at,
          u.username,
          u.name as user_name
        FROM PasswordAccessLog l
        INNER JOIN Users u ON l.user_id = u.id
        WHERE l.password_entry_id = @param0
        ORDER BY l.accessed_at DESC`,
        [{ value: passwordId }]
      );
      return result;
    } catch (error) {
      console.error('Get access log error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new category
   */
  async function createCategory(name, color, icon) {
    try {
      const result = await db.query(
        `INSERT INTO PasswordCategories (name, color, icon)
         VALUES (@param0, @param1, @param2)`,
        [
          { value: name },
          { value: color },
          { value: icon }
        ]
      );
      return result;
    } catch (error) {
      console.error('Create category error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a category
   */
  async function updateCategory(id, name, color, icon) {
    try {
      const result = await db.query(
        `UPDATE PasswordCategories 
         SET name = @param0, color = @param1, icon = @param2
         WHERE id = @param3`,
        [
          { value: name },
          { value: color },
          { value: icon },
          { value: id }
        ]
      );
      return result;
    } catch (error) {
      console.error('Update category error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a category
   */
  async function deleteCategory(id) {
    try {
      const result = await db.query(
        `DELETE FROM PasswordCategories WHERE id = @param0`,
        [{ value: id }]
      );
      return result;
    } catch (error) {
      console.error('Delete category error:', error);
      return { success: false, error: error.message };
    }
  }

  // Export service
  window.PasswordService = {
    getPasswords,
    getPassword,
    createPassword,
    updatePassword,
    deletePassword,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getAccessLog,
    logPasswordAccess,
    initializeEncryption
  };

  // Initialize encryption on load
  initializeEncryption();

  console.log('Password Service initialized');
})();
