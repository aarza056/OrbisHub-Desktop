const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron');
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
let dbConfig = null;

// Config file path
const configPath = path.join(app.getPath('userData'), 'db-config.json');

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

// Load database configuration
function loadDbConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            dbConfig = JSON.parse(data);
            return dbConfig;
        }
    } catch (error) {
        console.error('Error loading DB config:', error);
    }
    return null;
}

// Save database configuration
function saveDbConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        dbConfig = config;
        return true;
    } catch (error) {
        console.error('Error saving DB config:', error);
        return false;
    }
}

// Get database connection pool
async function getDbPool() {
    if (!dbConfig || !dbConfig.connected) {
        throw new Error('Database not configured');
    }

    if (dbPool && dbPool.connected) {
        return dbPool;
    }

    const config = {
        server: dbConfig.server,
        database: dbConfig.database,
        options: {
            encrypt: dbConfig.encrypt,
            trustServerCertificate: dbConfig.trustCert,
            enableArithAbort: true
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

    dbPool = await sql.connect(config);
    return dbPool;
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

// Test server connectivity (RDP port 3389 by default)
ipcMain.handle('test-server', async (event, { ipAddress, serverName, port = 3389 }) => {
    try {
        const isWindows = process.platform === 'win32';
        const cmd = isWindows
            ? `powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Test-NetConnection -ComputerName '${ipAddress}' -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue; if ($r) { 'True' } else { 'False' } } catch { 'False' }"`
            : `nc -z -w 2 ${ipAddress} ${port} && echo True || echo False`;

        return await new Promise((resolve) => {
            exec(cmd, { timeout: 7000 }, (error, stdout) => {
                const out = (stdout || '').toString().trim();
                const reachable = /true/i.test(out);
                resolve({ success: true, reachable, message: reachable ? 'Reachable' : 'Unreachable', debug: { stdout: out } });
            });
        });
    } catch (error) {
        return { success: false, reachable: false, error: error.message };
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
            request.input(`param${index}`, param.value);
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
        
        // Scripts table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Scripts' AND xtype='U')
            CREATE TABLE Scripts (
                id NVARCHAR(50) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                description NVARCHAR(MAX),
                content NVARCHAR(MAX) NOT NULL,
                language NVARCHAR(50) DEFAULT 'powershell',
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE()
            )
        `);
        migrations.push('Scripts table created');
        
        // Builds table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Builds' AND xtype='U')
            CREATE TABLE Builds (
                id NVARCHAR(50) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                version NVARCHAR(50),
                environment_id NVARCHAR(50),
                status NVARCHAR(50) DEFAULT 'pending',
                log NVARCHAR(MAX),
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE(),
                FOREIGN KEY (environment_id) REFERENCES Environments(id)
            )
        `);
        migrations.push('Builds table created');

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
        
        if (checkDb.recordset.length > 0) {
            // Database exists - try to drop it
            console.log(`Database '${config.database}' exists. Attempting to drop...`);
            try {
                await pool.request().query(`
                    ALTER DATABASE [${config.database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                    DROP DATABASE [${config.database}];
                `);
                console.log(`Database '${config.database}' dropped successfully`);
            } catch (dropError) {
                console.error('Drop error:', dropError);
                await pool.close();
                return { 
                    success: false, 
                    error: `Database exists and could not be dropped: ${dropError.message}` 
                };
            }
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

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    createTray();
    
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
    if (dbPool) {
        try {
            await dbPool.close();
        } catch (error) {
            console.error('Error closing database pool:', error);
        }
    }
});
