// Electron Desktop App Adapter
// This replaces the API_BASE_URL approach with direct Electron IPC

// Check if running in Electron
const isElectron = window.electronAPI && window.electronAPI.isElectron;

if (!isElectron) {
    alert('This application must be run in Electron!');
}

// Override fetch for database operations
const originalFetch = window.fetch;

window.fetch = function(url, options) {
    // Intercept API calls and route to Electron IPC
    if (url.includes('/api/')) {
        return handleElectronAPI(url, options);
    }
    // For non-API calls, use original fetch
    return originalFetch(url, options);
};

let MESSAGES_TABLE = null
let MESSAGES_SCHEMA = null

async function resolveMessagesTable() {
    if (MESSAGES_TABLE) return MESSAGES_TABLE
    try {
        const any = await window.electronAPI.dbQuery(
            `SELECT TOP 1 s.name AS schemaName
             FROM sys.tables t
             JOIN sys.schemas s ON t.schema_id = s.schema_id
             WHERE t.name = 'Messages'
             ORDER BY CASE WHEN s.name='dbo' THEN 0 ELSE 1 END`,
            []
        )
        if (any.success && Array.isArray(any.data) && any.data.length > 0) {
            MESSAGES_SCHEMA = any.data[0].schemaName || 'dbo'
            MESSAGES_TABLE = `[${MESSAGES_SCHEMA}].Messages`
            return MESSAGES_TABLE
        }
    } catch {}
    return null
}

// Ensure Messages table exists (auto-migrate on first use)
async function ensureMessagesTable() {
    try {
        let tbl = await resolveMessagesTable()
        if (tbl) {
            // Table exists – verify column sizes and widen if needed for cross-user DMs
            try {
                const cols = await window.electronAPI.dbQuery(
                    `SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH AS len
                     FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_NAME = 'Messages' AND (@param0 IS NULL OR TABLE_SCHEMA = @param0)
                       AND COLUMN_NAME IN ('SenderId','RecipientId')`,
                    [{ value: MESSAGES_SCHEMA }]
                )
                if (cols.success && Array.isArray(cols.data)) {
                    for (const c of cols.data) {
                        const name = c.COLUMN_NAME || c.Column_name || c.column_name
                        const len = c.len || c.CHARACTER_MAXIMUM_LENGTH
                        if (name && (len === null || len < 128)) {
                            await window.electronAPI.dbExecute(
                                `ALTER TABLE ${tbl} ALTER COLUMN ${name} NVARCHAR(128) ${name === 'SenderId' ? 'NOT NULL' : 'NULL'}`,
                                []
                            )
                        }
                    }
                }
            } catch (migErr) {
                console.warn('ensureMessagesTable: column widen check failed:', migErr)
            }
            return true
        }
        const create = await window.electronAPI.dbExecute(
            `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE t.name='Messages' AND s.name='dbo')
             BEGIN
               CREATE TABLE [dbo].[Messages] (
                Id NVARCHAR(64) PRIMARY KEY,
                SenderId NVARCHAR(128) NOT NULL,
                RecipientId NVARCHAR(128) NULL,
                ChannelId NVARCHAR(50) NULL,
                Content NVARCHAR(MAX) NOT NULL,
                SentAt DATETIME DEFAULT GETDATE(),
                [Read] BIT DEFAULT 0
               )
             END`,
            []
        )
        if (create.success) {
            MESSAGES_SCHEMA = 'dbo'
            MESSAGES_TABLE = '[dbo].Messages'
        }
        return !!create.success
    } catch (e) {
        console.error('ensureMessagesTable failed:', e)
        return false
    }
}

