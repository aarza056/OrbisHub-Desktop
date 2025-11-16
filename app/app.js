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

// Messaging moved to services/messages.js

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
                try {
                    result = await window.Data.loadAll();
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
                try {
                    result = await window.Data.syncAll(body || {});
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
                    const sendRes = await window.Messages.send(body);
                    result = sendRes;
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
                try {
                    const { entityType, id } = body;
                    const del = await window.Entities.deleteRecord(entityType, id);
                    if (del.success) {
                        result = { success: true, message: `${entityType} deleted from database`, rowsAffected: del.rowsAffected };
                    } else {
                        result = { success: false, error: del.error };
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
                    const userId = endpoint.substring('messages/unread/'.length);
                    const count = await window.Messages.unreadCount(userId);
                    result = { success: true, unreadCount: count };
                } else if (endpoint.startsWith('messages/') && method === 'GET') {
                    // GET /api/messages/{currentUserId}?otherUserId=...
                    const pathPart = endpoint.split('?')[0];
                    const currentUserId = pathPart.substring('messages/'.length);
                    const qs = new URLSearchParams(url.split('?')[1] || '');
                    const otherUserId = qs.get('otherUserId');
                    if (!currentUserId || !otherUserId) {
                        result = { success: false, error: 'Missing user ids' };
                    } else {
                        const rows = await window.Messages.list(currentUserId, otherUserId);
                        result = rows;
                    }
                } else if (endpoint === 'messages/read' && method === 'PUT') {
                    const { userId, otherUserId } = body;
                    result = await window.Messages.markRead(userId, otherUserId);
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
