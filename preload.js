const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // RDP Connection
    connectRDP: (server, credential, rdpContent) => 
        ipcRenderer.invoke('rdp-connect', { server, credential, rdpContent }),
    // SSH/PuTTY Connection
    connectSSH: (server, credential) =>
        ipcRenderer.invoke('ssh-connect', { server, credential }),
    
    // Database Configuration
    getDbConfig: () => ipcRenderer.invoke('db-get-config'),
    saveDbConfig: (config) => ipcRenderer.invoke('db-save-config', config),
    testDbConnection: (config) => ipcRenderer.invoke('db-test-connection', config),
    runMigrations: (config) => ipcRenderer.invoke('db-run-migrations', config),
    createDatabase: (config) => ipcRenderer.invoke('db-create-database', config),
    
    // Database Queries
    dbQuery: (query, params) => ipcRenderer.invoke('db-query', query, params),
    dbExecute: (query, params) => ipcRenderer.invoke('db-execute', query, params),
    
    // Server utilities
    testServer: (ipAddress, serverName, port = 3389) => 
        ipcRenderer.invoke('test-server', { ipAddress, serverName, port }),
    
    // System info
    getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
    
    // External links
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    
    // App info
    isElectron: true,
    platform: process.platform
});