async function handleElectronAPI(url, options = {}) {
    const endpoint = url.split('/api/')[1];
    const body = options && options.body ? JSON.parse(options.body) : {};
    const method = options.method || 'GET';
    
    try {
        let result;
        
        switch(endpoint) {
            case 'rdp-connect':
                result = await window.electronAPI.connectRDP(body.server, body.credential, body.rdpContent);
                break;
                
            // Database configuration
            case 'db-config':
                if (method === 'GET') {
                    result = await window.electronAPI.getDbConfig();
                } else if (method === 'POST') {
                    result = await window.electronAPI.saveDbConfig(body);
                }
                break;
                
            case 'test-db-connection':
            case 'db-test':
                result = await window.electronAPI.testDbConnection(body);
                break;
                
            case 'run-migrations':
                result = await window.electronAPI.runMigrations(body);
                break;
                
            case 'create-database':
                result = await window.electronAPI.createDatabase(body);
                break;
                
            // Database queries
            case 'load-data':
                // Load all data from database
                try {
                    const users = await window.electronAPI.dbQuery('SELECT * FROM Users', []);
                    const servers = await window.electronAPI.dbQuery('SELECT * FROM Servers', []);
                    const environments = await window.electronAPI.dbQuery('SELECT * FROM Environments', []);
                    const credentials = await window.electronAPI.dbQuery('SELECT * FROM Credentials', []);
                    const scripts = await window.electronAPI.dbQuery('SELECT * FROM Scripts', []);
                    const builds = await window.electronAPI.dbQuery('SELECT * FROM Builds', []);
                    const pipelines = await window.electronAPI.dbQuery('SELECT * FROM Pipelines', []);
                    const auditLogs = await window.electronAPI.dbQuery('SELECT TOP 1000 * FROM AuditLogs ORDER BY [timestamp] DESC', []);
                    
                    result = {
                        success: true,
                        data: {
                            users: users.success && users.data ? users.data.map(u => ({
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
                            })) : [],
                            servers: servers.success && servers.data ? servers.data.map(s => {
                                // Parse extra data from description field
                                let extraData = {};
                                try {
                                    if (s.description && s.description.startsWith('{')) {
                                        extraData = JSON.parse(s.description);
                                    }
                                } catch (e) {
                                    // If not JSON, treat as plain description
                                }
                                
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
                            }) : [],
                            environments: environments.success && environments.data ? environments.data.map(e => {
                                let extra = {};
                                try {
                                    if (typeof e.description === 'string' && e.description.trim().startsWith('{')) {
                                        extra = JSON.parse(e.description);
                                    }
                                } catch (err) {
                                    // ignore parse errors and treat as plain description
                                }
                                return {
                                    id: e.id,
                                    name: e.name,
                                    url: extra.url || extra.envUrl || '',
                                    type: extra.type || extra.envType || '',
                                    
                                    mappedServers: Array.isArray(extra.mappedServers) ? extra.mappedServers : [],
                                    description: (typeof e.description === 'string' && !e.description.trim().startsWith('{')) ? (e.description || '') : (extra.note || ''),
                                    color: e.color || '#3b82f6'
                                };
                            }) : [],
                            credentials: credentials.success && credentials.data ? credentials.data.map(c => {
                                let extra = {};
                                try {
                                    if (typeof c.description === 'string' && c.description.trim().startsWith('{')) {
                                        extra = JSON.parse(c.description);
                                    }
                                } catch (err) {
                                    // ignore parse errors
                                }
                                return {
                                    id: c.id,
                                    name: c.name,
                                    username: c.username,
                                    password: c.password,
                                    domain: c.domain || '',
                                    type: extra.type || 'Username/Password',
                                    description: (typeof c.description === 'string' && !c.description.trim().startsWith('{')) ? (c.description || '') : (extra.note || '')
                                };
                            }) : [],
                            scripts: scripts.success && scripts.data ? scripts.data.map(s => ({
                                id: s.id,
                                name: s.name,
                                description: s.description || '',
                                content: s.content,
                                language: s.language || 'powershell',
                                fileName: s.name,
                                fileSize: s.content ? s.content.length : 0,
                                uploadDate: s.created_at
                            })) : [],
                            builds: builds.success && builds.data ? builds.data.map(b => ({
                                id: b.id,
                                name: b.name,
                                script: b.script || '',
                                serverId: b.serverId || b.server_id,
                                targetOverride: b.targetOverride || b.target_override || null,
                                isRunning: b.isRunning || false,
                                runStartTime: b.runStartTime,
                                currentProgress: b.currentProgress || 0,
                                lastRun: b.lastRun,
                                lastRunBy: b.lastRunBy,
                                lastSuccess: b.lastSuccess,
                                lastSuccessBy: b.lastSuccessBy,
                                lastSuccessElapsed: b.lastSuccessElapsed,
                                lastFail: b.lastFail,
                                lastFailBy: b.lastFailBy,
                                lastFailElapsed: b.lastFailElapsed,
                                created_at: b.created_at,
                                updated_at: b.updated_at
                            })) : [],
                            pipelines: pipelines.success && pipelines.data ? pipelines.data.map(p => ({
                                id: p.id,
                                name: p.name,
                                description: p.description || '',
                                enabled: p.enabled !== false,
                                created_by: p.created_by,
                                created_at: p.created_at,
                                updated_at: p.updated_at
                            })) : [],
                            auditLogs: auditLogs.success && auditLogs.data ? auditLogs.data.map(a => ({
                                id: a.id,
                                action: a.action,
                                entityType: a.entityType,
                                entityName: a.entityName,
                                user: a.user,
                                username: a.username,
                                timestamp: a.timestamp,
                                ip: a.ip || '—',
                                details: (() => {
                                    try { return a.details && a.details.startsWith('{') ? JSON.parse(a.details) : (a.details || {}) } catch { return {} }
                                })()
                            })) : []
                        }
                    };
                } catch (error) {
                    result = { success: false, error: error.message };
                }
                break;
            
            case 'test-server':
                if (window.electronAPI && window.electronAPI.testServer) {
                    result = await window.electronAPI.testServer(body.ipAddress, body.serverName, body.port || 3389);
                } else {
                    result = { success: true, reachable: true, message: 'Assumed reachable (no backend)' };
                }
                break;
                
            case 'sync-data':
                // Sync data to database (insert/update)
                try {
                    const { users, servers, environments, credentials, scripts, builds, auditLogs } = body;
                    
                    // Sync users
                    if (users && users.length > 0) {
                        for (const user of users) {
                            await window.electronAPI.dbExecute(
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
                    }
                    
                    // Sync environments
                    if (environments && environments.length > 0) {
                        for (const env of environments) {
                            const extra = {
                                url: env.url || '',
                                type: env.type || '',
                                mappedServers: Array.isArray(env.mappedServers) ? env.mappedServers : [],
                                note: env.description || ''
                            };
                            const packedDescription = JSON.stringify(extra);

                            await window.electronAPI.dbExecute(
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
                    }
                    
                    // Sync credentials
                    if (credentials && credentials.length > 0) {
                        for (const cred of credentials) {
                            const descJson = JSON.stringify({ type: cred.type || 'Username/Password', note: cred.description || '' });
                            await window.electronAPI.dbExecute(
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
                    }
                    
                    // Sync servers
                    if (servers && servers.length > 0) {
                        for (const server of servers) {
                            // Store UI data in description as JSON for fields not in schema
                            const extraData = JSON.stringify({
                                os: server.os || 'Windows',
                                type: server.type,
                                serverGroup: server.serverGroup,
                                health: server.health,
                                hostname: server.hostname
                            });
                            
                            await window.electronAPI.dbExecute(
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
                                    { value: extraData }, // Store extra fields as JSON
                                    { value: server.status || 'active' }
                                ]
                            );
                        }
                    }
                    
                    // Sync scripts
                    if (scripts && scripts.length > 0) {
                        for (const script of scripts) {
                            await window.electronAPI.dbExecute(
                                `IF EXISTS (SELECT 1 FROM Scripts WHERE id = @param0)
                                    UPDATE Scripts SET name = @param1, description = @param2, content = @param3, language = @param4, updated_at = GETDATE() WHERE id = @param0
                                ELSE
                                    INSERT INTO Scripts (id, name, description, content, language, created_at, updated_at) VALUES (@param0, @param1, @param2, @param3, @param4, GETDATE(), GETDATE())`,
                                [
                                    { value: script.id },
                                    { value: script.name },
                                    { value: script.description || '' },
                                    { value: script.content },
                                    { value: script.language || 'powershell' }
                                ]
                            );
                        }
                    }
                    
                    // Sync builds
                    if (builds && builds.length > 0) {
                        for (const build of builds) {
                            await window.electronAPI.dbExecute(
                                `IF EXISTS (SELECT 1 FROM Builds WHERE id = @param0)
                                    UPDATE Builds SET name = @param1, script = @param2, serverId = @param3, targetOverride = @param4, updated_at = GETDATE() WHERE id = @param0
                                ELSE
                                    INSERT INTO Builds (id, name, script, serverId, targetOverride, created_at, updated_at) VALUES (@param0, @param1, @param2, @param3, @param4, GETDATE(), GETDATE())`,
                                [
                                    { value: build.id },
                                    { value: build.name },
                                    { value: build.script || '' },
                                    { value: build.serverId || null },
                                    { value: build.targetOverride || null }
                                ]
                            );
                        }
                    }
                    
                    // Sync audit logs
                    if (auditLogs && auditLogs.length > 0) {
                        for (const log of auditLogs) {
                            const detailsStr = typeof log.details === 'string' ? log.details : JSON.stringify(log.details || {});
                            await window.electronAPI.dbExecute(
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
                    }

                    result = { success: true, message: 'Data synced to database' };
                } catch (error) {
                    result = { success: false, error: error.message };
                }
                break;

            case 'clear-audit-logs':
                try {
                    const del = await window.electronAPI.dbExecute('DELETE FROM AuditLogs', []);
                    if (del.success) {
                        result = { success: true, message: 'Audit logs cleared' };
                    } else {
                        result = { success: false, error: del.error || 'Failed to clear' };
                    }
                } catch (error) {
                    result = { success: false, error: error.message };
                }
                break;
            
            // Messaging: create direct message
            case 'messages': {
                if (method === 'POST') {
                    await ensureMessagesTable()
                    const { senderId, recipientId, content, hasAttachment, attachmentName, attachmentSize, attachmentType, attachmentData } = body;
                    const sId = String(senderId || '').trim()
                    const rId = recipientId != null ? String(recipientId).trim() : null
                    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
                    await ensureMessagesTable();
                    const tbl = MESSAGES_TABLE || '[dbo].Messages'
                    
                    let insert;
                    if (hasAttachment && attachmentData) {
                        // Array will be converted to Buffer in main process
                        insert = await window.electronAPI.dbExecute(
                            `INSERT INTO ${tbl} (Id, SenderId, RecipientId, Content, SentAt, [Read], HasAttachment, AttachmentName, AttachmentSize, AttachmentType, AttachmentData) 
                             VALUES (@param0, @param1, @param2, @param3, GETDATE(), 0, @param4, @param5, @param6, @param7, @param8)`,
                            [
                                { value: msgId },
                                { value: sId },
                                { value: rId },
                                { value: content },
                                { value: 1 },
                                { value: attachmentName },
                                { value: attachmentSize },
                                { value: attachmentType },
                                { value: attachmentData }
                            ]
                        );
                    } else {
                        insert = await window.electronAPI.dbExecute(
                            `INSERT INTO ${tbl} (Id, SenderId, RecipientId, Content, SentAt, [Read], HasAttachment) VALUES (@param0, @param1, @param2, @param3, GETDATE(), 0, 0)`,
                            [
                                { value: msgId },
                                { value: sId },
                                { value: rId },
                                { value: content }
                            ]
                        );
                    }
                    
                    if (insert.success) {
                        result = { success: true, message: { Id: msgId, SenderId: sId, RecipientId: rId, Content: content, SentAt: new Date().toISOString(), Read: 0 } };
                    } else {
                        result = { success: false, error: insert.error || 'Insert failed' };
                    }
                } else {
                    result = { success: false, error: 'Unsupported method' };
                }
                break;
            }
            
            // Users list (for messaging member pickers)
            case 'users': {
                if (method === 'GET') {
                    const q = await window.electronAPI.dbQuery(`SELECT id AS Id, username AS Username, name AS FullName, email AS Email FROM Users`, []);
                    result = q.success ? q.data : [];
                } else {
                    result = { success: false, error: 'Unsupported method' };
                }
                break;
            }
                
            case 'delete-record':
                // Delete record from database
                try {
                    const { entityType, id } = body;
                    console.log('🗑️ DELETE REQUEST:', { entityType, id });
                    let tableName = '';
                    
                    // Map entity type to table name
                    switch(entityType) {
                        case 'user':
                            tableName = 'Users';
                            break;
                        case 'server':
                            tableName = 'Servers';
                            break;
                        case 'environment':
                            tableName = 'Environments';
                            break;
                        case 'credential':
                            tableName = 'Credentials';
                            break;
                        case 'script':
                            tableName = 'Scripts';
                            break;
                        case 'build':
                            tableName = 'Builds';
                            break;
                        default:
                            throw new Error(`Unknown entity type: ${entityType}`);
                    }
                    
                    console.log('🗑️ EXECUTING DELETE:', `DELETE FROM ${tableName} WHERE id = @param0`, [{ value: id }]);
                    const deleteResult = await window.electronAPI.dbExecute(
                        `DELETE FROM ${tableName} WHERE id = @param0`,
                        [{ value: id }]
                    );
                    
                    console.log('🗑️ DELETE RESULT:', deleteResult);
                    
                    if (deleteResult.success) {
                        result = { success: true, message: `${entityType} deleted from database`, rowsAffected: deleteResult.rowsAffected };
                    } else {
                        result = { success: false, error: deleteResult.error };
                    }
                } catch (error) {
                    result = { success: false, error: error.message };
                }
                break;
                
            case 'db-query':
                result = await window.electronAPI.dbQuery(body.query, body.params);
                break;
                
            case 'db-execute':
                result = await window.electronAPI.dbExecute(body.query, body.params);
                break;
                
            default:
                // Dynamic endpoint handling
                if (endpoint.startsWith('messages/unread/')) {
                    await ensureMessagesTable()
                    const userId = endpoint.substring('messages/unread/'.length);
                    const tbl = MESSAGES_TABLE || '[dbo].Messages'
                    const q = await window.electronAPI.dbQuery(
                        `SELECT COUNT(*) AS cnt FROM ${tbl} WHERE LOWER(LTRIM(RTRIM(RecipientId))) = LOWER(LTRIM(RTRIM(@param0))) AND [Read] = 0`,
                        [{ value: userId }]
                    );
                    const count = q.success && q.data && q.data[0] ? (q.data[0].cnt || 0) : 0;
                    result = { success: true, unreadCount: count };
                } else if (endpoint.startsWith('messages/') && method === 'GET') {
                    await ensureMessagesTable()
                    const tbl = MESSAGES_TABLE || '[dbo].Messages'
                    // GET /api/messages/{currentUserId}?otherUserId=...
                    const pathPart = endpoint.split('?')[0];
                    const currentUserId = pathPart.substring('messages/'.length);
                    const qs = new URLSearchParams(url.split('?')[1] || '');
                    const otherUserId = qs.get('otherUserId');
                    if (!currentUserId || !otherUserId) {
                        result = { success: false, error: 'Missing user ids' };
                    } else {
                        // Normalize IDs to strings to avoid type/whitespace mismatches
                        const curId = String(currentUserId).trim()
                        const othId = String(otherUserId).trim()

                        let q
                        if (curId === othId) {
                            // Self-DM: include messages to self and any legacy self-notes with NULL recipient
                            try {
                                // Database available, proceed with query
                            } catch {}
                            // JOIN with Users table to get sender name
                            q = await window.electronAPI.dbQuery(
                                `SELECT m.Id, m.SenderId, m.RecipientId, m.Content, m.SentAt, m.[Read],
                                        ISNULL(m.HasAttachment, 0) AS HasAttachment, 
                                        m.AttachmentName, 
                                        m.AttachmentSize, 
                                        m.AttachmentType,
                                        u.name AS SenderName, u.username AS SenderUsername
                                 FROM ${tbl} m
                                 LEFT JOIN Users u ON LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(u.id)))
                                 WHERE LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(@param0)))
                                   AND (
                                        LOWER(LTRIM(RTRIM(m.RecipientId))) = LOWER(LTRIM(RTRIM(@param0)))
                                     OR m.RecipientId IS NULL
                                     OR LTRIM(RTRIM(m.RecipientId)) = ''
                                   )
                                 ORDER BY m.SentAt ASC`,
                                [{ value: curId }]
                            )
                            // Fallback: if still empty, include any row where user appears as sender or recipient
                            if (!(q.success && Array.isArray(q.data) && q.data.length > 0)) {
                                const q2 = await window.electronAPI.dbQuery(
                                    `SELECT m.Id, m.SenderId, m.RecipientId, m.Content, m.SentAt, m.[Read],
                                            ISNULL(m.HasAttachment, 0) AS HasAttachment,
                                            m.AttachmentName,
                                            m.AttachmentSize,
                                            m.AttachmentType,
                                            u.name AS SenderName, u.username AS SenderUsername
                                     FROM ${tbl} m
                                     LEFT JOIN Users u ON LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(u.id)))
                                     WHERE LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(@param0)))
                                        OR LOWER(LTRIM(RTRIM(m.RecipientId))) = LOWER(LTRIM(RTRIM(@param0)))
                                     ORDER BY m.SentAt ASC`,
                                    [{ value: curId }]
                                )
                                if (q2.success) q = q2
                            }
                        } else {
                            try {
                                // Database available, proceed with query
                            } catch (e) {
                                // Query error
                            }
                            // JOIN with Users table to get sender name
                            // Try simpler query first without complex string matching
                            q = await window.electronAPI.dbQuery(
                                `SELECT m.Id, m.SenderId, m.RecipientId, m.Content, m.SentAt, m.[Read],
                                        ISNULL(m.HasAttachment, 0) AS HasAttachment,
                                        m.AttachmentName,
                                        m.AttachmentSize,
                                        m.AttachmentType,
                                        u.name AS SenderName, u.username AS SenderUsername
                                 FROM ${tbl} m
                                 LEFT JOIN Users u ON m.SenderId = u.id
                                 WHERE (m.SenderId = @param0 AND m.RecipientId = @param1)
                                    OR (m.SenderId = @param1 AND m.RecipientId = @param0)
                                 ORDER BY m.SentAt ASC`,
                                [{ value: curId }, { value: othId }]
                            )
                            
                            // If that didn't work, try the complex string matching
                            if (!q.success || !q.data || q.data.length === 0) {
                                q = await window.electronAPI.dbQuery(
                                    `SELECT m.Id, m.SenderId, m.RecipientId, m.Content, m.SentAt, m.[Read],
                                            ISNULL(m.HasAttachment, 0) AS HasAttachment,
                                            m.AttachmentName,
                                            m.AttachmentSize,
                                            m.AttachmentType,
                                            u.name AS SenderName, u.username AS SenderUsername
                                     FROM ${tbl} m
                                     LEFT JOIN Users u ON LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(u.id)))
                                     WHERE (LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(@param0))) AND LOWER(LTRIM(RTRIM(m.RecipientId))) = LOWER(LTRIM(RTRIM(@param1))))
                                        OR (LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(@param1))) AND LOWER(LTRIM(RTRIM(m.RecipientId))) = LOWER(LTRIM(RTRIM(@param0))))
                                     ORDER BY m.SentAt ASC`,
                                    [{ value: curId }, { value: othId }]
                                )
                            }
                        }
                        const rows = q.success && Array.isArray(q.data) ? q.data : []
                        result = rows;
                    }
                } else if (endpoint === 'messages/read' && method === 'PUT') {
                    await ensureMessagesTable()
                    const { userId, otherUserId } = body;
                    const tbl = MESSAGES_TABLE || '[dbo].Messages'
                    const upd = await window.electronAPI.dbExecute(
                        `UPDATE ${tbl} SET [Read] = 1 WHERE LOWER(LTRIM(RTRIM(RecipientId))) = LOWER(LTRIM(RTRIM(@param0))) AND LOWER(LTRIM(RTRIM(SenderId))) = LOWER(LTRIM(RTRIM(@param1))) AND [Read] = 0`,
                        [{ value: userId }, { value: otherUserId }]
                    );
                    result = { success: !!upd.success, rowsAffected: upd.rowsAffected };
                } else if (endpoint === 'run-build') {
                    // Execute PowerShell build script on remote server
                    const { buildId, userId } = body;
                    
                    try {
                        // Load build data from database
                        const buildQuery = await window.electronAPI.dbQuery(
                            'SELECT * FROM Builds WHERE id = @param0',
                            [{ value: buildId }]
                        );
                        
                        if (!buildQuery.success || !buildQuery.data || buildQuery.data.length === 0) {
                            result = { success: false, error: 'Build not found' };
                        } else {
                            const build = buildQuery.data[0];
                            
                            // Load server data
                            const serverQuery = await window.electronAPI.dbQuery(
                                'SELECT * FROM Servers WHERE id = @param0',
                                [{ value: build.serverId }]
                            );
                            
                            if (!serverQuery.success || !serverQuery.data || serverQuery.data.length === 0) {
                                result = { success: false, error: 'Server not found' };
                            } else {
                                const server = serverQuery.data[0];
                                
                                // Parse server description for extra data
                                let serverData = {
                                    ipAddress: server.host,
                                    port: server.port || 5985
                                };
                                try {
                                    if (server.description && server.description.startsWith('{')) {
                                        const extraData = JSON.parse(server.description);
                                        serverData.ipAddress = extraData.ipAddress || server.host;
                                    }
                                } catch (e) {}
                                
                                // Use targetOverride if provided
                                const targetHost = build.targetOverride || serverData.ipAddress;
                                
                                // Load credential data if server has credentialId
                                let credential = null;
                                if (server.credential_id) {
                                    const credQuery = await window.electronAPI.dbQuery(
                                        'SELECT * FROM Credentials WHERE id = @param0',
                                        [{ value: server.credential_id }]
                                    );
                                    
                                    if (credQuery.success && credQuery.data && credQuery.data.length > 0) {
                                        credential = credQuery.data[0];
                                    }
                                }
                                
                                if (!credential) {
                                    result = { 
                                        success: false, 
                                        error: 'No credentials configured for this server. Please assign credentials in the server settings.' 
                                    };
                                } else {
                                    // Execute PowerShell script on remote server
                                    console.log('🚀 Executing build on', targetHost, 'with credentials:', credential.username);
                                    
                                    // Replace variables in script
                                    let processedScript = build.script || '';
                                    const serverName = server.name || 'Unknown';
                                    const serverIp = serverData.ipAddress;
                                    
                                    processedScript = processedScript
                                        .replace(/\{\{SERVER_NAME\}\}/g, serverName)
                                        .replace(/\{\{SERVER_IP\}\}/g, serverIp)
                                        .replace(/\{\{SERVER_HOST\}\}/g, targetHost)
                                        .replace(/\{\{BUILD_NAME\}\}/g, build.name || 'Build')
                                        .replace(/\{\{USER\}\}/g, userId || 'System');
                                    
                                    const startTime = Date.now();
                                    console.log('🚀 Executing PowerShell on:', targetHost, 'User:', credential.username, 'Domain:', credential.domain || '(none)');
                                    console.log('📜 Script preview:', processedScript.substring(0, 200) + '...');
                                    
                                    const executionResult = await window.electronAPI.executePowerShellRemote(
                                        targetHost,
                                        processedScript,
                                        credential.username,
                                        credential.password,
                                        credential.domain || null
                                    );
                                    const elapsedMs = Date.now() - startTime;
                                    
                                    console.log('📊 Build execution result:', JSON.stringify(executionResult, null, 2));
                                    
                                    if (!executionResult) {
                                        result = {
                                            success: false,
                                            error: 'PowerShell execution returned null/undefined. Check if executePowerShellRemote is properly implemented.'
                                        };
                                    } else {
                                        const combinedOutput = [executionResult.output, executionResult.error]
                                            .filter(Boolean)
                                            .join('\n')
                                            .trim();

                                        const errorText = executionResult.success ? null : (executionResult.error || executionResult.output || `Build failed: exitCode=${executionResult.exitCode}, no output captured`);

                                        result = {
                                            success: true,
                                            buildSuccess: !!executionResult.success,
                                            output: combinedOutput || '(no output)',
                                            exitCode: Number.isInteger(executionResult.exitCode) ? executionResult.exitCode : (executionResult.success ? 0 : 1),
                                            timestamp: Date.now(),
                                            elapsedMs: elapsedMs,
                                            error: errorText
                                        };
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error('❌ Build execution error:', error);
                        result = { 
                            success: false, 
                            error: `Build execution failed: ${error.message}` 
                        };
                    }
                } else {
                    result = { success: false, error: 'Endpoint not implemented' };
                }
        }
        
        // Return a mock Response object
        return {
            ok: result.success !== false,
            status: result.success !== false ? 200 : 500,
            json: async () => result,
            text: async () => JSON.stringify(result)
        };
    } catch (error) {
        return {
            ok: false,
            status: 500,
            json: async () => ({ success: false, error: error.message }),
            text: async () => JSON.stringify({ success: false, error: error.message })
        };
    }
}
