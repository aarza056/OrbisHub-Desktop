(function () {
  if (!window) return;
  const db = window.DB;

  async function log(entry) {
    try {
      const id = entry.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const detailsStr = typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details || {});
      const res = await db.execute(
        `IF EXISTS (SELECT 1 FROM AuditLogs WHERE id = @param0)
           UPDATE AuditLogs SET action = @param1, entityType = @param2, entityName = @param3, [user] = @param4, username = @param5, [timestamp] = @param6, ip = @param7, details = @param8 WHERE id = @param0
         ELSE
           INSERT INTO AuditLogs (id, action, entityType, entityName, [user], username, [timestamp], ip, details)
           VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8)`,
        [
          { value: id },
          { value: entry.action },
          { value: entry.entityType },
          { value: entry.entityName },
          { value: entry.user },
          { value: entry.username },
          { value: entry.timestamp || new Date().toISOString() },
          { value: entry.ip || '—' },
          { value: detailsStr }
        ]
      );
      return { success: !!res.success, id, rowsAffected: res.rowsAffected };
    } catch (e) {
      console.error('Audit.log failed:', e);
      return { success: false, error: e.message };
    }
  }

  async function listRecent(limit = 1000) {
    try {
      const q = await db.query(
        `SELECT TOP ${Math.max(1, Math.min(5000, Number(limit) || 1000))}
                id, action, entityType, entityName, [user], username, [timestamp], ip, details
         FROM AuditLogs
         ORDER BY [timestamp] DESC`,
        []
      );
      if (!q.success) return { success: false, error: q.error };
      const rows = (q.data || []).map(a => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityName: a.entityName,
        user: a.user,
        username: a.username,
        timestamp: a.timestamp,
        ip: a.ip || '—',
        details: (() => { try { return a.details && typeof a.details === 'string' && a.details.trim().startsWith('{') ? JSON.parse(a.details) : (a.details || {}) } catch { return {} } })()
      }));
      return { success: true, data: rows };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function clear() {
    try {
      const del = await db.execute('DELETE FROM AuditLogs', []);
      if (del.success) return { success: true, rowsAffected: del.rowsAffected };
      return { success: false, error: del.error || 'Failed to clear' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  window.Audit = { log, listRecent, clear };
})();
