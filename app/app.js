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

async function handleElectronAPI(url, options) {
    const endpoint = url.split('/api/')[1];
    const body = options && options.body ? JSON.parse(options.body) : {};
    
    try {
        let result;
        
        switch(endpoint) {
            case 'rdp-connect':
                result = await window.electronAPI.connectRDP(body.server, body.credential, body.rdpContent);
                break;
                
            // Database configuration
            case 'db-config':
                if (options.method === 'GET') {
                    result = await window.electronAPI.getDbConfig();
                } else if (options.method === 'POST') {
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
                                    deployerId: extra.deployerId || null,
                                    mappedServers: Array.isArray(extra.mappedServers) ? extra.mappedServers : [],
                                    description: (typeof e.description === 'string' && !e.description.trim().startsWith('{')) ? (e.description || '') : (extra.note || ''),
                                    color: e.color || '#3b82f6'
                                };
                            }) : [],
                            credentials: credentials.success && credentials.data ? credentials.data.map(c => ({
                                id: c.id,
                                name: c.name,
                                username: c.username,
                                password: c.password,
                                domain: c.domain || '',
                                description: c.description || ''
                            })) : [],
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
                                version: b.version || '',
                                environmentId: b.environment_id,
                                status: b.status || 'pending',
                                log: b.log || '',
                                created_at: b.created_at,
                                updated_at: b.updated_at
                            })) : []
                        }
                    };
                } catch (error) {
                    result = { success: false, error: error.message };
                }
                break;
                
            case 'sync-data':
                // Sync data to database (insert/update)
                try {
                    const { users, servers, environments, credentials, scripts, builds } = body;
                    
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
                                deployerId: env.deployerId || null,
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
                                    { value: cred.description || '' }
                                ]
                            );
                        }
                    }
                    
                    // Sync servers
                    if (servers && servers.length > 0) {
                        for (const server of servers) {
                            // Store UI data in description as JSON for fields not in schema
                            const extraData = JSON.stringify({
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
                                    { value: server.port || 3389 },
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
                                    UPDATE Builds SET name = @param1, version = @param2, environment_id = @param3, status = @param4, log = @param5, updated_at = GETDATE() WHERE id = @param0
                                ELSE
                                    INSERT INTO Builds (id, name, version, environment_id, status, log, created_at, updated_at) VALUES (@param0, @param1, @param2, @param3, @param4, @param5, GETDATE(), GETDATE())`,
                                [
                                    { value: build.id },
                                    { value: build.name },
                                    { value: build.version || '' },
                                    { value: build.environmentId },
                                    { value: build.status || 'pending' },
                                    { value: build.log || '' }
                                ]
                            );
                        }
                    }
                    
                    result = { success: true, message: 'Data synced to database' };
                } catch (error) {
                    result = { success: false, error: error.message };
                }
                break;
                
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
                // Return a mock Response object
                result = { success: false, error: 'Endpoint not implemented' };
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

// Load the original app.js after setting up overrides
const script = document.createElement('script');
script.src = 'app-original.js';
document.head.appendChild(script);
