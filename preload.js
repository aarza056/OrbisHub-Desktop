const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
// Listen for exit confirmation request from main process
ipcRenderer.on('show-exit-confirmation', () => {
    window.dispatchEvent(new CustomEvent('show-exit-modal'));
});

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
    dbGetSize: () => ipcRenderer.invoke('db-get-size'),
    
    // HTTP Requests (for Core Service API)
    httpRequest: (url, options) => ipcRenderer.invoke('http-request', url, options),
    
    // Password hashing
    hashPassword: (password) => ipcRenderer.invoke('hash-password', password),
    verifyPassword: (password, hashedPassword) => ipcRenderer.invoke('verify-password', password, hashedPassword),
    
    // Message encryption
    encryptMessage: (message) => ipcRenderer.invoke('encrypt-message', message),
    decryptMessage: (encryptedMessage) => ipcRenderer.invoke('decrypt-message', encryptedMessage),
    
    // Server utilities
    testServer: (ipAddress, serverName, port = 3389) => 
        ipcRenderer.invoke('test-server', { ipAddress, serverName, port }),
    getServerUptime: (params) => ipcRenderer.invoke('get-server-uptime', params),
    
    
    // System info
    getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
    
    // External links
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    
    // File selection
    selectFile: () => ipcRenderer.invoke('select-file'),
    
    // File download
    downloadFile: (params) => ipcRenderer.invoke('download-file', params),
    
    // Message notifications
    startMessagePolling: (userId) => ipcRenderer.invoke('start-message-polling', userId),
    stopMessagePolling: () => ipcRenderer.invoke('stop-message-polling'),
    markMessagesRead: (currentUserId, otherUserId) => 
        ipcRenderer.invoke('mark-messages-read', { currentUserId, otherUserId }),
    onNewUnreadMessages: (callback) => {
        ipcRenderer.on('new-unread-messages', (event, data) => callback(data));
    },
    
    // Auto-updater
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    // Get app version
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // Confirm exit
    confirmExit: () => ipcRenderer.invoke('confirm-exit'),
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (event, data) => callback(data));
    },
    onUpdateNotAvailable: (callback) => {
        ipcRenderer.on('update-not-available', (event, data) => callback(data));
    },
    onUpdateDownloadProgress: (callback) => {
        ipcRenderer.on('update-download-progress', (event, data) => callback(data));
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (event, data) => callback(data));
    },
    onUpdateError: (callback) => {
        ipcRenderer.on('update-error', (event, data) => callback(data));
    },
    
    // App info
    isElectron: true,
    platform: process.platform
});
