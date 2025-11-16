const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sql = require('mssql');

// Disable cache to avoid permission errors
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow;
let tray;
let dbPool = null;
let poolConnectPromise = null;
let dbConfig = null;
let messageCheckInterval = null;
let lastCheckedMessageIds = new Set();

// Config file paths (support legacy location under product name)
const userDataDir = app.getPath('userData');
const configPath = path.join(userDataDir, 'db-config.json');
const legacyConfigPath = path.join(app.getPath('appData'), 'OrbisHub Desktop', 'db-config.json');

// Create main window
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(__dirname, 'assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        frame: true,
        backgroundColor: '#0a0a0a',
        show: false
    });

    mainWindow.loadFile('app/index.html');

    // Open DevTools with F12 or Ctrl+Shift+I (for debugging in production)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && 
            ((input.key === 'F12') || 
             (input.control && input.shift && input.key === 'I'))) {
            mainWindow.webContents.toggleDevTools();
        }
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

// Create system tray
function createTray() {
    tray = new Tray(path.join(__dirname, 'assets/tray-icon.png'));
    
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open OrbisHub',
            click: () => {
                mainWindow.show();
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.setToolTip('OrbisHub Desktop');
    
    tray.on('click', () => {
        mainWindow.show();
    });
}

// Best-effort cleanup of Chromium caches that may block startup on some systems
async function clearChromiumCaches() {
    try {
        const { session } = require('electron');
        const udir = app.getPath('userData');
        const paths = [
            path.join(udir, 'Service Worker'),
            path.join(udir, 'GPUCache'),
            path.join(udir, 'Code Cache')
        ];
        for (const p of paths) {
            try {
                if (fs.existsSync(p)) {
                    fs.rmSync(p, { recursive: true, force: true });
                }
            } catch (e) {
                console.warn('Cache cleanup warning:', p, e.message);
            }
        }
        try {
            await session.defaultSession.clearStorageData({ storages: ['serviceworkers'] });
        } catch (e) {
            console.warn('Session storage cleanup warning:', e.message);
        }
    } catch (e) {
        console.warn('Chromium cache cleanup skipped:', e.message);
    }
}

// Load database configuration
function loadDbConfig() {
    try {
        // Preferred location
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            dbConfig = JSON.parse(data);
            return dbConfig;
        }
        // Legacy migration: copy from legacy path if it exists
        if (fs.existsSync(legacyConfigPath)) {
            try {
                // Ensure userData directory exists
                if (!fs.existsSync(userDataDir)) {
                    fs.mkdirSync(userDataDir, { recursive: true });
                }
                const data = fs.readFileSync(legacyConfigPath, 'utf8');
                fs.writeFileSync(configPath, data);
                dbConfig = JSON.parse(data);
                console.log('Migrated DB config from legacy path:', legacyConfigPath);
                return dbConfig;
            } catch (mErr) {
                console.warn('Legacy DB config migration failed:', mErr.message);
            }
        }
    } catch (error) {
        console.error('Error loading DB config:', error);
    }
    return null;
}

// Save database configuration
function saveDbConfig(config) {
    try {
        // Ensure directory exists
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        dbConfig = config;
        return true;
    } catch (error) {
        console.error('Error saving DB config:', error);
        return false;
    }
}

