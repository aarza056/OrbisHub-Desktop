(function () {
  if (!window) return;
  const db = window.DB;

  const TABLES = {
    user: 'Users',
    server: 'Servers',
    environment: 'Environments',
    credential: 'Credentials',
  };

  async function deleteRecord(entityType, id) {
    const table = TABLES[entityType];
    if (!table) return { success: false, error: `Unknown entity type: ${entityType}` };
    try {
      const res = await db.execute(`DELETE FROM ${table} WHERE id = @param0`, [{ value: id }]);
      if (res.success) return { success: true, rowsAffected: res.rowsAffected };
      return { success: false, error: res.error || 'Delete failed' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  window.Entities = { deleteRecord };
})();
