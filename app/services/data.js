(function () {
  if (!window) return;
  const db = window.DB;

  async function loadAll() {
    try {
      const usersQ = await db.query('SELECT * FROM Users', []);
      const serversQ = await db.query('SELECT * FROM Servers', []);
      const envsQ = await db.query('SELECT * FROM Environments', []);
      const credsQ = await db.query('SELECT * FROM Credentials', []);
      const logsQ = await db.query('SELECT TOP 1000 * FROM AuditLogs ORDER BY [timestamp] DESC', []);

      const users = usersQ.success && usersQ.data ? usersQ.data.map(u => ({
        id: u.id,
        username: u.username,
        password: u.password,
        name: u.name || u.username,
        email: u.email || '',
        role: u.role || 'viewer',
        position: u.position || '—',
        squad: u.squad || '—',
        lastLogin: u.lastLogin || '—',
        lastActivity: u.lastActivity || Date.now(),
        ip: u.ip || '—',
        isActive: u.isActive !== undefined ? u.isActive : true,
        changePasswordOnLogin: u.changePasswordOnLogin !== undefined ? u.changePasswordOnLogin : false
      })) : [];

      const servers = serversQ.success && serversQ.data ? serversQ.data.map(s => {
        let extraData = {};
        try {
          if (s.description && typeof s.description === 'string' && s.description.trim().startsWith('{')) {
            extraData = JSON.parse(s.description);
          }
        } catch {}
        return {
          id: s.id,
          displayName: s.name,
          hostname: extraData.hostname || s.name,
          ipAddress: s.host,
          port: s.port || 3389,
          os: extraData.os || 'Windows',
          type: extraData.type || 'Windows Server',
          serverGroup: extraData.serverGroup || 'Ungrouped',
          environmentId: s.environment_id,
          credentialId: s.credential_id,
          description: extraData.description || '',
          status: s.status || 'active',
          health: extraData.health || 'ok'
        };
      }) : [];

      const environments = envsQ.success && envsQ.data ? envsQ.data.map(e => {
        let extra = {};
        try {
          if (typeof e.description === 'string' && e.description.trim().startsWith('{')) {
            extra = JSON.parse(e.description);
          }
        } catch {}
        return {
          id: e.id,
          name: e.name,
          url: extra.url || extra.envUrl || '',
          type: extra.type || extra.envType || '',
          mappedServers: Array.isArray(extra.mappedServers) ? extra.mappedServers : [],
          description: (typeof e.description === 'string' && !e.description.trim().startsWith('{')) ? (e.description || '') : (extra.note || ''),
          color: e.color || '#3b82f6'
        };
      }) : [];

      const credentials = credsQ.success && credsQ.data ? credsQ.data.map(c => {
        let extra = {};
        try {
          if (typeof c.description === 'string' && c.description.trim().startsWith('{')) {
            extra = JSON.parse(c.description);
          }
        } catch {}
        return {
          id: c.id,
          name: c.name,
          username: c.username,
          password: c.password,
          domain: c.domain || '',
          type: extra.type || 'Username/Password',
          description: (typeof c.description === 'string' && !c.description.trim().startsWith('{')) ? (c.description || '') : (extra.note || '')
        };
      }) : [];

      const auditLogs = logsQ.success && logsQ.data ? logsQ.data.map(a => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityName: a.entityName,
        user: a.user,
        username: a.username,
        timestamp: a.timestamp,
        ip: a.ip || '—',
        details: (() => { try { return a.details && typeof a.details === 'string' && a.details.trim().startsWith('{') ? JSON.parse(a.details) : (a.details || {}) } catch { return {} } })()
      })) : [];

      return { success: true, data: { users, servers, environments, credentials, auditLogs } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function syncAll({ users = [], servers = [], environments = [], credentials = [], auditLogs = [] }) {
    try {
      // Users
      for (const user of users) {
        await db.execute(
          `IF EXISTS (SELECT 1 FROM Users WHERE id = @param0)
             UPDATE Users SET username = @param1, password = @param2, name = @param3, email = @param4, role = @param5, position = @param6, squad = @param7, lastLogin = @param8, lastActivity = @param9, ip = @param10, isActive = @param11, changePasswordOnLogin = @param12 WHERE id = @param0
           ELSE
             INSERT INTO Users (id, username, password, name, email, role, position, squad, lastLogin, lastActivity, ip, isActive, changePasswordOnLogin, created_at) VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8, @param9, @param10, @param11, @param12, GETDATE())`,
          [
            { value: user.id },
            { value: user.username },
            { value: user.password },
            { value: user.name },
            { value: user.email },
            { value: user.role },
            { value: user.position || '—' },
            { value: user.squad || '—' },
            { value: typeof user.lastLogin === 'number' ? user.lastLogin : null },
            { value: typeof user.lastActivity === 'number' ? user.lastActivity : Date.now() },
            { value: user.ip || '—' },
            { value: user.isActive ? 1 : 0 },
            { value: user.changePasswordOnLogin ? 1 : 0 }
          ]
        );
      }

      // Environments
      for (const env of environments) {
        const extra = {
          url: env.url || '',
          type: env.type || '',
          mappedServers: Array.isArray(env.mappedServers) ? env.mappedServers : [],
          note: env.description || ''
        };
        const packedDescription = JSON.stringify(extra);
        await db.execute(
          `IF EXISTS (SELECT 1 FROM Environments WHERE id = @param0)
             UPDATE Environments SET name = @param1, description = @param2, color = @param3 WHERE id = @param0
           ELSE
             INSERT INTO Environments (id, name, description, color, created_at) VALUES (@param0, @param1, @param2, @param3, GETDATE())`,
          [
            { value: env.id },
            { value: env.name },
            { value: packedDescription },
            { value: env.color || '#3b82f6' }
          ]
        );
      }

      // Credentials
      for (const cred of credentials) {
        const descJson = JSON.stringify({ type: cred.type || 'Username/Password', note: cred.description || '' });
        await db.execute(
          `IF EXISTS (SELECT 1 FROM Credentials WHERE id = @param0)
             UPDATE Credentials SET name = @param1, username = @param2, password = @param3, domain = @param4, description = @param5 WHERE id = @param0
           ELSE
             INSERT INTO Credentials (id, name, username, password, domain, description, created_at) VALUES (@param0, @param1, @param2, @param3, @param4, @param5, GETDATE())`,
          [
            { value: cred.id },
            { value: cred.name },
            { value: cred.username },
            { value: cred.password },
            { value: cred.domain || '' },
            { value: descJson }
          ]
        );
      }

      // Servers
      for (const server of servers) {
        const extraData = JSON.stringify({
          os: server.os || 'Windows',
          type: server.type,
          serverGroup: server.serverGroup,
          health: server.health,
          hostname: server.hostname
        });
        await db.execute(
          `IF EXISTS (SELECT 1 FROM Servers WHERE id = @param0)
             UPDATE Servers SET name = @param1, host = @param2, port = @param3, environment_id = @param4, credential_id = @param5, description = @param6, status = @param7 WHERE id = @param0
           ELSE
             INSERT INTO Servers (id, name, host, port, environment_id, credential_id, description, status, created_at) VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7, GETDATE())`,
          [
            { value: server.id },
            { value: server.displayName || server.name },
            { value: server.ipAddress || server.host },
            { value: server.port || (server.os === 'Linux' ? 22 : 3389) },
            { value: server.environmentId || server.environment_id || null },
            { value: server.credentialId || server.credential_id || null },
            { value: extraData },
            { value: server.status || 'active' }
          ]
        );
      }

      // Audit logs
      for (const log of auditLogs) {
        const detailsStr = typeof log.details === 'string' ? log.details : JSON.stringify(log.details || {});
        await db.execute(
          `IF EXISTS (SELECT 1 FROM AuditLogs WHERE id = @param0)
             UPDATE AuditLogs SET action = @param1, entityType = @param2, entityName = @param3, [user] = @param4, username = @param5, [timestamp] = @param6, ip = @param7, details = @param8 WHERE id = @param0
           ELSE
             INSERT INTO AuditLogs (id, action, entityType, entityName, [user], username, [timestamp], ip, details) VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8)`,
          [
            { value: log.id },
            { value: log.action },
            { value: log.entityType },
            { value: log.entityName },
            { value: log.user },
            { value: log.username },
            { value: log.timestamp },
            { value: log.ip || '—' },
            { value: detailsStr }
          ]
        );
      }

      return { success: true, message: 'Data synced to database' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  window.Data = { loadAll, syncAll };
})();