// Get database connection pool (lazy-load persisted config on cold start)
async function getDbPool() {
    if (!dbConfig || !dbConfig.connected) {
        const loaded = loadDbConfig();
        if (loaded && loaded.connected) {
            dbConfig = loaded;
        } else {
            throw new Error('Database not configured');
        }
    }

    if (dbPool && dbPool.connected) return dbPool;
    if (poolConnectPromise) {
        try {
            await poolConnectPromise;
            if (dbPool && dbPool.connected) return dbPool;
        } catch (_) {
            // fallthrough to attempt a fresh connect
        }
    }

    const config = {
        server: dbConfig.server,
        database: dbConfig.database,
        options: {
            encrypt: dbConfig.encrypt,
            trustServerCertificate: dbConfig.trustCert,
            enableArithAbort: true,
            connectTimeout: 10000
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };

    if (dbConfig.authType === 'sql') {
        config.user = dbConfig.user;
        config.password = dbConfig.password;
        config.authentication = { type: 'default' };
    } else {
        config.authentication = {
            type: 'ntlm',
            options: { domain: '', userName: '', password: '' }
        };
    }

    const pool = new sql.ConnectionPool(config);
    pool.on('error', err => {
        console.error('DB pool error:', err.message);
    });
    poolConnectPromise = pool.connect();
    try {
        await poolConnectPromise;
        dbPool = pool;
        return dbPool;
    } catch (e) {
        // ensure failed pool is closed and reset promise
        try { await pool.close(); } catch {}
        poolConnectPromise = null;
        throw e;
    }
}

// IPC Handlers

// RDP Connection
ipcMain.handle('rdp-connect', async (event, { server, credential, rdpContent }) => {
    try {
        // Create temporary RDP file
        const tempDir = os.tmpdir();
        const fileName = `orbis_${server.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.rdp`;
        const filePath = path.join(tempDir, fileName);

        // Write RDP content to temp file
        fs.writeFileSync(filePath, rdpContent, 'utf8');

        // Launch mstsc with the RDP file
        const command = process.platform === 'win32' 
            ? `mstsc "${filePath}"`
            : `open "${filePath}"`;
        
        exec(command, (error) => {
            // Clean up temp file after delay
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (cleanupError) {
                    console.error('Cleanup error:', cleanupError);
                }
            }, 5000);

            if (error) {
                console.error('MSTSC launch error:', error);
            }
        });

        return { success: true };
    } catch (error) {
        console.error('RDP connection error:', error);
        return { success: false, error: error.message };
    }
});

// Test server connectivity using ICMP ping first, then TCP probes
ipcMain.handle('test-server', async (event, { ipAddress, serverName, port = 3389 }) => {
    const isWindows = process.platform === 'win32';

    // Quick ICMP ping (kept for environments where ping is allowed)
    async function pingHost() {
        return await new Promise((resolve) => {
            const cmd = isWindows
                ? `ping -n 1 -w 800 ${ipAddress}`
                : `ping -c 1 -W 1 ${ipAddress}`;
            exec(cmd, { timeout: 1200 }, (error, stdout) => {
                const out = (stdout || '').toString();
                const ok = !error; // rely on exit code
                resolve({ ok, out });
            });
        });
    }

    // Minimal TCP port set to fit UI timeout budget
    const reqPort = Number(port) || 3389;
    let fallbacks = [];
    if (reqPort === 3389) fallbacks = [5985, 445];
    else if (reqPort === 22) fallbacks = [80];
    else fallbacks = [3389];
    const portsToTry = Array.from(new Set([reqPort, ...fallbacks]));

    async function tryPort(p) {
        return await new Promise((resolve) => {
            const cmd = isWindows
                ? `powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Test-NetConnection -ComputerName '${ipAddress}' -Port ${p} -InformationLevel Quiet -WarningAction SilentlyContinue; if ($r) { 'True' } else { 'False' } } catch { 'False' }"`
                : `nc -z -w 1 ${ipAddress} ${p} && echo True || echo False`;

            exec(cmd, { timeout: 1000 }, (error, stdout) => {
                const out = (stdout || '').toString().trim();
                const ok = /true/i.test(out);
                resolve({ ok, out });
            });
        });
    }

    try {
        const attempted = [];
        const ping = await pingHost();
        if (ping.ok) {
            return {
                success: true,
                reachable: true,
                message: 'Reachable by ICMP ping',
                port: null,
                pingReachable: true,
                tcpReachable: false,
                debug: { attempted, pingOut: ping.out, stdout: ping.out }
            };
        }

        for (const p of portsToTry) {
            const r = await tryPort(p);
            attempted.push({ port: p, reachable: r.ok });
            if (r.ok) {
                return {
                    success: true,
                    reachable: true,
                    message: `Reachable on TCP port ${p}`,
                    port: p,
                    pingReachable: false,
                    tcpReachable: true,
                    debug: { attempted, stdout: r.out }
                };
            }
        }

        return {
            success: true,
            reachable: false,
            message: 'Ping and TCP checks failed',
            port: null,
            pingReachable: false,
            tcpReachable: false,
            debug: { attempted, pingOut: ping.out, stdout: ping.out }
        };
    } catch (error) {
        return { success: false, reachable: false, error: error.message };
    }
});

// Remote PowerShell execution removed with Scripts/Builds/Pipelines

// SSH/PuTTY connection
ipcMain.handle('ssh-connect', async (event, { server, credential }) => {
    try {
        const host = server.ipAddress || server.hostname;
        const port = server.port || 22;
        const user = credential.username;
        const password = credential.password; // Note: passed to PuTTY with -pw

        // Try to locate PuTTY
        const puttyPaths = [
            'C:\\Program Files\\PuTTY\\putty.exe',
            'C:\\Program Files (x86)\\PuTTY\\putty.exe'
        ];
        let puttyExe = null;
        for (const p of puttyPaths) {
            try { if (fs.existsSync(p)) { puttyExe = p; break; } } catch {}
        }

        let command;
        if (puttyExe) {
            // Launch PuTTY with username, host, port and password
            const args = [`-ssh`, `${user}@${host}`, `-P`, `${port}`];
            if (password) args.push(`-pw`, `${password}`);
            command = `start "" "${puttyExe}" ${args.map(a => (a.includes(' ') ? '"'+a+'"' : a)).join(' ')}`;
        } else {
            // Fallback to Windows OpenSSH (opens a new cmd window)
            // Password auth will prompt; key auth not handled here
            command = `start "" cmd /c ssh ${user}@${host} -p ${port}`;
        }

        exec(command, (error) => {
            if (error) {
                console.error('SSH launch error:', error);
            }
        });

        return { success: true };
    } catch (error) {
        console.error('SSH connection error:', error);
        return { success: false, error: error.message };
    }
});

// Database Configuration
ipcMain.handle('db-get-config', async () => {
    const config = loadDbConfig();
    return config || { connected: false };
});

ipcMain.handle('db-save-config', async (event, config) => {
    return saveDbConfig(config);
});

ipcMain.handle('db-test-connection', async (event, config) => {
    try {
        const testConfig = {
            server: config.server,
            database: config.database,
            options: {
                encrypt: config.encrypt,
                trustServerCertificate: config.trustCert,
                enableArithAbort: true,
                connectTimeout: 10000
            }
        };

        if (config.authType === 'sql') {
            testConfig.user = config.user;
            testConfig.password = config.password;
            testConfig.authentication = { type: 'default' };
        } else {
            testConfig.authentication = {
                type: 'ntlm',
                options: { domain: '', userName: '', password: '' }
            };
        }

        const testPool = await sql.connect(testConfig);
        const result = await testPool.request().query('SELECT @@VERSION as version');
        await testPool.close();

        return { 
            success: true, 
            message: 'Connected successfully!',
            version: result.recordset[0].version 
        };
    } catch (error) {
        return { 
            success: false, 
            error: error.message 
        };
    }
});

// Database Queries
ipcMain.handle('db-query', async (event, query, params = []) => {
    try {
        const pool = await getDbPool();
        const request = pool.request();
        
        // Add parameters - extract value from param objects
        params.forEach((param, index) => {
            const value = param && typeof param === 'object' && 'value' in param ? param.value : param;
            request.input(`param${index}`, value);
        });
        
        const result = await request.query(query);
        return { success: true, data: result.recordset };
    } catch (error) {
        console.error('Database query error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('db-execute', async (event, query, params = []) => {
    try {
        const pool = await getDbPool();
        const request = pool.request();
        
        // Add parameters
        params.forEach((param, index) => {
            let value = param.value;
            // Convert array to Buffer if it looks like binary data
            if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
                value = Buffer.from(value);
            }
            request.input(`param${index}`, value);
        });
        
        const result = await request.query(query);
        return { 
            success: true, 
            rowsAffected: result.rowsAffected[0],
            data: result.recordset 
        };
    } catch (error) {
        console.error('Database execute error:', error);
        return { success: false, error: error.message };
    }
});

// Run migrations - Create database schema
ipcMain.handle('db-run-migrations', async (event, config) => {
    try {
        const testConfig = {
            server: config.server,
            database: config.database,
            options: {
                encrypt: config.encrypt,
                trustServerCertificate: config.trustCert,
                enableArithAbort: true
            }
        };

        if (config.authType === 'sql') {
            testConfig.user = config.user;
            testConfig.password = config.password;
            testConfig.authentication = { type: 'default' };
        } else {
            testConfig.authentication = {
                type: 'ntlm',
                options: { domain: '', userName: '', password: '' }
            };
        }

        const pool = await sql.connect(testConfig);
        
        // Create tables
        const migrations = [];
        
        // Users table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
            CREATE TABLE Users (
                id NVARCHAR(50) PRIMARY KEY,
                username NVARCHAR(255) UNIQUE NOT NULL,
                password NVARCHAR(255) NOT NULL,
                name NVARCHAR(255),
                email NVARCHAR(255),
                role NVARCHAR(50) DEFAULT 'viewer',
                position NVARCHAR(255),
                squad NVARCHAR(255),
                lastLogin BIGINT,
                lastActivity BIGINT,
                ip NVARCHAR(50),
                isActive BIT DEFAULT 1,
                changePasswordOnLogin BIT DEFAULT 0,
                created_at DATETIME DEFAULT GETDATE()
            )
        `);
        migrations.push('Users table created');
        
        // Environments table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Environments' AND xtype='U')
            CREATE TABLE Environments (
                id NVARCHAR(50) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                type NVARCHAR(100),
                url NVARCHAR(500),
                health NVARCHAR(50),
                deployerCredentialId NVARCHAR(50),
                mappedServers NVARCHAR(MAX),
                description NVARCHAR(MAX),
                color NVARCHAR(50),
                created_at DATETIME DEFAULT GETDATE()
            )
        `);
        migrations.push('Environments table created');
        
        // Credentials table (must be created before Servers due to FK)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Credentials' AND xtype='U')
            CREATE TABLE Credentials (
                id NVARCHAR(50) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                username NVARCHAR(255) NOT NULL,
                password NVARCHAR(MAX) NOT NULL,
                domain NVARCHAR(255),
                description NVARCHAR(MAX),
                created_at DATETIME DEFAULT GETDATE()
            )
        `);
        migrations.push('Credentials table created');
        
        // Servers table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Servers' AND xtype='U')
            CREATE TABLE Servers (
                id NVARCHAR(50) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                host NVARCHAR(255) NOT NULL,
                port INT DEFAULT 3389,
                environment_id NVARCHAR(50),
                credential_id NVARCHAR(50),
                description NVARCHAR(MAX),
                status NVARCHAR(50) DEFAULT 'active',
                created_at DATETIME DEFAULT GETDATE(),
                FOREIGN KEY (environment_id) REFERENCES Environments(id),
                FOREIGN KEY (credential_id) REFERENCES Credentials(id)
            )
        `);
        migrations.push('Servers table created');
        
        // Scripts/Builds removed: no Scripts or Builds tables created

        // AuditLogs table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AuditLogs' AND xtype='U')
            CREATE TABLE AuditLogs (
                id NVARCHAR(50) PRIMARY KEY,
                action NVARCHAR(50) NOT NULL,
                entityType NVARCHAR(50) NOT NULL,
                entityName NVARCHAR(255) NOT NULL,
                [user] NVARCHAR(255) NOT NULL,
                username NVARCHAR(255) NOT NULL,
                [timestamp] DATETIME NOT NULL,
                ip NVARCHAR(50),
                details NVARCHAR(MAX)
            )
        `);
        migrations.push('AuditLogs table created');
        
        // Pipelines/Scripts/Builds removed: no pipeline tables created
        
        // Messages table (for direct and channel messages) - ensure dbo schema
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM sys.tables t
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE t.name = 'Messages' AND s.name = 'dbo'
            )
            BEGIN
                CREATE TABLE [dbo].[Messages] (
                    Id NVARCHAR(64) PRIMARY KEY,
                    SenderId NVARCHAR(128) NOT NULL,
                    RecipientId NVARCHAR(128) NULL,
                    ChannelId NVARCHAR(50) NULL,
                    Content NVARCHAR(MAX) NOT NULL,
                    SentAt DATETIME DEFAULT GETDATE(),
                    [Read] BIT DEFAULT 0,
                    HasAttachment BIT DEFAULT 0,
                    AttachmentName NVARCHAR(255) NULL,
                    AttachmentSize INT NULL,
                    AttachmentType NVARCHAR(100) NULL,
                    AttachmentData VARBINARY(MAX) NULL
                )
            END
        `);
        migrations.push('Messages table created');
        
        // Add attachment columns if they don't exist
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Messages]') AND name = 'HasAttachment')
            BEGIN
                ALTER TABLE [dbo].[Messages] ADD HasAttachment BIT DEFAULT 0
            END
            
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Messages]') AND name = 'AttachmentName')
            BEGIN
                ALTER TABLE [dbo].[Messages] ADD AttachmentName NVARCHAR(255) NULL
            END
            
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Messages]') AND name = 'AttachmentSize')
            BEGIN
                ALTER TABLE [dbo].[Messages] ADD AttachmentSize INT NULL
            END
            
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Messages]') AND name = 'AttachmentType')
            BEGIN
                ALTER TABLE [dbo].[Messages] ADD AttachmentType NVARCHAR(100) NULL
            END
            
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('[dbo].[Messages]') AND name = 'AttachmentData')
            BEGIN
                ALTER TABLE [dbo].[Messages] ADD AttachmentData VARBINARY(MAX) NULL
            END
        `);
        migrations.push('Messages table updated with attachment columns');
        
        await pool.close();
        
        return { 
            success: true, 
            message: 'Migrations completed successfully',
            migrations 
        };
    } catch (error) {
        return { 
            success: false, 
            error: error.message 
        };
    }
});
// Create database
ipcMain.handle('db-create-database', async (event, config) => {
    try {
        const testConfig = {
            server: config.server,
            database: 'master', // Connect to master to create new DB
            options: {
                encrypt: config.encrypt,
                trustServerCertificate: config.trustCert,
                enableArithAbort: true
            }
        };

        if (config.authType === 'sql') {
            testConfig.user = config.user;
            testConfig.password = config.password;
            testConfig.authentication = { type: 'default' };
        } else {
            testConfig.authentication = {
                type: 'ntlm',
                options: { domain: '', userName: '', password: '' }
            };
        }

        const pool = await sql.connect(testConfig);
        
        // Check if database exists
            const checkDb = await pool.request()
                .input('dbname', sql.NVarChar, config.database)
                .query(`SELECT database_id FROM sys.databases WHERE name = @dbname`);

            // If exists, do NOT drop; keep data and return success with message
            if (checkDb.recordset.length > 0) {
                await pool.close();
                return { success: true, message: `Database '${config.database}' already exists` };
            }
        
        // Check if physical files exist and try to delete them
        const dataPath = `C:\\Program Files\\Microsoft SQL Server\\MSSQL15.MSSQLSERVER\\MSSQL\\DATA\\`;
        const mdfFile = `${dataPath}${config.database}.mdf`;
        const ldfFile = `${dataPath}${config.database}_log.ldf`;
        
        try {
            // Check if files exist using master.sys.master_files
            const filesCheck = await pool.request().query(`
                SELECT physical_name 
                FROM master.sys.master_files 
                WHERE physical_name LIKE '%${config.database}%'
            `);
            
            if (filesCheck.recordset.length > 0) {
                console.log('Orphaned database files found. Attempting cleanup...');
                // Files exist but database doesn't - need manual cleanup
                await pool.close();
                return {
                    success: false,
                    error: `Database files already exist at: ${mdfFile}. Please delete these files manually or use SSMS to drop the database completely.`
                };
            }
        } catch (fileCheckError) {
            console.log('File check failed (may be normal):', fileCheckError.message);
        }
        
        // Create database using simplest possible syntax
        console.log(`Creating database '${config.database}'...`);
        try {
            // First, get SQL Server's default data path
            const pathQuery = await pool.request().query(`
                SELECT 
                    SERVERPROPERTY('InstanceDefaultDataPath') as DataPath,
                    SERVERPROPERTY('InstanceDefaultLogPath') as LogPath
            `);
            
            const dataPath = pathQuery.recordset[0].DataPath;
            const logPath = pathQuery.recordset[0].LogPath;
            
            console.log(`SQL Server data path: ${dataPath}`);
            console.log(`SQL Server log path: ${logPath}`);
            
            // If we have valid paths, use them explicitly
            if (dataPath && logPath) {
                const dbName = config.database;
                await pool.request().query(`
                    CREATE DATABASE [${dbName}]
                    ON PRIMARY (
                        NAME = N'${dbName}',
                        FILENAME = N'${dataPath}${dbName}.mdf',
                        SIZE = 8MB,
                        FILEGROWTH = 64MB
                    )
                    LOG ON (
                        NAME = N'${dbName}_log',
                        FILENAME = N'${logPath}${dbName}_log.ldf',
                        SIZE = 8MB,
                        FILEGROWTH = 64MB
                    )
                `);
            } else {
                // Fallback to simple creation
                await pool.request().query(`CREATE DATABASE [${config.database}]`);
            }
            
            console.log(`Database '${config.database}' created successfully`);
        } catch (createError) {
            console.error('Create error:', createError);
            await pool.close();
            return {
                success: false,
                error: `CREATE DATABASE failed: ${createError.message}`
            };
        }
        
        await pool.close();
        
        return { 
            success: true, 
            message: `Database '${config.database}' created successfully` 
        };
    } catch (error) {
        console.error('Database creation error:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
});

// Get local IP address
ipcMain.handle('get-local-ip', async () => {
    try {
        const networkInterfaces = os.networkInterfaces();
        for (const interfaceName in networkInterfaces) {
            const addresses = networkInterfaces[interfaceName];
            for (const address of addresses) {
                // Skip internal (loopback) and non-IPv4 addresses
                if (address.family === 'IPv4' && !address.internal) {
                    return address.address;
                }
            }
        }
        return '127.0.0.1'; // Fallback to localhost
    } catch (error) {
        return '127.0.0.1';
    }
});

// Open external URL in default browser
ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        console.error('Failed to open external URL:', error);
        return { success: false, error: error.message };
    }
});

// File selection dialog
ipcMain.handle('select-file', async (event) => {
    try {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'All Files', extensions: ['*'] },
                { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'] },
                { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'] },
                { name: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] }
            ]
        });
        
        if (result.canceled || result.filePaths.length === 0) {
            return { canceled: true };
        }
        
        const filePath = result.filePaths[0];
        const fileName = path.basename(filePath);
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;
        
        // Read file as buffer for database storage
        const fileBuffer = fs.readFileSync(filePath);
        
        return {
            canceled: false,
            filePath: filePath,
            fileName: fileName,
            fileSize: fileSize,
            fileBuffer: fileBuffer,
            fileType: path.extname(fileName)
        };
    } catch (error) {
        console.error('File selection error:', error);
        return { canceled: true, error: error.message };
    }
});

// File download handler
ipcMain.handle('download-file', async (event, { messageId, fileName }) => {
    try {
        const { dialog } = require('electron');
        
        // Get file from database
        const pool = await getDbPool();
        const result = await pool.request()
            .input('messageId', sql.NVarChar, messageId)
            .query('SELECT AttachmentData, AttachmentName, HasAttachment FROM [dbo].[Messages] WHERE Id = @messageId');
        
        if (!result.recordset || result.recordset.length === 0) {
            return { success: false, error: 'Message not found in database' };
        }
        
        if (!result.recordset[0].HasAttachment) {
            return { success: false, error: 'Message has no attachment' };
        }
        
        const fileData = result.recordset[0].AttachmentData;
        const dbFileName = result.recordset[0].AttachmentName || fileName;
        
        if (!fileData) {
            return { success: false, error: 'File data is empty' };
        }
        
        // Show save dialog
        const saveResult = await dialog.showSaveDialog(mainWindow, {
            defaultPath: path.join(app.getPath('downloads'), dbFileName),
            filters: [
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (saveResult.canceled) {
            return { success: false, canceled: true };
        }
        
        // Write file from database to selected location
        fs.writeFileSync(saveResult.filePath, fileData);
        
        return { 
            success: true, 
            filePath: saveResult.filePath,
            message: 'File downloaded successfully'
        };
    } catch (error) {
        console.error('File download error:', error);
        return { success: false, error: error.message };
    }
});

// ==================== REAL-TIME MESSAGE NOTIFICATIONS ====================

// Start checking for new unread messages periodically
function startMessageNotificationPolling() {
    if (messageCheckInterval) {
        clearInterval(messageCheckInterval);
    }
    
    // Check every 2 seconds for new messages
    messageCheckInterval = setInterval(async () => {
        try {
            if (!dbPool || !mainWindow) return;
            
            // Query for unread messages that we haven't seen yet
            const result = await dbPool.request().query(`
                SELECT TOP 10 Id, SenderId, RecipientId, Content, SentAt, HasAttachment
                FROM [dbo].[Messages]
                WHERE [Read] = 0
                ORDER BY SentAt DESC
            `);
            
            if (result.recordset && result.recordset.length > 0) {
                // Check for new messages we haven't notified about
                const newMessages = result.recordset.filter(msg => !lastCheckedMessageIds.has(msg.Id));
                
                if (newMessages.length > 0) {
                    console.log(`📬 Found ${newMessages.length} new unread message(s)`);
                    
                    // Add to checked set
                    newMessages.forEach(msg => lastCheckedMessageIds.add(msg.Id));
                    
                    // Send notification to renderer
                    mainWindow.webContents.send('new-unread-messages', {
                        count: result.recordset.length,
                        newMessages: newMessages
                    });
                }
            } else {
                // No unread messages, clear the checked set
                lastCheckedMessageIds.clear();
            }
        } catch (error) {
            console.error('Error checking for new messages:', error);
        }
    }, 2000); // Check every 2 seconds
}

// Stop message polling
function stopMessageNotificationPolling() {
    if (messageCheckInterval) {
        clearInterval(messageCheckInterval);
        messageCheckInterval = null;
    }
}

// Start polling when renderer requests it
ipcMain.handle('start-message-polling', async (event, userId) => {
    console.log('🔔 Starting message notification polling for user:', userId);
    startMessageNotificationPolling();
    return { success: true };
});

// Stop polling
ipcMain.handle('stop-message-polling', async () => {
    console.log('🔕 Stopping message notification polling');
    stopMessageNotificationPolling();
    return { success: true };
});

// Mark messages as read
ipcMain.handle('mark-messages-read', async (event, { currentUserId, otherUserId }) => {
    try {
        if (!dbPool) {
            return { success: false, error: 'Database not connected' };
        }
        
        // Mark all messages from otherUserId to currentUserId as read
        await dbPool.request()
            .input('currentUserId', sql.NVarChar, currentUserId)
            .input('otherUserId', sql.NVarChar, otherUserId)
            .query(`
                UPDATE [dbo].[Messages]
                SET [Read] = 1
                WHERE LOWER(LTRIM(RTRIM(RecipientId))) = LOWER(LTRIM(RTRIM(@currentUserId)))
                  AND LOWER(LTRIM(RTRIM(SenderId))) = LOWER(LTRIM(RTRIM(@otherUserId)))
                  AND [Read] = 0
            `);
        
        // Remove these message IDs from our checked set so we can track new ones
        const messages = await dbPool.request()
            .input('currentUserId', sql.NVarChar, currentUserId)
            .input('otherUserId', sql.NVarChar, otherUserId)
            .query(`
                SELECT Id FROM [dbo].[Messages]
                WHERE LOWER(LTRIM(RTRIM(RecipientId))) = LOWER(LTRIM(RTRIM(@currentUserId)))
                  AND LOWER(LTRIM(RTRIM(SenderId))) = LOWER(LTRIM(RTRIM(@otherUserId)))
            `);
        
        messages.recordset.forEach(msg => lastCheckedMessageIds.delete(msg.Id));
        
        return { success: true };
    } catch (error) {
        console.error('Error marking messages as read:', error);
        return { success: false, error: error.message };
    }
});

// ============================================
// AUTO-UPDATER SYSTEM
// ============================================

function initializeAutoUpdater() {
    // Configure auto-updater
    autoUpdater.autoDownload = false; // Don't auto-download, let user decide
    autoUpdater.autoInstallOnAppQuit = true;
    
    // Enable detailed logging
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'info';
    
    console.log('🔄 Auto-updater initialized');
    console.log('📦 Current version:', app.getVersion());
    console.log('🔍 Update feed URL:', `https://github.com/aarza056/OrbisHub-Desktop/releases`);
    
    // Check for updates on startup (after 3 seconds)
    setTimeout(() => {
        console.log('⏰ Starting update check...');
        autoUpdater.checkForUpdates().catch(err => {
            console.error('❌ Update check failed:', err);
        });
    }, 3000);
    
    // Check for updates every 4 hours
    setInterval(() => {
        console.log('⏰ Periodic update check...');
        autoUpdater.checkForUpdates().catch(err => {
            console.error('❌ Update check failed:', err);
        });
    }, 4 * 60 * 60 * 1000);
    
    // Update events
    autoUpdater.on('checking-for-update', () => {
        console.log('🔍 Checking for updates...');
    });
    
    autoUpdater.on('update-available', (info) => {
        console.log('✅ Update available:', info.version);
        console.log('📋 Release date:', info.releaseDate);
        console.log('📝 Release notes:', info.releaseNotes);
        mainWindow.webContents.send('update-available', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        });
    });
    
    autoUpdater.on('update-not-available', (info) => {
        console.log('ℹ️ No updates available. Current version is the latest:', info.version);
        mainWindow.webContents.send('update-not-available', {
            version: info.version
        });
    });
    
    autoUpdater.on('error', (err) => {
        console.error('Update error:', err);
        mainWindow.webContents.send('update-error', { message: err.message });
    });
    
    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow.webContents.send('update-download-progress', {
            percent: progressObj.percent,
            transferred: progressObj.transferred,
            total: progressObj.total,
            bytesPerSecond: progressObj.bytesPerSecond
        });
    });
    
    autoUpdater.on('update-downloaded', (info) => {
        console.log('Update downloaded:', info.version);
        mainWindow.webContents.send('update-downloaded', {
            version: info.version
        });
    });
}

// IPC handlers for updates
ipcMain.handle('check-for-updates', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, updateInfo: result?.updateInfo };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('download-update', async () => {
    try {
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// App lifecycle
app.whenReady().then(async () => {
    await clearChromiumCaches();
    createWindow();
    createTray();
    
    // Initialize auto-updater
    initializeAutoUpdater();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Don't quit, just hide to tray
    }
});

app.on('before-quit', async () => {
    stopMessageNotificationPolling();
    
    if (dbPool) {
        try {
            await dbPool.close();
        } catch (error) {
            console.error('Error closing database pool:', error);
        }
    }
});
