const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sql = require('mssql');
const crypto = require('crypto');

// Encryption key for messages (should be stored securely in production)
const ENCRYPTION_KEY = crypto.scryptSync('OrbisHub-Message-Encryption-Key', 'salt', 32);
const IV_LENGTH = 16;

// Message encryption/decryption utilities
function encryptMessage(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptMessage(encryptedText) {
    if (!encryptedText || !encryptedText.includes(':')) {
        // Legacy plain text message
        return encryptedText;
    }
    try {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        // Return original if decryption fails (legacy plain text)
        return encryptedText;
    }
}

// Password hashing utilities
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, hashedPassword) {
    if (!hashedPassword || !hashedPassword.includes(':')) {
        // Legacy plain text password - return true for migration
        return password === hashedPassword;
    }
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

// Disable cache to avoid permission errors
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow;
let dbPool = null;
let poolConnectPromise = null;
let dbConfig = null;
let messageCheckInterval = null;
let lastCheckedMessageIds = new Set();
let isInstallingUpdate = false; // Flag to bypass close confirmation when installing update

// Config file paths - use ProgramData for system-wide configuration
const configDir = path.join('C:', 'ProgramData', 'OrbisHub');
const configPath = path.join(configDir, 'db-config.json');
const legacyUserDataDir = app.getPath('userData');
const legacyConfigPath = path.join(legacyUserDataDir, 'db-config.json');

// Ensure config directory exists
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

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
        autoHideMenuBar: true,
        backgroundColor: '#0a0a0a',
        show: false
    });

    mainWindow.loadFile('app/index.html');

    // Hide menu bar (Windows/Linux). Keep macOS default menu.
    try {
        if (process.platform !== 'darwin') {
            Menu.setApplicationMenu(null);
            mainWindow.setMenuBarVisibility(false);
        }
    } catch (e) {
        console.warn('Menu hide failed:', e.message);
    }

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
        // Allow close if installing update
        if (isInstallingUpdate) {
            return;
        }
        
        event.preventDefault();
        
        // Send event to renderer to show custom modal
        mainWindow.webContents.send('show-exit-confirmation');
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
                const data = fs.readFileSync(legacyConfigPath, 'utf8');
                // Ensure new config directory exists
                if (!fs.existsSync(configDir)) {
                    fs.mkdirSync(configDir, { recursive: true });
                }
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
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
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
        // Check if using Windows Authentication
        const useWindowsAuth = credential.useWindowsAuth === true;

        // Create temporary RDP file
        const tempDir = os.tmpdir();
        const fileName = `orbis_${server.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.rdp`;
        const filePath = path.join(tempDir, fileName);

        // Write RDP content to temp file
        fs.writeFileSync(filePath, rdpContent, 'utf8');

        // If using Windows Authentication, skip credential manager and launch directly
        if (useWindowsAuth) {
            console.log('✓ Using Windows Authentication for RDP connection');
            
            // Launch mstsc with the RDP file
            const mstscCommand = `mstsc "${filePath}"`;
            
            exec(mstscCommand, (mstscError) => {
                if (mstscError) {
                    console.error('MSTSC launch error:', mstscError);
                }

                // Clean up temp RDP file after delay
                setTimeout(() => {
                    try {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    } catch (cleanupError) {
                        console.error('RDP file cleanup error:', cleanupError);
                    }
                }, 8000);
            });

            return { success: true };
        }

        // For stored credentials, decrypt the password if encrypted
        let password = credential.password;
        if (password && password.includes(':')) {
            try {
                password = decryptMessage(password);
            } catch (decryptError) {
                console.error('Failed to decrypt credential password:', decryptError);
                return { success: false, error: 'Failed to decrypt credential password' };
            }
        }

        // Validate that we have a password
        if (!password) {
            return { success: false, error: 'No password found in credential' };
        }

        // Build target name for Windows Credential Manager
        // Format: TERMSRV/hostname or TERMSRV/ipaddress
        const targetName = `TERMSRV/${server.ipAddress}`;
        
        // Build username with domain if provided
        const fullUsername = credential.domain 
            ? `${credential.domain}\\${credential.username}`
            : credential.username;

        // Store credentials in Windows Credential Manager using cmdkey
        // This ensures RDP uses the exact credentials we provide, not cached ones
        const cmdkeyAdd = `cmdkey /generic:"${targetName}" /user:"${fullUsername}" /pass:"${password}"`;
        
        return await new Promise((resolve) => {
            // Add credentials to Windows Credential Manager
            exec(cmdkeyAdd, (error, stdout, stderr) => {
                if (error) {
                    console.error('cmdkey add error:', error);
                    console.error('stderr:', stderr);
                    resolve({ success: false, error: `Failed to store credentials: ${error.message}` });
                    return;
                }

                console.log('✓ Credentials stored in Windows Credential Manager for', targetName);

                // Launch mstsc with the RDP file
                const mstscCommand = `mstsc "${filePath}"`;
                
                exec(mstscCommand, (mstscError) => {
                    if (mstscError) {
                        console.error('MSTSC launch error:', mstscError);
                    }

                    // Clean up: Remove credentials from Credential Manager after a delay
                    // Delay allows RDP to read the credentials before we remove them
                    setTimeout(() => {
                        const cmdkeyDelete = `cmdkey /delete:"${targetName}"`;
                        exec(cmdkeyDelete, (delError) => {
                            if (delError) {
                                console.error('cmdkey delete error (non-critical):', delError.message);
                            } else {
                                console.log('✓ Credentials removed from Windows Credential Manager');
                            }
                        });

                        // Also clean up temp RDP file
                        try {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        } catch (cleanupError) {
                            console.error('RDP file cleanup error:', cleanupError);
                        }
                    }, 8000); // 8 second delay to ensure RDP has time to use credentials
                });

                resolve({ success: true });
            });
        });
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

// Get remote server uptime (best-effort)
ipcMain.handle('get-server-uptime', async (event, { host, osType = 'Windows', username, password, port = 22 }) => {
    try {
        if (!host) return { success: false, error: 'Host required' };
        const isWindows = /win/i.test(osType) || process.platform === 'win32';

        function psEscape(str) {
            return String(str || '').replace(/`/g, '``').replace(/"/g, '\"');
        }

        if (isWindows) {
            const user = psEscape(username || '');
            const pass = psEscape(password || '');
            const hasCreds = !!(user && pass);

            // 1) Try CIM (WSMan)
            const cimCredBlock = hasCreds ? `
                $sec = ConvertTo-SecureString \"${pass}\" -AsPlainText -Force; 
                $cred = New-Object System.Management.Automation.PSCredential(\"${user}\", $sec);
                $params = @{ ComputerName='${host}'; Credential=$cred }
            ` : `$params = @{ ComputerName='${host}' }`;
            const cimPs = `
                try {
                    ${cimCredBlock}
                    $os = Get-CimInstance Win32_OperatingSystem @params -ErrorAction Stop;
                    $boot = $os.LastBootUpTime;
                    $ts = New-TimeSpan -Start $boot -End (Get-Date);
                    [math]::Floor($ts.TotalSeconds)
                } catch { -1 }
            `;
            const cimCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command \"${cimPs.replace(/\n/g,' ').replace(/\s+/g,' ').trim()}\"`;
            const cimRes = await new Promise((resolve) => {
                exec(cimCmd, { timeout: 6000 }, (err, stdout, stderr) => {
                    const out = (stdout || '').toString().trim();
                    const seconds = parseInt(out, 10);
                    if (!isNaN(seconds) && seconds >= 0) return resolve({ ok: true, seconds });
                    resolve({ ok: false, err: err?.message || stderr || 'CIM failed', out });
                });
            });
            if (cimRes.ok) return { success: true, seconds: cimRes.seconds };

            // 2) Try WMI (DCOM) via Get-WmiObject
            const wmiCredBlock = hasCreds ? `
                $sec = ConvertTo-SecureString \"${pass}\" -AsPlainText -Force; 
                $cred = New-Object System.Management.Automation.PSCredential(\"${user}\", $sec);
                $os = Get-WmiObject -Class Win32_OperatingSystem -ComputerName \"${host}\" -Credential $cred -ErrorAction Stop
            ` : `$os = Get-WmiObject -Class Win32_OperatingSystem -ComputerName \"${host}\" -ErrorAction Stop`;
            const wmiPs = `
                try {
                    ${wmiCredBlock}
                    $boot = [Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime);
                    $ts = New-TimeSpan -Start $boot -End (Get-Date);
                    [math]::Floor($ts.TotalSeconds)
                } catch { -1 }
            `;
            const wmiCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command \"${wmiPs.replace(/\n/g,' ').replace(/\s+/g,' ').trim()}\"`;
            const wmiRes = await new Promise((resolve) => {
                exec(wmiCmd, { timeout: 6000 }, (err, stdout, stderr) => {
                    const out = (stdout || '').toString().trim();
                    const seconds = parseInt(out, 10);
                    if (!isNaN(seconds) && seconds >= 0) return resolve({ ok: true, seconds });
                    resolve({ ok: false, err: err?.message || stderr || 'WMI failed', out });
                });
            });
            if (wmiRes.ok) return { success: true, seconds: wmiRes.seconds };

            // 3) Try legacy WMIC CLI (DCOM)
            const wmicUser = hasCreds ? `/user:"${username}"` : '';
            const wmicPass = hasCreds ? `/password:"${password}"` : '';
            const wmicCmd = `wmic /node:"${host}" ${wmicUser} ${wmicPass} path win32_operatingsystem get lastbootuptime /value`;
            const wmicRes = await new Promise((resolve) => {
                exec(wmicCmd, { timeout: 6000 }, (err, stdout, stderr) => {
                    const out = (stdout || '').toString();
                    const match = /LastBootUpTime\s*=\s*([0-9]{14})/i.exec(out);
                    if (match) {
                        const s = match[1];
                        const yyyy = parseInt(s.slice(0,4));
                        const MM = parseInt(s.slice(4,6)) - 1;
                        const dd = parseInt(s.slice(6,8));
                        const HH = parseInt(s.slice(8,10));
                        const mm = parseInt(s.slice(10,12));
                        const ss = parseInt(s.slice(12,14));
                        const boot = new Date(Date.UTC(yyyy, MM, dd, HH, mm, ss));
                        const seconds = Math.floor((Date.now() - boot.getTime()) / 1000);
                        return resolve({ ok: true, seconds });
                    }
                    resolve({ ok: false, err: err?.message || stderr || 'WMIC parse failed', out });
                });
            });
            if (wmicRes.ok) return { success: true, seconds: wmicRes.seconds };

            return { success: false, error: `Windows uptime failed: ${wmiRes.err || cimRes.err || 'unknown error'}` };
        }

        // Linux via plink (PuTTY) if available
        const puttyPaths = [
            'C\\\\Program Files\\\\PuTTY\\\\plink.exe',
            'C\\\\Program Files (x86)\\\\PuTTY\\\\plink.exe'
        ];
        let plink = null;
        for (const p of puttyPaths) { try { if (fs.existsSync(p.replace(/\\\\/g,'\\'))) { plink = p.replace(/\\\\/g,'\\'); break; } } catch {}
        }
        if (plink && username && password) {
            const userAt = `${username}@${host}`;
            const cmd = `\"${plink}\" -ssh -P ${port} -batch -pw \"${password}\" ${userAt} cat /proc/uptime`;
            return await new Promise((resolve) => {
                exec(cmd, { timeout: 6000 }, (err, stdout) => {
                    const out = (stdout || '').toString().trim();
                    const match = /^([0-9]+\.?[0-9]*)/.exec(out);
                    if (match) {
                        const seconds = Math.floor(parseFloat(match[1]));
                        return resolve({ success: true, seconds });
                    }
                    resolve({ success: false, error: 'Uptime parse failed', stdout: out, code: err?.code || 0 });
                });
            });
        }

        return { success: false, error: 'Unsupported host or missing tools/credentials' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Remote PowerShell execution removed

// SSH/PuTTY connection
ipcMain.handle('ssh-connect', async (event, { server, credential }) => {
    try {
        // Decrypt the credential password if encrypted
        let password = credential.password;
        if (password && password.includes(':')) {
            try {
                password = decryptMessage(password);
            } catch (decryptError) {
                console.error('Failed to decrypt credential password:', decryptError);
                return { success: false, error: 'Failed to decrypt credential password' };
            }
        }

        const host = server.ipAddress || server.hostname;
        const port = server.port || 22;
        const user = credential.username;

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

ipcMain.handle('db-clear-config', async () => {
    try {
        // Close existing database pool
        if (dbPool) {
            try {
                await dbPool.close();
            } catch (e) {
                console.warn('Error closing pool:', e.message);
            }
            dbPool = null;
        }
        poolConnectPromise = null;
        
        // Delete config file
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
        
        // Also clean legacy config if exists
        if (fs.existsSync(legacyConfigPath)) {
            fs.unlinkSync(legacyConfigPath);
        }
        
        dbConfig = null;
        console.log('✅ Configuration cache cleared');
        return { success: true };
    } catch (error) {
        console.error('Error clearing config:', error);
        return { success: false, error: error.message };
    }
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
        // Provide helpful error messages for common Docker SQL Server issues
        let errorMessage = error.message;
        
        if (error.message.includes('Login failed')) {
            errorMessage = `Login failed. ${config.authType === 'windows' ? 'Docker SQL Server requires SQL Server Authentication. Switch to SQL Auth and use username "sa".' : 'Check your username and password.'}`;
        } else if (error.message.includes('self signed certificate') || error.message.includes('certificate')) {
            errorMessage = 'Certificate error. Enable "Trust Server Certificate" option.';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('Failed to connect')) {
            errorMessage = `Cannot reach SQL Server. Check: 1) Container is running, 2) Port is correct (use "localhost,1433" for Docker), 3) Firewall allows connection.`;
        }
        
        return { 
            success: false, 
            error: errorMessage 
        };
    }
});

// HTTP Request Handler for Core Service API
ipcMain.handle('http-request', async (event, url, options = {}) => {
    try {
        const https = require('https');
        const http = require('http');
        
        // Replace localhost with 127.0.0.1 to avoid IPv6 issues
        const fixedUrl = url.replace('localhost', '127.0.0.1');
        const urlObj = new URL(fixedUrl);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        console.log(`🌐 HTTP Request: ${options.method || 'GET'} ${fixedUrl}`);
        
        return new Promise((resolve, reject) => {
            const reqOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers || {},
                family: 4,  // Force IPv4
                timeout: 10000 // 10 second timeout
            };
            
            const req = client.request(reqOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    console.log(`✅ HTTP Response: ${res.statusCode} from ${fixedUrl}`);
                    try {
                        const result = {
                            ok: res.statusCode >= 200 && res.statusCode < 300,
                            status: res.statusCode,
                            statusText: res.statusMessage,
                            data: data ? JSON.parse(data) : null
                        };
                        resolve(result);
                    } catch (error) {
                        resolve({
                            ok: res.statusCode >= 200 && res.statusCode < 300,
                            status: res.statusCode,
                            statusText: res.statusMessage,
                            data: data
                        });
                    }
                });
            });
            
            req.on('timeout', () => {
                console.error(`⏱️ HTTP request timeout: ${fixedUrl}`);
                req.destroy();
                resolve({ 
                    ok: false, 
                    status: 0, 
                    statusText: 'Timeout',
                    error: 'Request timeout',
                    data: { 
                        error: `Request to ${urlObj.hostname}:${urlObj.port} timed out after 10 seconds. Check if CoreService is running and accessible.` 
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error('❌ HTTP request error:', {
                    url: fixedUrl,
                    error: error.message,
                    code: error.code,
                    errno: error.errno,
                    syscall: error.syscall
                });
                resolve({ 
                    ok: false, 
                    status: 0, 
                    statusText: 'Connection Failed',
                    error: error.message,
                    data: { 
                        error: `Cannot connect to ${urlObj.hostname}:${urlObj.port} - ${error.message}. Is the CoreService running?` 
                    }
                });
            });
            
            if (options.body) {
                req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }
            
            req.end();
        });
    } catch (error) {
        console.error('HTTP request setup error:', error);
        return { ok: false, status: 0, error: error.message };
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

// Execute query with provided config (for setup wizard before config is saved)
ipcMain.handle('db-execute-with-config', async (event, config, query, params = []) => {
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
        const request = pool.request();
        
        // Add parameters
        params.forEach((param, index) => {
            let value = param.value;
            if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
                value = Buffer.from(value);
            }
            request.input(`param${index}`, value);
        });
        
        const result = await request.query(query);
        await pool.close();
        
        return { 
            success: true, 
            rowsAffected: result.rowsAffected[0],
            data: result.recordset 
        };
    } catch (error) {
        console.error('Database execute with config error:', error);
        return { success: false, error: error.message };
    }
});

// Get database size
ipcMain.handle('db-get-size', async (event) => {
    try {
        if (!dbPool) {
            return { success: false, error: 'Database not connected' };
        }
        
        const query = `
            SELECT 
                SUM(CAST(FILEPROPERTY(name, 'SpaceUsed') AS bigint) * 8.0 / 1024.0) AS SizeInMB
            FROM sys.database_files
        `;
        
        const request = dbPool.request();
        const result = await request.query(query);
        
        if (result.recordset && result.recordset.length > 0) {
            return { 
                success: true, 
                sizeInMB: result.recordset[0].SizeInMB || 0 
            };
        }
        
        return { success: true, sizeInMB: 0 };
    } catch (error) {
        console.error('Database size query error:', error);
        return { success: false, error: error.message };
    }
});

// Hash password
ipcMain.handle('hash-password', async (event, password) => {
    try {
        return { success: true, hash: hashPassword(password) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Verify password
ipcMain.handle('verify-password', async (event, password, hashedPassword) => {
    try {
        return { success: true, valid: verifyPassword(password, hashedPassword) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Encrypt message
ipcMain.handle('encrypt-message', async (event, message) => {
    try {
        return { success: true, encrypted: encryptMessage(message) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Decrypt message
ipcMain.handle('decrypt-message', async (event, encryptedMessage) => {
    try {
        return { success: true, decrypted: decryptMessage(encryptedMessage) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ========== EMAIL SERVER PROFILE HANDLERS ==========
// Test email profile connection
ipcMain.handle('test-email-profile', async (event, profileId, testEmail) => {
    try {
        const nodemailer = require('nodemailer');
        
        // Get profile from database
        const pool = await getDbPool();
        if (!pool) {
            throw new Error('Database connection not available');
        }

        const result = await pool.request()
            .input('profileId', sql.NVarChar, profileId)
            .query('SELECT * FROM EmailServerProfiles WHERE id = @profileId');

        if (!result.recordset || result.recordset.length === 0) {
            throw new Error('Email profile not found');
        }

        const profile = result.recordset[0];

        // Decrypt password if encrypted
        let smtpPassword = profile.password_encrypted;
        if (smtpPassword) {
            try {
                smtpPassword = decryptMessage(smtpPassword);
            } catch (decryptError) {
                console.error('Failed to decrypt SMTP password:', decryptError);
                throw new Error('Failed to decrypt SMTP password');
            }
        }

        // Configure transporter
        const transportConfig = {
            host: profile.smtpHost,
            port: profile.smtpPort,
            secure: profile.useSSL, // true for 465, false for other ports
            auth: profile.authRequired ? {
                user: profile.username,
                pass: smtpPassword
            } : undefined,
            tls: {
                rejectUnauthorized: false // Allow self-signed certificates
            }
        };

        // Add TLS if specified
        if (profile.useTLS) {
            transportConfig.requireTLS = true;
        }

        const transporter = nodemailer.createTransport(transportConfig);

        // Verify connection
        await transporter.verify();

        // Send test email
        const mailOptions = {
            from: `"${profile.fromName}" <${profile.fromEmail}>`,
            to: testEmail,
            subject: 'OrbisHub Email Server Test',
            html: `
                <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2563eb;">✅ Test Email Successful</h2>
                        <p>This is a test email from your OrbisHub Email Server Profile: <strong>${profile.name}</strong></p>
                        <p><strong>Configuration Details:</strong></p>
                        <ul style="background: #f3f4f6; padding: 15px; border-radius: 6px;">
                            <li>SMTP Server: ${profile.smtpHost}:${profile.smtpPort}</li>
                            <li>Security: ${profile.useSSL ? 'SSL' : ''}${profile.useSSL && profile.useTLS ? ' + ' : ''}${profile.useTLS ? 'TLS' : ''}</li>
                            <li>Authentication: ${profile.authRequired ? 'Enabled' : 'Disabled'}</li>
                        </ul>
                        <p style="margin-top: 20px; color: #666; font-size: 14px;">
                            If you received this email, your SMTP configuration is working correctly!
                        </p>
                        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                        <p style="color: #999; font-size: 12px;">OrbisHub - IT Management System</p>
                    </div>
                </body>
                </html>
            `,
            text: `Test Email Successful\n\nThis is a test email from your OrbisHub Email Server Profile: ${profile.name}\n\nConfiguration:\nSMTP Server: ${profile.smtpHost}:${profile.smtpPort}\nSecurity: ${profile.useSSL ? 'SSL' : ''}${profile.useSSL && profile.useTLS ? ' + ' : ''}${profile.useTLS ? 'TLS' : ''}\nAuthentication: ${profile.authRequired ? 'Enabled' : 'Disabled'}\n\nIf you received this email, your SMTP configuration is working correctly!\n\n---\nOrbisHub - IT Management System`
        };

        const info = await transporter.sendMail(mailOptions);
        
        return {
            success: true,
            message: `Test email sent successfully to ${testEmail}`,
            messageId: info.messageId
        };
    } catch (error) {
        console.error('Email test failed:', error);
        return {
            success: false,
            message: error.message || 'Failed to send test email',
            error: error.toString()
        };
    }
});

// Send email from queue
ipcMain.handle('send-email-from-queue', async (event, emailQueueId) => {
    try {
        const nodemailer = require('nodemailer');
        
        const pool = await getDbPool();
        if (!pool) {
            throw new Error('Database connection not available');
        }

        // Get email from queue
        const emailResult = await pool.request()
            .input('emailId', sql.Int, emailQueueId)
            .query('SELECT * FROM EmailQueue WHERE id = @emailId');

        if (!emailResult.recordset || emailResult.recordset.length === 0) {
            throw new Error('Email not found in queue');
        }

        const email = emailResult.recordset[0];

        // Update status to sending
        await pool.request()
            .input('emailId', sql.Int, emailQueueId)
            .query('UPDATE EmailQueue SET status = \'sending\', lastAttemptDate = GETDATE() WHERE id = @emailId');

        // Get email server profile
        let profileId = email.emailServerProfileId;
        
        // If no specific profile, get default
        if (!profileId) {
            const defaultProfileResult = await pool.request()
                .query('SELECT TOP 1 id FROM EmailServerProfiles WHERE isActive = 1 AND isDefault = 1');
            
            if (defaultProfileResult.recordset && defaultProfileResult.recordset.length > 0) {
                profileId = defaultProfileResult.recordset[0].id;
            } else {
                throw new Error('No email server profile available');
            }
        }

        // Get profile
        const profileResult = await pool.request()
            .input('profileId', sql.NVarChar, profileId)
            .query('SELECT * FROM EmailServerProfiles WHERE id = @profileId');

        if (!profileResult.recordset || profileResult.recordset.length === 0) {
            throw new Error('Email server profile not found');
        }

        const profile = profileResult.recordset[0];

        // Decrypt password
        let smtpPassword = profile.password_encrypted;
        if (smtpPassword) {
            smtpPassword = decryptMessage(smtpPassword);
        }

        // Configure transporter
        const transportConfig = {
            host: profile.smtpHost,
            port: profile.smtpPort,
            secure: profile.useSSL,
            auth: profile.authRequired ? {
                user: profile.username,
                pass: smtpPassword
            } : undefined,
            tls: {
                rejectUnauthorized: false
            }
        };

        if (profile.useTLS) {
            transportConfig.requireTLS = true;
        }

        const transporter = nodemailer.createTransport(transportConfig);

        // Prepare mail options
        const mailOptions = {
            from: `"${profile.fromName}" <${profile.fromEmail}>`,
            to: email.toName ? `"${email.toName}" <${email.toEmail}>` : email.toEmail,
            subject: email.subject,
            html: email.bodyHtml,
            text: email.bodyText
        };

        if (profile.replyToEmail) {
            mailOptions.replyTo = profile.replyToEmail;
        }

        // Parse CC and BCC if available
        if (email.ccEmails) {
            try {
                mailOptions.cc = JSON.parse(email.ccEmails);
            } catch (e) {}
        }
        if (email.bccEmails) {
            try {
                mailOptions.bcc = JSON.parse(email.bccEmails);
            } catch (e) {}
        }

        // Send email
        const info = await transporter.sendMail(mailOptions);

        // Update queue status to sent
        await pool.request()
            .input('emailId', sql.Int, emailQueueId)
            .query('UPDATE EmailQueue SET status = \'sent\', sentAt = GETDATE() WHERE id = @emailId');

        // Add to sent history
        await pool.request()
            .input('emailQueueId', sql.Int, emailQueueId)
            .input('profileId', sql.NVarChar, profileId)
            .input('toEmail', sql.NVarChar, email.toEmail)
            .input('subject', sql.NVarChar, email.subject)
            .input('emailType', sql.NVarChar, email.emailType)
            .input('sentBy', sql.NVarChar, email.createdBy)
            .input('bodyPreview', sql.NVarChar, email.bodyText ? email.bodyText.substring(0, 1000) : null)
            .input('relatedEntityType', sql.NVarChar, email.relatedEntityType)
            .input('relatedEntityId', sql.NVarChar, email.relatedEntityId)
            .query(`
                INSERT INTO EmailSentHistory (emailQueueId, emailServerProfileId, toEmail, subject, emailType, sentBy, bodyPreview, relatedEntityType, relatedEntityId)
                VALUES (@emailQueueId, @profileId, @toEmail, @subject, @emailType, @sentBy, @bodyPreview, @relatedEntityType, @relatedEntityId)
            `);

        return {
            success: true,
            message: 'Email sent successfully',
            messageId: info.messageId
        };
    } catch (error) {
        console.error('Failed to send email from queue:', error);
        
        // Update queue with error
        try {
            const pool = await getDbPool();
            const newAttempts = (email.attempts || 0) + 1;
            const maxAttempts = email.maxAttempts || 3;
            const newStatus = newAttempts >= maxAttempts ? 'failed' : 'pending';
            
            // Calculate next retry time
            const retryMinutes = 5;
            const nextRetryDate = newStatus === 'pending' ? new Date(Date.now() + retryMinutes * 60000) : null;

            await pool.request()
                .input('emailId', sql.Int, emailQueueId)
                .input('attempts', sql.Int, newAttempts)
                .input('errorMessage', sql.NVarChar, error.message)
                .input('status', sql.NVarChar, newStatus)
                .input('nextRetryDate', sql.DateTime2, nextRetryDate)
                .query(`
                    UPDATE EmailQueue 
                    SET attempts = @attempts, 
                        errorMessage = @errorMessage, 
                        status = @status,
                        nextRetryDate = @nextRetryDate,
                        lastAttemptDate = GETDATE()
                    WHERE id = @emailId
                `);
        } catch (updateError) {
            console.error('Failed to update email queue error:', updateError);
        }

        return {
            success: false,
            message: error.message || 'Failed to send email',
            error: error.toString()
        };
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
                failedLoginAttempts INT DEFAULT 0,
                lockedUntil BIGINT DEFAULT NULL,
                lastFailedLogin BIGINT DEFAULT NULL,
                created_at DATETIME DEFAULT GETDATE()
            )
            
            -- Add lockout columns if they don't exist (for existing tables)
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'failedLoginAttempts')
            BEGIN
                ALTER TABLE Users ADD failedLoginAttempts INT DEFAULT 0
            END
            
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'lockedUntil')
            BEGIN
                ALTER TABLE Users ADD lockedUntil BIGINT DEFAULT NULL
            END
            
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'lastFailedLogin')
            BEGIN
                ALTER TABLE Users ADD lastFailedLogin BIGINT DEFAULT NULL
            END
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
                preferred_machine_id NVARCHAR(50),
                created_at DATETIME DEFAULT GETDATE()
            )
        `);
        migrations.push('Credentials table created');
        
        // Add preferred_machine_id column if it doesn't exist (migration for existing databases)
        await pool.request().query(`
            IF EXISTS (SELECT * FROM sysobjects WHERE name='Credentials' AND xtype='U')
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Credentials') AND name = 'preferred_machine_id')
                BEGIN
                    ALTER TABLE Credentials ADD preferred_machine_id NVARCHAR(50) NULL
                END
            END
        `);
        migrations.push('Credentials table updated with preferred_machine_id column');
        
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
        
        // No Scripts or Builds tables created

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
        
        // Settings table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Settings' AND xtype='U')
            CREATE TABLE Settings (
                id INT IDENTITY(1,1) PRIMARY KEY,
                settingsJson NVARCHAR(MAX) NOT NULL,
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE()
            )
        `);
        migrations.push('Settings table created');
        
        // Agents table (for OrbisAgent PowerShell agents)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Agents]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[Agents] (
                    [AgentId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                    [MachineName] NVARCHAR(255) NOT NULL,
                    [IPAddress] NVARCHAR(500) NULL,
                    [OSVersion] NVARCHAR(255) NULL,
                    [AgentVersion] NVARCHAR(50) NULL,
                    [LoggedInUser] NVARCHAR(100) NULL,
                    [Status] NVARCHAR(50) NULL,
                    [Metadata] NVARCHAR(MAX) NULL,
                    [LastSeenUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
                    [CreatedUtc] DATETIME NOT NULL DEFAULT GETUTCDATE()
                );

                CREATE INDEX IX_Agents_MachineName ON [dbo].[Agents]([MachineName]);
                CREATE INDEX IX_Agents_LastSeenUtc ON [dbo].[Agents]([LastSeenUtc]);
            END
        `);
        migrations.push('Agents table created');
        
        // Add Status column to Agents table if it doesn't exist (migration for existing databases)
        await pool.request().query(`
            IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Agents]') AND type in (N'U'))
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Agents]') AND name = 'Status')
                BEGIN
                    ALTER TABLE [dbo].[Agents] ADD [Status] NVARCHAR(50) NULL
                END
            END
        `);
        migrations.push('Agents table updated with Status column');
        
        // AgentJobs table (for OrbisAgent job queue)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AgentJobs]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[AgentJobs] (
                    [JobId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                    [AgentId] UNIQUEIDENTIFIER NOT NULL,
                    [Type] NVARCHAR(100) NOT NULL,
                    [PayloadJson] NVARCHAR(MAX) NULL,
                    [Status] NVARCHAR(50) NOT NULL DEFAULT 'Pending',
                    [CreatedUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
                    [StartedUtc] DATETIME NULL,
                    [CompletedUtc] DATETIME NULL,
                    [ResultJson] NVARCHAR(MAX) NULL,
                    [ErrorMessage] NVARCHAR(MAX) NULL,
                    CONSTRAINT FK_AgentJobs_Agents FOREIGN KEY ([AgentId]) 
                        REFERENCES [dbo].[Agents]([AgentId]) ON DELETE CASCADE
                );

                CREATE INDEX IX_AgentJobs_AgentId ON [dbo].[AgentJobs]([AgentId]);
                CREATE INDEX IX_AgentJobs_Status ON [dbo].[AgentJobs]([Status]);
                CREATE INDEX IX_AgentJobs_CreatedUtc ON [dbo].[AgentJobs]([CreatedUtc]);
                CREATE INDEX IX_AgentJobs_AgentId_Status_CreatedUtc ON [dbo].[AgentJobs]([AgentId], [Status], [CreatedUtc]);
            END
        `);
        migrations.push('AgentJobs table created');
        
        // No pipeline tables created
        
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
        
        // ============ TICKET MANAGEMENT SYSTEM ============
        
        // Ticket Priorities Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketPriorities')
            BEGIN
                CREATE TABLE TicketPriorities (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    name NVARCHAR(50) NOT NULL UNIQUE,
                    color NVARCHAR(7) NOT NULL,
                    level INT NOT NULL,
                    created_at DATETIME DEFAULT GETDATE()
                )
                
                INSERT INTO TicketPriorities (name, color, level) VALUES
                ('Critical', '#dc2626', 5),
                ('High', '#ea580c', 4),
                ('Medium', '#f59e0b', 3),
                ('Low', '#3b82f6', 2),
                ('Trivial', '#6b7280', 1)
            END
        `);
        migrations.push('TicketPriorities table created');
        
        // Ticket Statuses Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketStatuses')
            BEGIN
                CREATE TABLE TicketStatuses (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    name NVARCHAR(50) NOT NULL UNIQUE,
                    color NVARCHAR(7) NOT NULL,
                    category NVARCHAR(20) NOT NULL,
                    display_order INT NOT NULL,
                    created_at DATETIME DEFAULT GETDATE()
                )
                
                INSERT INTO TicketStatuses (name, color, category, display_order) VALUES
                ('Open', '#3b82f6', 'open', 1),
                ('In Progress', '#f59e0b', 'in_progress', 2),
                ('Blocked', '#dc2626', 'in_progress', 3),
                ('In Review', '#8b5cf6', 'in_progress', 4),
                ('Resolved', '#10b981', 'resolved', 5),
                ('Closed', '#6b7280', 'closed', 6),
                ('Reopened', '#f97316', 'open', 7)
            END
        `);
        migrations.push('TicketStatuses table created');
        
        // Ticket Types Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketTypes')
            BEGIN
                CREATE TABLE TicketTypes (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    name NVARCHAR(50) NOT NULL UNIQUE,
                    icon NVARCHAR(50) NOT NULL,
                    color NVARCHAR(7) NOT NULL,
                    created_at DATETIME DEFAULT GETDATE()
                )
                
                INSERT INTO TicketTypes (name, icon, color) VALUES
                ('Bug', 'bug', '#dc2626'),
                ('Feature', 'star', '#8b5cf6'),
                ('Task', 'checklist', '#3b82f6'),
                ('Improvement', 'trending-up', '#10b981'),
                ('Question', 'help-circle', '#f59e0b'),
                ('Epic', 'layers', '#ec4899')
            END
        `);
        migrations.push('TicketTypes table created');
        
        // Ticket Labels Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketLabels')
            BEGIN
                CREATE TABLE TicketLabels (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    name NVARCHAR(50) NOT NULL UNIQUE,
                    color NVARCHAR(7) NOT NULL,
                    created_at DATETIME DEFAULT GETDATE()
                )
                
                INSERT INTO TicketLabels (name, color) VALUES
                ('urgent', '#dc2626'),
                ('security', '#ea580c'),
                ('performance', '#f59e0b'),
                ('ui-ux', '#8b5cf6'),
                ('backend', '#3b82f6'),
                ('database', '#10b981'),
                ('documentation', '#6b7280')
            END
        `);
        migrations.push('TicketLabels table created');
        
        // Ticket Projects Table - Need to handle Users FK properly
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketProjects')
            BEGIN
                CREATE TABLE TicketProjects (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    name NVARCHAR(100) NOT NULL,
                    [key] NVARCHAR(10) NOT NULL UNIQUE,
                    description NVARCHAR(MAX),
                    color NVARCHAR(7) NOT NULL DEFAULT '#3b82f6',
                    is_active BIT DEFAULT 1,
                    created_by NVARCHAR(50) NOT NULL,
                    created_at DATETIME DEFAULT GETDATE(),
                    updated_at DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_TicketProjects_CreatedBy FOREIGN KEY (created_by) REFERENCES Users(id)
                )
            END
            
            -- Insert default project if it doesn't exist
            IF NOT EXISTS (SELECT 1 FROM TicketProjects WHERE [key] = 'ORB')
            BEGIN
                DECLARE @defaultUser NVARCHAR(50)
                SELECT TOP 1 @defaultUser = id FROM Users WHERE role = 'admin' ORDER BY created_at
                
                IF @defaultUser IS NOT NULL
                BEGIN
                    INSERT INTO TicketProjects (name, [key], description, color, created_by) 
                    VALUES ('OrbisHub', 'ORB', 'Default OrbisHub project for system administration tasks', '#8aa2ff', @defaultUser)
                END
            END
        `);
        migrations.push('TicketProjects table created');
        
        // Main Tickets Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tickets')
            BEGIN
                CREATE TABLE Tickets (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    ticket_number NVARCHAR(20) NOT NULL,
                    project_id INT NOT NULL,
                    type_id INT NOT NULL,
                    title NVARCHAR(200) NOT NULL,
                    description NVARCHAR(MAX),
                    status_id INT NOT NULL,
                    priority_id INT NOT NULL,
                    assignee_id NVARCHAR(50),
                    reporter_id NVARCHAR(50) NOT NULL,
                    environment_id NVARCHAR(50),
                    server_id NVARCHAR(50),
                    story_points INT,
                    estimated_hours DECIMAL(10,2),
                    actual_hours DECIMAL(10,2),
                    due_date DATETIME,
                    parent_ticket_id INT,
                    created_at DATETIME DEFAULT GETDATE(),
                    updated_at DATETIME DEFAULT GETDATE(),
                    resolved_at DATETIME,
                    closed_at DATETIME,
                    CONSTRAINT FK_Tickets_Project FOREIGN KEY (project_id) REFERENCES TicketProjects(id),
                    CONSTRAINT FK_Tickets_Type FOREIGN KEY (type_id) REFERENCES TicketTypes(id),
                    CONSTRAINT FK_Tickets_Status FOREIGN KEY (status_id) REFERENCES TicketStatuses(id),
                    CONSTRAINT FK_Tickets_Priority FOREIGN KEY (priority_id) REFERENCES TicketPriorities(id),
                    CONSTRAINT FK_Tickets_Parent FOREIGN KEY (parent_ticket_id) REFERENCES Tickets(id)
                )
                
                CREATE INDEX IX_Tickets_Project ON Tickets(project_id)
                CREATE INDEX IX_Tickets_Status ON Tickets(status_id)
                CREATE INDEX IX_Tickets_Assignee ON Tickets(assignee_id)
                CREATE INDEX IX_Tickets_Reporter ON Tickets(reporter_id)
                CREATE INDEX IX_Tickets_DueDate ON Tickets(due_date)
                CREATE INDEX IX_Tickets_CreatedAt ON Tickets(created_at)
            END
        `);
        migrations.push('Tickets table created');
        
        // Ticket Comments Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketComments')
            BEGIN
                CREATE TABLE TicketComments (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    ticket_id INT NOT NULL,
                    user_id NVARCHAR(50) NOT NULL,
                    comment NVARCHAR(MAX) NOT NULL,
                    is_internal BIT DEFAULT 0,
                    created_at DATETIME DEFAULT GETDATE(),
                    updated_at DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_TicketComments_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE
                )
                
                CREATE INDEX IX_TicketComments_Ticket ON TicketComments(ticket_id)
                CREATE INDEX IX_TicketComments_CreatedAt ON TicketComments(created_at)
            END
        `);
        migrations.push('TicketComments table created');
        
        // Ticket Attachments Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketAttachments')
            BEGIN
                CREATE TABLE TicketAttachments (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    ticket_id INT NOT NULL,
                    filename NVARCHAR(255) NOT NULL,
                    filepath NVARCHAR(500) NOT NULL,
                    filesize BIGINT NOT NULL,
                    mimetype NVARCHAR(100),
                    uploaded_by NVARCHAR(50) NOT NULL,
                    uploaded_at DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_TicketAttachments_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE
                )
                
                CREATE INDEX IX_TicketAttachments_Ticket ON TicketAttachments(ticket_id)
            END
        `);
        migrations.push('TicketAttachments table created');
        
        // Ticket Watchers Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketWatchers')
            BEGIN
                CREATE TABLE TicketWatchers (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    ticket_id INT NOT NULL,
                    user_id NVARCHAR(50) NOT NULL,
                    created_at DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_TicketWatchers_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE,
                    CONSTRAINT UQ_TicketWatchers UNIQUE (ticket_id, user_id)
                )
                
                CREATE INDEX IX_TicketWatchers_Ticket ON TicketWatchers(ticket_id)
                CREATE INDEX IX_TicketWatchers_User ON TicketWatchers(user_id)
            END
        `);
        migrations.push('TicketWatchers table created');
        
        // Ticket Activity Log Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketActivityLog')
            BEGIN
                CREATE TABLE TicketActivityLog (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    ticket_id INT NOT NULL,
                    user_id NVARCHAR(50) NOT NULL,
                    action NVARCHAR(50) NOT NULL,
                    field_name NVARCHAR(100),
                    old_value NVARCHAR(MAX),
                    new_value NVARCHAR(MAX),
                    created_at DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_TicketActivityLog_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE
                )
                
                CREATE INDEX IX_TicketActivityLog_Ticket ON TicketActivityLog(ticket_id)
                CREATE INDEX IX_TicketActivityLog_CreatedAt ON TicketActivityLog(created_at)
            END
        `);
        migrations.push('TicketActivityLog table created');
        
        // Ticket-Label Mapping Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketLabelMap')
            BEGIN
                CREATE TABLE TicketLabelMap (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    ticket_id INT NOT NULL,
                    label_id INT NOT NULL,
                    created_at DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_TicketLabelMap_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE,
                    CONSTRAINT FK_TicketLabelMap_Label FOREIGN KEY (label_id) REFERENCES TicketLabels(id),
                    CONSTRAINT UQ_TicketLabelMap UNIQUE (ticket_id, label_id)
                )
            END
        `);
        migrations.push('TicketLabelMap table created');
        
        // ============ PASSWORD MANAGER SYSTEM ============
        
        // Password Categories Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PasswordCategories')
            BEGIN
                CREATE TABLE PasswordCategories (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    name NVARCHAR(100) NOT NULL UNIQUE,
                    color NVARCHAR(7) NOT NULL,
                    icon NVARCHAR(50) NULL,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    CONSTRAINT CK_PasswordCategory_Color CHECK (color LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
                )
                
                INSERT INTO PasswordCategories (name, color, icon) VALUES
                (N'Personal', '#3b82f6', N'👤'),
                (N'Work', '#8b5cf6', N'💼'),
                (N'Financial', '#10b981', N'💳'),
                (N'Social Media', '#f59e0b', N'📱'),
                (N'Email', '#06b6d4', N'📧'),
                (N'Development', '#ec4899', N'💻'),
                (N'Database', '#ef4444', N'🗄️'),
                (N'Server', '#f97316', N'🖥️'),
                (N'Other', '#6b7280', N'📝')
            END
        `);
        migrations.push('PasswordCategories table created');
        
        // Password Entries Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PasswordEntries')
            BEGIN
                CREATE TABLE PasswordEntries (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    name NVARCHAR(255) NOT NULL,
                    username NVARCHAR(255) NOT NULL,
                    password_encrypted NVARCHAR(MAX) NOT NULL,
                    url NVARCHAR(500) NULL,
                    notes NVARCHAR(MAX) NULL,
                    category NVARCHAR(100) NULL,
                    tags NVARCHAR(500) NULL,
                    created_by NVARCHAR(50) NOT NULL,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    updated_at DATETIME2 DEFAULT GETDATE(),
                    last_accessed DATETIME2 NULL,
                    is_favorite BIT DEFAULT 0,
                    CONSTRAINT FK_PasswordEntry_User FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE NO ACTION
                )
                
                CREATE INDEX IX_PasswordEntries_Name ON PasswordEntries(name)
                CREATE INDEX IX_PasswordEntries_Category ON PasswordEntries(category)
                CREATE INDEX IX_PasswordEntries_CreatedBy ON PasswordEntries(created_by)
            END
        `);
        migrations.push('PasswordEntries table created');
        
        // Password Access Log Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PasswordAccessLog')
            BEGIN
                CREATE TABLE PasswordAccessLog (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    password_entry_id INT NOT NULL,
                    user_id NVARCHAR(50) NOT NULL,
                    action NVARCHAR(50) NOT NULL,
                    accessed_at DATETIME2 DEFAULT GETDATE(),
                    CONSTRAINT FK_PasswordAccessLog_Entry FOREIGN KEY (password_entry_id) REFERENCES PasswordEntries(id) ON DELETE CASCADE,
                    CONSTRAINT FK_PasswordAccessLog_User FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE NO ACTION,
                    CONSTRAINT CK_PasswordAccessLog_Action CHECK (action IN ('view', 'copy', 'edit', 'delete', 'create'))
                )
                
                CREATE INDEX IX_PasswordAccessLog_Entry ON PasswordAccessLog(password_entry_id)
                CREATE INDEX IX_PasswordAccessLog_User ON PasswordAccessLog(user_id)
                CREATE INDEX IX_PasswordAccessLog_AccessedAt ON PasswordAccessLog(accessed_at)
            END
        `);
        migrations.push('PasswordAccessLog table created');
        
        // SystemSettings table (for desktop app configuration)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemSettings')
            BEGIN
                CREATE TABLE SystemSettings (
                    SettingKey NVARCHAR(100) PRIMARY KEY,
                    SettingValue NVARCHAR(MAX),
                    UpdatedAt DATETIME2 DEFAULT GETDATE()
                )
            END
        `);
        migrations.push('SystemSettings table created');
        
        // ============ EMAIL SERVER PROFILE SYSTEM ============
        
        // Email Server Profiles Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailServerProfiles')
            BEGIN
                CREATE TABLE EmailServerProfiles (
                    id NVARCHAR(50) PRIMARY KEY,
                    name NVARCHAR(255) NOT NULL,
                    description NVARCHAR(500) NULL,
                    smtpHost NVARCHAR(255) NOT NULL,
                    smtpPort INT NOT NULL DEFAULT 587,
                    useSSL BIT NOT NULL DEFAULT 1,
                    useTLS BIT NOT NULL DEFAULT 1,
                    authRequired BIT NOT NULL DEFAULT 1,
                    username NVARCHAR(255) NULL,
                    password_encrypted NVARCHAR(MAX) NULL,
                    fromEmail NVARCHAR(255) NOT NULL,
                    fromName NVARCHAR(255) NOT NULL,
                    replyToEmail NVARCHAR(255) NULL,
                    isActive BIT NOT NULL DEFAULT 1,
                    isDefault BIT NOT NULL DEFAULT 0,
                    maxRetriesOnFailure INT NOT NULL DEFAULT 3,
                    retryIntervalMinutes INT NOT NULL DEFAULT 5,
                    maxEmailsPerHour INT NULL,
                    maxEmailsPerDay INT NULL,
                    lastTestDate DATETIME2 NULL,
                    lastTestStatus NVARCHAR(50) NULL,
                    lastTestMessage NVARCHAR(MAX) NULL,
                    createdBy NVARCHAR(50) NOT NULL,
                    createdAt DATETIME2 DEFAULT GETDATE(),
                    updatedBy NVARCHAR(50) NULL,
                    updatedAt DATETIME2 NULL,
                    CONSTRAINT FK_EmailServerProfile_CreatedBy FOREIGN KEY (createdBy) REFERENCES Users(id) ON DELETE NO ACTION,
                    CONSTRAINT CK_EmailServerProfile_Port CHECK (smtpPort BETWEEN 1 AND 65535)
                )
                
                CREATE INDEX IX_EmailServerProfiles_IsActive ON EmailServerProfiles(isActive)
                CREATE INDEX IX_EmailServerProfiles_IsDefault ON EmailServerProfiles(isDefault)
                CREATE INDEX IX_EmailServerProfiles_CreatedAt ON EmailServerProfiles(createdAt)
            END
        `);
        migrations.push('EmailServerProfiles table created');
        
        // Email Queue Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailQueue')
            BEGIN
                CREATE TABLE EmailQueue (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    emailServerProfileId NVARCHAR(50) NULL,
                    toEmail NVARCHAR(255) NOT NULL,
                    toName NVARCHAR(255) NULL,
                    ccEmails NVARCHAR(MAX) NULL,
                    bccEmails NVARCHAR(MAX) NULL,
                    subject NVARCHAR(500) NOT NULL,
                    bodyHtml NVARCHAR(MAX) NULL,
                    bodyText NVARCHAR(MAX) NULL,
                    attachments NVARCHAR(MAX) NULL,
                    emailType NVARCHAR(50) NOT NULL,
                    relatedEntityType NVARCHAR(50) NULL,
                    relatedEntityId NVARCHAR(50) NULL,
                    status NVARCHAR(50) NOT NULL DEFAULT 'pending',
                    priority INT NOT NULL DEFAULT 5,
                    attempts INT NOT NULL DEFAULT 0,
                    maxAttempts INT NOT NULL DEFAULT 3,
                    lastAttemptDate DATETIME2 NULL,
                    nextRetryDate DATETIME2 NULL,
                    errorMessage NVARCHAR(MAX) NULL,
                    createdBy NVARCHAR(50) NULL,
                    createdAt DATETIME2 DEFAULT GETDATE(),
                    sentAt DATETIME2 NULL,
                    CONSTRAINT FK_EmailQueue_Profile FOREIGN KEY (emailServerProfileId) REFERENCES EmailServerProfiles(id) ON DELETE SET NULL,
                    CONSTRAINT CK_EmailQueue_Status CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
                    CONSTRAINT CK_EmailQueue_Priority CHECK (priority BETWEEN 1 AND 10)
                )
                
                CREATE INDEX IX_EmailQueue_Status ON EmailQueue(status)
                CREATE INDEX IX_EmailQueue_Priority ON EmailQueue(priority)
                CREATE INDEX IX_EmailQueue_NextRetryDate ON EmailQueue(nextRetryDate)
                CREATE INDEX IX_EmailQueue_EmailType ON EmailQueue(emailType)
                CREATE INDEX IX_EmailQueue_CreatedAt ON EmailQueue(createdAt)
                CREATE INDEX IX_EmailQueue_Status_Priority_NextRetry ON EmailQueue(status, priority, nextRetryDate)
            END
        `);
        migrations.push('EmailQueue table created');
        
        // Email Templates Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailTemplates')
            BEGIN
                CREATE TABLE EmailTemplates (
                    id NVARCHAR(50) PRIMARY KEY,
                    name NVARCHAR(255) NOT NULL,
                    description NVARCHAR(500) NULL,
                    emailType NVARCHAR(50) NOT NULL,
                    subject NVARCHAR(500) NOT NULL,
                    bodyHtml NVARCHAR(MAX) NOT NULL,
                    bodyText NVARCHAR(MAX) NULL,
                    variables NVARCHAR(MAX) NULL,
                    isActive BIT NOT NULL DEFAULT 1,
                    isSystem BIT NOT NULL DEFAULT 0,
                    createdBy NVARCHAR(50) NOT NULL,
                    createdAt DATETIME2 DEFAULT GETDATE(),
                    updatedBy NVARCHAR(50) NULL,
                    updatedAt DATETIME2 NULL,
                    CONSTRAINT FK_EmailTemplate_CreatedBy FOREIGN KEY (createdBy) REFERENCES Users(id) ON DELETE NO ACTION
                )
                
                CREATE INDEX IX_EmailTemplates_EmailType ON EmailTemplates(emailType)
                CREATE INDEX IX_EmailTemplates_IsActive ON EmailTemplates(isActive)
            END
        `);
        migrations.push('EmailTemplates table created');
        
        // Email Sent History Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailSentHistory')
            BEGIN
                CREATE TABLE EmailSentHistory (
                    id INT PRIMARY KEY IDENTITY(1,1),
                    emailQueueId INT NULL,
                    emailServerProfileId NVARCHAR(50) NULL,
                    toEmail NVARCHAR(255) NOT NULL,
                    subject NVARCHAR(500) NOT NULL,
                    emailType NVARCHAR(50) NOT NULL,
                    sentAt DATETIME2 DEFAULT GETDATE(),
                    sentBy NVARCHAR(50) NULL,
                    bodyPreview NVARCHAR(1000) NULL,
                    relatedEntityType NVARCHAR(50) NULL,
                    relatedEntityId NVARCHAR(50) NULL,
                    CONSTRAINT FK_EmailHistory_Queue FOREIGN KEY (emailQueueId) REFERENCES EmailQueue(id) ON DELETE SET NULL,
                    CONSTRAINT FK_EmailHistory_Profile FOREIGN KEY (emailServerProfileId) REFERENCES EmailServerProfiles(id) ON DELETE SET NULL
                )
                
                CREATE INDEX IX_EmailSentHistory_SentAt ON EmailSentHistory(sentAt)
                CREATE INDEX IX_EmailSentHistory_EmailType ON EmailSentHistory(emailType)
                CREATE INDEX IX_EmailSentHistory_ToEmail ON EmailSentHistory(toEmail)
            END
        `);
        migrations.push('EmailSentHistory table created');
        
        // Insert default email templates
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM EmailTemplates WHERE emailType = 'password_reset')
            BEGIN
                DECLARE @systemUserId NVARCHAR(50)
                SELECT TOP 1 @systemUserId = id FROM Users WHERE username = 'admin' OR role = 'admin' ORDER BY created_at
                
                IF @systemUserId IS NOT NULL
                BEGIN
                    INSERT INTO EmailTemplates (id, name, description, emailType, subject, bodyHtml, bodyText, variables, isActive, isSystem, createdBy)
                    VALUES (
                        NEWID(),
                        'Password Reset Request',
                        'Email template for password reset requests',
                        'password_reset',
                        'OrbisHub - Password Reset Request',
                        '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #2563eb;">Password Reset Request</h2><p>Hello {{userName}},</p><p>We received a request to reset your password for your OrbisHub account.</p><p>Click the link below to reset your password:</p><p style="margin: 20px 0;"><a href="{{resetLink}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p><p style="color: #666; font-size: 14px;">This link will expire in {{expiryTime}}.</p><p style="color: #666; font-size: 14px;">If you did not request a password reset, please ignore this email.</p><hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;"><p style="color: #999; font-size: 12px;">OrbisHub - IT Management System</p></div></body></html>',
                        'Password Reset Request\n\nHello {{userName}},\n\nWe received a request to reset your password for your OrbisHub account.\n\nClick the link below to reset your password:\n{{resetLink}}\n\nThis link will expire in {{expiryTime}}.\n\nIf you did not request a password reset, please ignore this email.\n\n---\nOrbisHub - IT Management System',
                        '["userName", "resetLink", "expiryTime"]',
                        1,
                        1,
                        @systemUserId
                    )
                    
                    INSERT INTO EmailTemplates (id, name, description, emailType, subject, bodyHtml, bodyText, variables, isActive, isSystem, createdBy)
                    VALUES (
                        NEWID(),
                        'Bug Report Notification',
                        'Email template for bug report notifications',
                        'bug_report',
                        'OrbisHub - New Bug Report: {{bugTitle}}',
                        '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #ef4444;">🐛 New Bug Report</h2><p><strong>Title:</strong> {{bugTitle}}</p><p><strong>Reported by:</strong> {{reporterName}} ({{reporterEmail}})</p><p><strong>Severity:</strong> <span style="color: #ef4444;">{{severity}}</span></p><p><strong>Description:</strong></p><div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 10px 0;">{{bugDescription}}</div><p style="margin-top: 20px;"><a href="{{bugLink}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Bug Details</a></p><hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;"><p style="color: #999; font-size: 12px;">OrbisHub - IT Management System</p></div></body></html>',
                        'New Bug Report\n\nTitle: {{bugTitle}}\nReported by: {{reporterName}} ({{reporterEmail}})\nSeverity: {{severity}}\n\nDescription:\n{{bugDescription}}\n\nView details: {{bugLink}}\n\n---\nOrbisHub - IT Management System',
                        '["bugTitle", "reporterName", "reporterEmail", "severity", "bugDescription", "bugLink"]',
                        1,
                        1,
                        @systemUserId
                    )
                    
                    INSERT INTO EmailTemplates (id, name, description, emailType, subject, bodyHtml, bodyText, variables, isActive, isSystem, createdBy)
                    VALUES (
                        NEWID(),
                        'Account Locked Notification',
                        'Email template for account lockout notifications',
                        'notification',
                        'OrbisHub - Your Account Has Been Locked',
                        '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #f59e0b;">⚠️ Account Locked</h2><p>Hello {{userName}},</p><p>Your OrbisHub account has been locked due to multiple failed login attempts.</p><p><strong>Lockout Details:</strong></p><ul><li>Failed attempts: {{failedAttempts}}</li><li>Locked until: {{lockoutExpiry}}</li><li>IP Address: {{ipAddress}}</li></ul><p>Your account will be automatically unlocked after the lockout period expires.</p><p>If this was not you, please contact your system administrator immediately.</p><hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;"><p style="color: #999; font-size: 12px;">OrbisHub - IT Management System</p></div></body></html>',
                        'Account Locked\n\nHello {{userName}},\n\nYour OrbisHub account has been locked due to multiple failed login attempts.\n\nLockout Details:\n- Failed attempts: {{failedAttempts}}\n- Locked until: {{lockoutExpiry}}\n- IP Address: {{ipAddress}}\n\nYour account will be automatically unlocked after the lockout period expires.\n\nIf this was not you, please contact your system administrator immediately.\n\n---\nOrbisHub - IT Management System',
                        '["userName", "failedAttempts", "lockoutExpiry", "ipAddress"]',
                        1,
                        1,
                        @systemUserId
                    )
                END
            END
        `);
        migrations.push('Default email templates created');
        
        // ============ USER RECOVERY SYSTEM ============
        
        // Password Reset Tokens Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PasswordResetTokens')
            BEGIN
                CREATE TABLE PasswordResetTokens (
                    id NVARCHAR(50) PRIMARY KEY,
                    userId NVARCHAR(50) NOT NULL,
                    token NVARCHAR(255) NOT NULL UNIQUE,
                    expiresAt DATETIME2 NOT NULL,
                    isUsed BIT NOT NULL DEFAULT 0,
                    usedAt DATETIME2 NULL,
                    requestedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
                    requestIp NVARCHAR(50) NULL,
                    userAgent NVARCHAR(500) NULL,
                    emailSentTo NVARCHAR(255) NOT NULL,
                    emailSentAt DATETIME2 NULL,
                    emailStatus NVARCHAR(50) NULL,
                    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT FK_PasswordResetToken_User FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
                )
                
                CREATE INDEX IX_PasswordResetTokens_Token ON PasswordResetTokens(token)
                CREATE INDEX IX_PasswordResetTokens_UserId ON PasswordResetTokens(userId)
                CREATE INDEX IX_PasswordResetTokens_ExpiresAt ON PasswordResetTokens(expiresAt)
            END
        `);
        migrations.push('PasswordResetTokens table created');
        
        // Account Recovery Audit Log Table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AccountRecoveryLog')
            BEGIN
                CREATE TABLE AccountRecoveryLog (
                    id NVARCHAR(50) PRIMARY KEY,
                    userId NVARCHAR(50) NULL,
                    username NVARCHAR(50) NULL,
                    email NVARCHAR(255) NULL,
                    action NVARCHAR(50) NOT NULL,
                    status NVARCHAR(50) NOT NULL,
                    requestIp NVARCHAR(50) NULL,
                    userAgent NVARCHAR(500) NULL,
                    failureReason NVARCHAR(500) NULL,
                    metadata NVARCHAR(MAX) NULL,
                    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT FK_AccountRecoveryLog_User FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE SET NULL
                )
                
                CREATE INDEX IX_AccountRecoveryLog_UserId ON AccountRecoveryLog(userId)
                CREATE INDEX IX_AccountRecoveryLog_CreatedAt ON AccountRecoveryLog(createdAt)
            END
        `);
        migrations.push('AccountRecoveryLog table created');
        
        // Create stored procedures for User Recovery
        await pool.request().query(`
            IF OBJECT_ID('sp_CreatePasswordResetToken', 'P') IS NOT NULL
                DROP PROCEDURE sp_CreatePasswordResetToken;
        `);
        
        await pool.request().query(`
            CREATE PROCEDURE sp_CreatePasswordResetToken
                @userId NVARCHAR(50),
                @token NVARCHAR(255),
                @email NVARCHAR(255),
                @expiryMinutes INT = 60,
                @requestIp NVARCHAR(50) = NULL,
                @userAgent NVARCHAR(500) = NULL
            AS
            BEGIN
                SET NOCOUNT ON;
                
                DECLARE @tokenId NVARCHAR(50) = NEWID();
                DECLARE @expiresAt DATETIME2 = DATEADD(MINUTE, @expiryMinutes, GETDATE());
                
                UPDATE PasswordResetTokens 
                SET isUsed = 1, usedAt = GETDATE()
                WHERE userId = @userId AND isUsed = 0;
                
                INSERT INTO PasswordResetTokens (
                    id, userId, token, expiresAt, requestedAt, requestIp, 
                    userAgent, emailSentTo, emailStatus
                )
                VALUES (
                    @tokenId, @userId, @token, @expiresAt, GETDATE(), @requestIp,
                    @userAgent, @email, 'pending'
                );
                
                SELECT * FROM PasswordResetTokens WHERE id = @tokenId;
            END
        `);
        migrations.push('sp_CreatePasswordResetToken stored procedure created');
        
        await pool.request().query(`
            IF OBJECT_ID('sp_VerifyPasswordResetToken', 'P') IS NOT NULL
                DROP PROCEDURE sp_VerifyPasswordResetToken;
        `);
        
        await pool.request().query(`
            CREATE PROCEDURE sp_VerifyPasswordResetToken
                @token NVARCHAR(255),
                @markAsUsed BIT = 0
            AS
            BEGIN
                SET NOCOUNT ON;
                
                DECLARE @tokenRecord TABLE (
                    id NVARCHAR(50),
                    userId NVARCHAR(50),
                    token NVARCHAR(255),
                    expiresAt DATETIME2,
                    isUsed BIT,
                    isValid BIT
                );
                
                INSERT INTO @tokenRecord
                SELECT 
                    id, userId, token, expiresAt, isUsed,
                    CASE 
                        WHEN isUsed = 0 AND expiresAt > GETDATE() THEN 1
                        ELSE 0
                    END as isValid
                FROM PasswordResetTokens
                WHERE token = @token;
                
                IF @markAsUsed = 1
                BEGIN
                    UPDATE PasswordResetTokens
                    SET isUsed = 1, usedAt = GETDATE(), emailStatus = 'used'
                    WHERE token = @token AND isUsed = 0;
                END
                
                SELECT * FROM @tokenRecord;
            END
        `);
        migrations.push('sp_VerifyPasswordResetToken stored procedure created');
        
        await pool.request().query(`
            IF OBJECT_ID('sp_CleanupExpiredResetTokens', 'P') IS NOT NULL
                DROP PROCEDURE sp_CleanupExpiredResetTokens;
        `);
        
        await pool.request().query(`
            CREATE PROCEDURE sp_CleanupExpiredResetTokens
                @retentionDays INT = 30
            AS
            BEGIN
                SET NOCOUNT ON;
                
                DECLARE @cutoffDate DATETIME2 = DATEADD(DAY, -@retentionDays, GETDATE());
                DECLARE @deletedCount INT;
                
                DELETE FROM PasswordResetTokens
                WHERE expiresAt < @cutoffDate;
                
                SET @deletedCount = @@ROWCOUNT;
                
                DELETE FROM AccountRecoveryLog
                WHERE createdAt < @cutoffDate;
                
                SELECT @deletedCount as DeletedTokens, @@ROWCOUNT as DeletedLogEntries;
            END
        `);
        migrations.push('sp_CleanupExpiredResetTokens stored procedure created');
        
        await pool.request().query(`
            IF OBJECT_ID('sp_GetUserForRecovery', 'P') IS NOT NULL
                DROP PROCEDURE sp_GetUserForRecovery;
        `);
        
        await pool.request().query(`
            CREATE PROCEDURE sp_GetUserForRecovery
                @usernameOrEmail NVARCHAR(255)
            AS
            BEGIN
                SET NOCOUNT ON;
                
                SELECT id, username, email, name, isActive
                FROM Users
                WHERE (username = @usernameOrEmail OR email = @usernameOrEmail)
                    AND isActive = 1
                    AND email IS NOT NULL
                    AND email != '';
            END
        `);
        migrations.push('sp_GetUserForRecovery stored procedure created');
        
        // ============ USER PERMISSIONS SYSTEM (RBAC) ============
        
        // Permissions Table - Master list of all available permissions
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Permissions')
            BEGIN
                CREATE TABLE [dbo].[Permissions] (
                    [id] NVARCHAR(50) PRIMARY KEY,
                    [resource] NVARCHAR(50) NOT NULL,
                    [action] NVARCHAR(50) NOT NULL,
                    [permission] NVARCHAR(100) NOT NULL UNIQUE,
                    [description] NVARCHAR(255),
                    [category] NVARCHAR(50),
                    [isActive] BIT DEFAULT 1,
                    [created_at] DATETIME DEFAULT GETDATE()
                )
                
                CREATE INDEX IX_Permissions_Resource ON [dbo].[Permissions]([resource])
                CREATE INDEX IX_Permissions_Action ON [dbo].[Permissions]([action])
                CREATE INDEX IX_Permissions_Permission ON [dbo].[Permissions]([permission])
            END
        `);
        migrations.push('Permissions table created');
        
        // Roles Table - Define system roles
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Roles')
            BEGIN
                CREATE TABLE [dbo].[Roles] (
                    [id] NVARCHAR(50) PRIMARY KEY,
                    [name] NVARCHAR(100) NOT NULL UNIQUE,
                    [displayName] NVARCHAR(100),
                    [description] NVARCHAR(500),
                    [color] NVARCHAR(20),
                    [icon] NVARCHAR(50),
                    [level] INT DEFAULT 0,
                    [isSystem] BIT DEFAULT 0,
                    [isActive] BIT DEFAULT 1,
                    [created_at] DATETIME DEFAULT GETDATE(),
                    [updated_at] DATETIME DEFAULT GETDATE()
                )
                
                CREATE INDEX IX_Roles_Name ON [dbo].[Roles]([name])
                CREATE INDEX IX_Roles_Level ON [dbo].[Roles]([level])
            END
        `);
        migrations.push('Roles table created');
        
        // RolePermissions Table - Many-to-many mapping
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RolePermissions')
            BEGIN
                CREATE TABLE [dbo].[RolePermissions] (
                    [id] NVARCHAR(50) PRIMARY KEY,
                    [roleId] NVARCHAR(50) NOT NULL,
                    [permissionId] NVARCHAR(50) NOT NULL,
                    [granted_by] NVARCHAR(50),
                    [granted_at] DATETIME DEFAULT GETDATE(),
                    
                    CONSTRAINT FK_RolePermissions_Role FOREIGN KEY ([roleId]) 
                        REFERENCES [dbo].[Roles]([id]) ON DELETE CASCADE,
                    CONSTRAINT FK_RolePermissions_Permission FOREIGN KEY ([permissionId]) 
                        REFERENCES [dbo].[Permissions]([id]) ON DELETE CASCADE,
                    CONSTRAINT UQ_RolePermission UNIQUE ([roleId], [permissionId])
                )
                
                CREATE INDEX IX_RolePermissions_RoleId ON [dbo].[RolePermissions]([roleId])
                CREATE INDEX IX_RolePermissions_PermissionId ON [dbo].[RolePermissions]([permissionId])
            END
        `);
        migrations.push('RolePermissions table created');
        
        // UserRoles Table - Many-to-many mapping between Users and Roles
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserRoles')
            BEGIN
                CREATE TABLE [dbo].[UserRoles] (
                    [id] NVARCHAR(50) PRIMARY KEY,
                    [userId] NVARCHAR(50) NOT NULL,
                    [roleId] NVARCHAR(50) NOT NULL,
                    [assigned_by] NVARCHAR(50),
                    [assigned_at] DATETIME DEFAULT GETDATE(),
                    [expires_at] DATETIME NULL,
                    
                    CONSTRAINT FK_UserRoles_User FOREIGN KEY ([userId]) 
                        REFERENCES [dbo].[Users]([id]) ON DELETE CASCADE,
                    CONSTRAINT FK_UserRoles_Role FOREIGN KEY ([roleId]) 
                        REFERENCES [dbo].[Roles]([id]) ON DELETE CASCADE,
                    CONSTRAINT UQ_UserRole UNIQUE ([userId], [roleId])
                )
                
                CREATE INDEX IX_UserRoles_UserId ON [dbo].[UserRoles]([userId])
                CREATE INDEX IX_UserRoles_RoleId ON [dbo].[UserRoles]([roleId])
            END
        `);
        migrations.push('UserRoles table created');
        
        // PermissionAuditLog Table - Track permission changes
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PermissionAuditLog')
            BEGIN
                CREATE TABLE [dbo].[PermissionAuditLog] (
                    [id] NVARCHAR(50) PRIMARY KEY,
                    [action] NVARCHAR(50) NOT NULL,
                    [entityType] NVARCHAR(50) NOT NULL,
                    [entityId] NVARCHAR(50) NOT NULL,
                    [targetId] NVARCHAR(50),
                    [performedBy] NVARCHAR(50) NOT NULL,
                    [details] NVARCHAR(MAX),
                    [ipAddress] NVARCHAR(50),
                    [created_at] DATETIME DEFAULT GETDATE()
                )
                
                CREATE INDEX IX_PermissionAudit_Action ON [dbo].[PermissionAuditLog]([action])
                CREATE INDEX IX_PermissionAudit_PerformedBy ON [dbo].[PermissionAuditLog]([performedBy])
                CREATE INDEX IX_PermissionAudit_CreatedAt ON [dbo].[PermissionAuditLog]([created_at])
            END
        `);
        migrations.push('PermissionAuditLog table created');
        
        // Seed default permissions (only if table is empty)
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM [dbo].[Permissions])
            BEGIN
                -- Users
                INSERT INTO [dbo].[Permissions] (id, resource, action, permission, description, category, isActive) VALUES
                (NEWID(), 'users', 'view', 'users:view', 'View user list and details', 'User Management', 1),
                (NEWID(), 'users', 'create', 'users:create', 'Create new users', 'User Management', 1),
                (NEWID(), 'users', 'edit', 'users:edit', 'Edit user details and settings', 'User Management', 1),
                (NEWID(), 'users', 'delete', 'users:delete', 'Delete users from system', 'User Management', 1),
                (NEWID(), 'users', 'reset_password', 'users:reset_password', 'Reset user passwords', 'User Management', 1),
                (NEWID(), 'users', 'manage', 'users:manage', 'Full user management access', 'User Management', 1),
                
                -- Environments
                (NEWID(), 'environments', 'view', 'environments:view', 'View environments', 'Environment Management', 1),
                (NEWID(), 'environments', 'create', 'environments:create', 'Create new environments', 'Environment Management', 1),
                (NEWID(), 'environments', 'edit', 'environments:edit', 'Edit environment configurations', 'Environment Management', 1),
                (NEWID(), 'environments', 'delete', 'environments:delete', 'Delete environments', 'Environment Management', 1),
                (NEWID(), 'environments', 'execute', 'environments:execute', 'Deploy and execute environment actions', 'Environment Management', 1),
                
                -- Servers
                (NEWID(), 'servers', 'view', 'servers:view', 'View server configurations', 'Server Management', 1),
                (NEWID(), 'servers', 'create', 'servers:create', 'Add new servers', 'Server Management', 1),
                (NEWID(), 'servers', 'edit', 'servers:edit', 'Edit server details', 'Server Management', 1),
                (NEWID(), 'servers', 'delete', 'servers:delete', 'Delete servers', 'Server Management', 1),
                (NEWID(), 'servers', 'execute', 'servers:execute', 'Connect and execute server actions', 'Server Management', 1),
                
                -- Databases
                (NEWID(), 'databases', 'view', 'databases:view', 'View database configurations', 'Data Management', 1),
                (NEWID(), 'databases', 'create', 'databases:create', 'Add new database connections', 'Data Management', 1),
                (NEWID(), 'databases', 'edit', 'databases:edit', 'Edit database configurations', 'Data Management', 1),
                (NEWID(), 'databases', 'delete', 'databases:delete', 'Delete database connections', 'Data Management', 1),
                (NEWID(), 'databases', 'execute', 'databases:execute', 'Run database maintenance operations', 'Data Management', 1),
                
                -- Credentials
                (NEWID(), 'credentials', 'view', 'credentials:view', 'View stored credentials', 'Credentials Management', 1),
                (NEWID(), 'credentials', 'create', 'credentials:create', 'Create new credentials', 'Credentials Management', 1),
                (NEWID(), 'credentials', 'edit', 'credentials:edit', 'Edit credential details', 'Credentials Management', 1),
                (NEWID(), 'credentials', 'delete', 'credentials:delete', 'Delete credentials', 'Credentials Management', 1),
                (NEWID(), 'credentials', 'reveal', 'credentials:reveal', 'View decrypted passwords', 'Security', 1),
                
                -- Password Manager (ADMIN ONLY)
                (NEWID(), 'passwords', 'view', 'passwords:view', 'View Password Manager and stored passwords', 'Security', 1),
                (NEWID(), 'passwords', 'create', 'passwords:create', 'Create new passwords in Password Manager', 'Security', 1),
                (NEWID(), 'passwords', 'edit', 'passwords:edit', 'Edit passwords and manage categories', 'Security', 1),
                (NEWID(), 'passwords', 'delete', 'passwords:delete', 'Delete passwords from Password Manager', 'Security', 1),
                
                -- Messages
                (NEWID(), 'messages', 'view', 'messages:view', 'View messages', 'Communication', 1),
                (NEWID(), 'messages', 'create', 'messages:create', 'Create and send messages', 'Communication', 1),
                (NEWID(), 'messages', 'delete', 'messages:delete', 'Delete messages', 'Communication', 1),
                
                -- Files
                (NEWID(), 'files', 'view', 'files:view', 'View file attachments', 'File Management', 1),
                (NEWID(), 'files', 'upload', 'files:upload', 'Upload file attachments', 'File Management', 1),
                (NEWID(), 'files', 'download', 'files:download', 'Download file attachments', 'File Management', 1),
                (NEWID(), 'files', 'delete', 'files:delete', 'Delete file attachments', 'File Management', 1),
                
                -- Audit
                (NEWID(), 'audit', 'view', 'audit:view', 'View audit logs', 'Audit', 1),
                (NEWID(), 'audit', 'export', 'audit:export', 'Export audit logs', 'Audit', 1),
                (NEWID(), 'audit', 'delete', 'audit:delete', 'Clear audit logs', 'Audit', 1),
                
                -- Roles
                (NEWID(), 'roles', 'view', 'roles:view', 'View roles and permissions', 'Role Management', 1),
                (NEWID(), 'roles', 'create', 'roles:create', 'Create new roles', 'Role Management', 1),
                (NEWID(), 'roles', 'edit', 'roles:edit', 'Edit role permissions', 'Role Management', 1),
                (NEWID(), 'roles', 'delete', 'roles:delete', 'Delete custom roles', 'Role Management', 1),
                (NEWID(), 'roles', 'assign', 'roles:assign', 'Assign roles to users', 'Role Management', 1),
                
                -- Settings
                (NEWID(), 'settings', 'view', 'settings:view', 'View system settings', 'System', 1),
                (NEWID(), 'settings', 'edit', 'settings:edit', 'Edit system settings', 'System', 1),
                (NEWID(), 'settings', 'delete', 'settings:delete', 'Delete system data (Clear All Data)', 'System', 1),
                
                -- System/Infrastructure
                (NEWID(), 'system', 'view', 'system:view', 'View system information', 'System', 1),
                (NEWID(), 'system', 'edit', 'system:edit', 'Edit system configuration', 'System', 1),
                (NEWID(), 'agents', 'view', 'agents:view', 'View OrbisAgent status', 'Infrastructure', 1),
                (NEWID(), 'agents', 'manage', 'agents:manage', 'Manage OrbisAgent deployments', 'Infrastructure', 1),
                
                -- Wildcard (Super Admin only)
                (NEWID(), '*', '*', '*:*', 'Full system access (Super Admin)', 'System', 1)
            END
        `);
        migrations.push('Default permissions seeded (50+ permissions including Password Manager)');
        
        // Seed default roles with FIXED IDs (only if table is empty)
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles])
            BEGIN
                DECLARE @superAdminId NVARCHAR(50) = '39AB95FD-D70F-420B-A241-27F0F7EB58FC'
                DECLARE @adminId NVARCHAR(50) = 'F7C8A9E3-5B2D-4F6E-8A1C-3D9E7B4F2A8C'
                DECLARE @managerId NVARCHAR(50) = 'E4D6B8F2-9A3C-4E7D-B1A5-8C2F9E3D7B6A'
                DECLARE @operatorId NVARCHAR(50) = 'C3A7E5D9-2B4F-4A8E-9C1D-7E3B8F2A5C9D'
                DECLARE @viewerId NVARCHAR(50) = 'B2F8D4A6-7C3E-4D9B-8A2F-5E1C9D3B7F4A'
                
                INSERT INTO [dbo].[Roles] (id, name, displayName, description, color, icon, level, isSystem, isActive) VALUES
                (@superAdminId, 'super_admin', 'Super Administrator', 'Full system access with all permissions', '#dc2626', '👑', 100, 1, 1),
                (@adminId, 'admin', 'Administrator', 'Administrative access (cannot manage roles)', '#f97316', '🔑', 90, 1, 1),
                (@managerId, 'manager', 'Manager', 'Can manage environments, servers, and databases', '#3b82f6', '📊', 70, 1, 1),
                (@operatorId, 'operator', 'Operator', 'Can execute operations on environments and servers', '#10b981', '⚙️', 50, 1, 1),
                (@viewerId, 'viewer', 'Viewer', 'Read-only access to view resources', '#6b7280', '👁️', 10, 1, 1)
                
                -- Super Admin: ALL permissions including wildcard
                INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
                SELECT NEWID(), @superAdminId, id FROM [dbo].[Permissions]
                
                -- Admin: All permissions EXCEPT roles management and wildcard (includes Password Manager)
                INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
                SELECT NEWID(), @adminId, id FROM [dbo].[Permissions]
                WHERE resource NOT IN ('roles', '*')
                
                -- Admin can VIEW roles but not modify
                INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
                SELECT NEWID(), @adminId, id FROM [dbo].[Permissions]
                WHERE permission = 'roles:view'
                
                -- Manager: View all + manage envs/servers/databases (NO passwords)
                INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
                SELECT NEWID(), @managerId, id FROM [dbo].[Permissions]
                WHERE (
                    action = 'view' OR
                    permission IN (
                        'environments:create', 'environments:edit', 'environments:delete', 'environments:execute',
                        'servers:create', 'servers:edit', 'servers:delete', 'servers:execute',
                        'databases:create', 'databases:edit', 'databases:delete', 'databases:execute',
                        'credentials:create', 'credentials:edit'
                    )
                ) AND resource != 'passwords'
                
                -- Operator: Execute on envs/servers/databases + manage files/messages (NO passwords)
                INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
                SELECT NEWID(), @operatorId, id FROM [dbo].[Permissions]
                WHERE (
                    resource IN ('environments', 'servers', 'databases', 'credentials', 'files', 'messages', 'agents') AND
                    action IN ('view', 'create', 'edit', 'execute', 'upload', 'download')
                ) AND resource != 'passwords'
                
                -- Viewer: View-only (NO roles, settings, or passwords)
                INSERT INTO [dbo].[RolePermissions] (id, roleId, permissionId)
                SELECT NEWID(), @viewerId, id FROM [dbo].[Permissions]
                WHERE action = 'view' AND resource NOT IN ('roles', 'settings', 'passwords', '*')
            END
        `);
        migrations.push('Default roles and role-permission mappings seeded (Password Manager is ADMIN-ONLY)');
        
        // Create UserPermissions View with FIXED column names
        await pool.request().query(`
            IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_UserPermissions')
                DROP VIEW [dbo].[vw_UserPermissions]
        `);
        
        await pool.request().query(`
            CREATE VIEW [dbo].[vw_UserPermissions] AS
            SELECT 
                u.id AS userId,
                u.username AS username,
                u.name AS userFullName,
                r.name AS roleName,
                r.displayName AS roleDisplayName,
                p.permission AS permission,
                p.resource AS resource,
                p.action AS [action],
                p.description AS permissionDescription,
                p.category AS category
            FROM [dbo].[Users] u
            INNER JOIN [dbo].[UserRoles] ur ON u.id = ur.userId
            INNER JOIN [dbo].[Roles] r ON ur.roleId = r.id
            INNER JOIN [dbo].[RolePermissions] rp ON r.id = rp.roleId
            INNER JOIN [dbo].[Permissions] p ON rp.permissionId = p.id
            WHERE u.isActive = 1 AND r.isActive = 1 AND p.isActive = 1
        `);
        migrations.push('vw_UserPermissions view created (fixed column names)');
        
        // Create vw_RoleSummary view
        await pool.request().query(`
            IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_RoleSummary')
                DROP VIEW [dbo].[vw_RoleSummary]
        `);
        
        await pool.request().query(`
            CREATE VIEW [dbo].[vw_RoleSummary] AS
            SELECT 
                r.id AS roleId,
                r.name AS roleName,
                r.displayName,
                r.description,
                r.color,
                r.level,
                COUNT(DISTINCT rp.permissionId) AS permissionCount,
                COUNT(DISTINCT ur.userId) AS userCount
            FROM [dbo].[Roles] r
            LEFT JOIN [dbo].[RolePermissions] rp ON r.id = rp.roleId
            LEFT JOIN [dbo].[UserRoles] ur ON r.id = ur.roleId
            WHERE r.isActive = 1
            GROUP BY r.id, r.name, r.displayName, r.description, r.color, r.level
        `);
        migrations.push('vw_RoleSummary view created');
        
        // Create stored procedure for checking permissions
        await pool.request().query(`
            IF OBJECT_ID('sp_CheckUserPermission', 'P') IS NOT NULL
                DROP PROCEDURE sp_CheckUserPermission
        `);
        
        await pool.request().query(`
            CREATE PROCEDURE sp_CheckUserPermission
                @userId NVARCHAR(50),
                @permission NVARCHAR(100)
            AS
            BEGIN
                SET NOCOUNT ON;
                
                -- Check for wildcard permission
                IF EXISTS (
                    SELECT 1 FROM [dbo].[vw_UserPermissions]
                    WHERE userId = @userId AND permission = '*:*'
                )
                BEGIN
                    SELECT 1 AS hasPermission
                    RETURN
                END
                
                -- Check for exact permission
                IF EXISTS (
                    SELECT 1 FROM [dbo].[vw_UserPermissions]
                    WHERE userId = @userId AND permission = @permission
                )
                BEGIN
                    SELECT 1 AS hasPermission
                    RETURN
                END
                
                -- Check for resource wildcard (e.g., users:* matches users:create)
                DECLARE @resource NVARCHAR(50) = LEFT(@permission, CHARINDEX(':', @permission) - 1)
                DECLARE @resourceWildcard NVARCHAR(100) = @resource + ':*'
                
                IF EXISTS (
                    SELECT 1 FROM [dbo].[vw_UserPermissions]
                    WHERE userId = @userId AND permission = @resourceWildcard
                )
                BEGIN
                    SELECT 1 AS hasPermission
                    RETURN
                END
                
                -- No permission found
                SELECT 0 AS hasPermission
            END
        `);
        migrations.push('sp_CheckUserPermission stored procedure created');
        
        // Create stored procedure for getting user permissions
        await pool.request().query(`
            IF OBJECT_ID('sp_GetUserPermissions', 'P') IS NOT NULL
                DROP PROCEDURE sp_GetUserPermissions
        `);
        
        await pool.request().query(`
            CREATE PROCEDURE sp_GetUserPermissions
                @userId NVARCHAR(50)
            AS
            BEGIN
                SET NOCOUNT ON;
                
                SELECT DISTINCT
                    p.permission,
                    p.resource,
                    p.action,
                    p.description,
                    p.category
                FROM [dbo].[vw_UserPermissions] vup
                INNER JOIN [dbo].[Permissions] p ON vup.permission = p.permission
                WHERE vup.userId = @userId
                ORDER BY p.category, p.resource, p.action
            END
        `);
        migrations.push('sp_GetUserPermissions stored procedure created');
        
        // Note: Ticket numbers are generated in the application code during insert
        // to avoid conflicts with OUTPUT clause
        
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
            // Try simple creation first - let SQL Server use its default paths
            // This is the most reliable method
            console.log('Attempting simple CREATE DATABASE (using SQL Server defaults)');
            await pool.request().query(`CREATE DATABASE [${config.database}]`);
            console.log(`Database '${config.database}' created successfully with default settings`);
            
            // If using SQL authentication, set up the login as database owner
            if (config.authType === 'sql' && config.user) {
                console.log(`Setting up user '${config.user}' as database owner...`);
                
                try {
                    // Check if login exists at server level
                    const loginCheck = await pool.request()
                        .input('loginName', sql.NVarChar, config.user)
                        .query(`SELECT name FROM sys.server_principals WHERE name = @loginName AND type = 'S'`);
                    
                    if (loginCheck.recordset.length === 0) {
                        // Create the SQL login if it doesn't exist
                        // Set default database to 'master' to prevent issues if database is dropped later
                        console.log(`Creating SQL login '${config.user}' with default database = master...`);
                        await pool.request().query(`
                            CREATE LOGIN [${config.user}] 
                            WITH PASSWORD = '${config.password.replace(/'/g, "''")}',
                            DEFAULT_DATABASE = [master]
                        `);
                    } else {
                        // Login exists, make sure default database is master
                        console.log(`Updating SQL login '${config.user}' default database to master...`);
                        await pool.request().query(`
                            ALTER LOGIN [${config.user}] 
                            WITH DEFAULT_DATABASE = [master]
                        `);
                    }
                    
                    // Switch to the new database context to create user and set owner
                    await pool.close();
                    
                    // Reconnect to the new database
                    const newDbConfig = { ...testConfig, database: config.database };
                    const newPool = await sql.connect(newDbConfig);
                    
                    // Create database user mapped to the login
                    console.log(`Creating database user '${config.user}'...`);
                    const userCheck = await newPool.request()
                        .input('userName', sql.NVarChar, config.user)
                        .query(`SELECT name FROM sys.database_principals WHERE name = @userName`);
                    
                    if (userCheck.recordset.length === 0) {
                        await newPool.request().query(`CREATE USER [${config.user}] FOR LOGIN [${config.user}]`);
                    }
                    
                    // Add user to db_owner role
                    console.log(`Granting db_owner role to '${config.user}'...`);
                    await newPool.request().query(`ALTER ROLE db_owner ADD MEMBER [${config.user}]`);
                    
                    // Set database owner
                    console.log(`Setting database owner to '${config.user}'...`);
                    await newPool.request().query(`ALTER AUTHORIZATION ON DATABASE::[${config.database}] TO [${config.user}]`);
                    
                    await newPool.close();
                    console.log(`✅ User '${config.user}' configured as database owner`);
                } catch (userError) {
                    console.warn('Warning: Could not set database owner:', userError.message);
                    console.warn('Database created but ownership not set. You may need to set this manually.');
                    // Don't fail the entire operation if this fails
                }
            }
            
        } catch (createError) {
            console.error('Create error:', createError);
            console.error('Error details:', {
                message: createError.message,
                number: createError.number,
                state: createError.state,
                class: createError.class,
                serverName: createError.serverName,
                procName: createError.procName,
                lineNumber: createError.lineNumber
            });
            await pool.close();
            
            // Provide more helpful error messages
            let errorMsg = createError.message;
            if (createError.message.includes('could not be created')) {
                errorMsg += '\n\nPossible causes:\n' +
                    '• SQL Server service may not have write permissions to the data directory\n' +
                    '• The data/log paths may not exist\n' +
                    '• Try running SQL Server service as an administrator or check folder permissions';
            }
            
            return {
                success: false,
                error: `CREATE DATABASE failed: ${errorMsg}`
            };
        }
        
        // Close the master connection if still open
        try { await pool.close(); } catch(e) {}
        
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
            const name = interfaceName.toLowerCase();
            
            // Only accept exactly "Ethernet" or "Wi-Fi" (case-insensitive)
            // This excludes "Ethernet 2", "Ethernet 3", VPN adapters, etc.
            const isExactEthernetOrWifi = 
                name === 'ethernet' || 
                name === 'wi-fi' || 
                name === 'wifi';
            
            if (!isExactEthernetOrWifi) continue;
            
            const addresses = networkInterfaces[interfaceName];
            for (const address of addresses) {
                // Only return IPv4 addresses that are not internal (loopback)
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

// ==================== BUG REPORTING ====================

// Get system information for bug reports
ipcMain.handle('bug-report:getSystemInfo', async (event) => {
    try {
        return {
            success: true,
            data: {
                os: `${os.platform()} ${os.release()} (${os.arch()})`,
                appVersion: app.getVersion() || '1.0.0',
                electronVersion: process.versions.electron,
                nodeVersion: process.versions.node,
                timestamp: new Date().toISOString(),
                totalMemory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
                freeMemory: `${Math.round(os.freemem() / 1024 / 1024 / 1024)}GB`
            }
        };
    } catch (error) {
        console.error('Failed to get system info:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

// Submit bug report via email
ipcMain.handle('bug-report:submit', async (event, bugData) => {
    try {
        const pool = await getDbPool();
        if (!pool) {
            throw new Error('Database connection not available');
        }

        // Get default email profile
        const profileResult = await pool.request()
            .query('SELECT TOP 1 id FROM EmailServerProfiles WHERE isActive = 1 AND isDefault = 1');

        if (!profileResult.recordset || profileResult.recordset.length === 0) {
            throw new Error('No active email server profile found. Please configure an email server profile first.');
        }

        const profileId = profileResult.recordset[0].id;

        // Helper function to escape HTML
        const escapeHtml = (text) => {
            if (!text) return '';
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/\n/g, '<br>');
        };

        // Get severity color
        const severityColors = {
            'Critical': '#ef4444',
            'High': '#f97316',
            'Medium': '#eab308',
            'Low': '#3b82f6',
            'Minor': '#8b5cf6'
        };

        const severityColor = severityColors[bugData.severity] || '#6b7280';

        // Format HTML email body
        const emailBodyHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f9fafb; margin: 0; padding: 0; }
        .container { max-width: 700px; margin: 20px auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 14px; }
        .severity-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 15px; background: ${severityColor}; color: white; }
        .content { padding: 30px; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
        .info-grid { display: table; width: 100%; border-collapse: collapse; }
        .info-row { display: table-row; }
        .info-label { display: table-cell; padding: 8px 0; font-weight: 600; color: #6b7280; width: 160px; }
        .info-value { display: table-cell; padding: 8px 0; color: #1f2937; }
        .description-box { background: #f3f4f6; padding: 20px; border-radius: 6px; border-left: 4px solid ${severityColor}; margin-top: 10px; }
        .system-info { background: #fef3c7; padding: 15px; border-radius: 6px; font-size: 13px; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐛 Bug Report</h1>
            <p>OrbisHub Desktop Application</p>
            <div class="severity-badge">${bugData.severity} Severity</div>
        </div>
        
        <div class="content">
            <div class="section">
                <div class="section-title">📋 Bug Details</div>
                <div class="info-grid">
                    <div class="info-row">
                        <div class="info-label">Title:</div>
                        <div class="info-value"><strong>${escapeHtml(bugData.title)}</strong></div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Category:</div>
                        <div class="info-value">${escapeHtml(bugData.category)}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Reported By:</div>
                        <div class="info-value">${escapeHtml(bugData.userName)}</div>
                    </div>
                    ${bugData.userEmail ? `
                    <div class="info-row">
                        <div class="info-label">Contact Email:</div>
                        <div class="info-value">${escapeHtml(bugData.userEmail)}</div>
                    </div>
                    ` : ''}
                    <div class="info-row">
                        <div class="info-label">Date:</div>
                        <div class="info-value">${new Date(bugData.timestamp).toLocaleString()}</div>
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">📝 Description</div>
                <div class="description-box">
                    ${escapeHtml(bugData.description)}
                </div>
            </div>

            ${bugData.stepsToReproduce ? `
            <div class="section">
                <div class="section-title">🔄 Steps to Reproduce</div>
                <div class="description-box">
                    ${escapeHtml(bugData.stepsToReproduce)}
                </div>
            </div>
            ` : ''}

            ${bugData.expectedBehavior ? `
            <div class="section">
                <div class="section-title">✅ Expected Behavior</div>
                <div class="description-box">
                    ${escapeHtml(bugData.expectedBehavior)}
                </div>
            </div>
            ` : ''}

            ${bugData.actualBehavior ? `
            <div class="section">
                <div class="section-title">❌ Actual Behavior</div>
                <div class="description-box">
                    ${escapeHtml(bugData.actualBehavior)}
                </div>
            </div>
            ` : ''}

            <div class="section">
                <div class="section-title">💻 System Information</div>
                <div class="system-info">
                    <strong>Operating System:</strong> ${escapeHtml(bugData.systemInfo.os || 'N/A')}<br>
                    <strong>App Version:</strong> ${escapeHtml(bugData.systemInfo.appVersion || 'N/A')}<br>
                    <strong>Electron Version:</strong> ${escapeHtml(bugData.systemInfo.electronVersion || 'N/A')}<br>
                    <strong>Node Version:</strong> ${escapeHtml(bugData.systemInfo.nodeVersion || 'N/A')}<br>
                    <strong>Total Memory:</strong> ${escapeHtml(bugData.systemInfo.totalMemory || 'N/A')}<br>
                    <strong>Free Memory:</strong> ${escapeHtml(bugData.systemInfo.freeMemory || 'N/A')}
                </div>
            </div>
        </div>

        <div class="footer">
            This bug report was automatically generated by OrbisHub Desktop<br>
            &copy; ${new Date().getFullYear()} OrbisHub - IT Management System
        </div>
    </div>
</body>
</html>
        `.trim();

        // Format plain text email body
        const emailBodyText = `
Bug Report - OrbisHub Desktop

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Title: ${bugData.title}
Severity: ${bugData.severity}
Category: ${bugData.category}
Reported By: ${bugData.userName}
${bugData.userEmail ? `Contact Email: ${bugData.userEmail}` : ''}
Date: ${new Date(bugData.timestamp).toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESCRIPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${bugData.description}

${bugData.stepsToReproduce ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEPS TO REPRODUCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${bugData.stepsToReproduce}
` : ''}

${bugData.expectedBehavior ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPECTED BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${bugData.expectedBehavior}
` : ''}

${bugData.actualBehavior ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTUAL BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${bugData.actualBehavior}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYSTEM INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Operating System: ${bugData.systemInfo.os || 'N/A'}
App Version: ${bugData.systemInfo.appVersion || 'N/A'}
Electron Version: ${bugData.systemInfo.electronVersion || 'N/A'}
Node Version: ${bugData.systemInfo.nodeVersion || 'N/A'}
Total Memory: ${bugData.systemInfo.totalMemory || 'N/A'}
Free Memory: ${bugData.systemInfo.freeMemory || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This bug report was automatically generated by OrbisHub Desktop.
        `.trim();

        // Prepare CC emails array if user provided their email
        let ccEmails = null;
        if (bugData.userEmail && bugData.userEmail.trim()) {
            ccEmails = JSON.stringify([bugData.userEmail.trim()]);
        }

        // Insert email into queue
        const queueResult = await pool.request()
            .input('profileId', sql.NVarChar, profileId)
            .input('toEmail', sql.NVarChar, 'info.orbishub@gmail.com')
            .input('toName', sql.NVarChar, 'OrbisHub Support')
            .input('ccEmails', sql.NVarChar, ccEmails)
            .input('subject', sql.NVarChar, `[OrbisHub Bug] [${bugData.severity}] ${bugData.title}`)
            .input('bodyHtml', sql.NVarChar, emailBodyHtml)
            .input('bodyText', sql.NVarChar, emailBodyText)
            .input('emailType', sql.NVarChar, 'bug-report')
            .input('priority', sql.Int, bugData.severity === 'Critical' ? 1 : bugData.severity === 'High' ? 2 : 5)
            .input('maxAttempts', sql.Int, 3)
            .query(`
                INSERT INTO EmailQueue (
                    emailServerProfileId, toEmail, toName, ccEmails, subject, 
                    bodyHtml, bodyText, emailType, status, priority, 
                    attempts, maxAttempts, createdAt
                ) 
                OUTPUT INSERTED.id 
                VALUES (
                    @profileId, @toEmail, @toName, @ccEmails, @subject,
                    @bodyHtml, @bodyText, @emailType, 'pending', @priority,
                    0, @maxAttempts, GETDATE()
                )
            `);

        if (!queueResult.recordset || queueResult.recordset.length === 0) {
            throw new Error('Failed to queue bug report email');
        }

        const emailQueueId = queueResult.recordset[0].id;

        // Immediately attempt to send the email
        const nodemailer = require('nodemailer');
        
        try {
            // Get email server profile details
            const profileDetailsResult = await pool.request()
                .input('profileId', sql.NVarChar, profileId)
                .query('SELECT * FROM EmailServerProfiles WHERE id = @profileId');

            if (!profileDetailsResult.recordset || profileDetailsResult.recordset.length === 0) {
                throw new Error('Email server profile not found');
            }

            const profile = profileDetailsResult.recordset[0];

            // Update status to sending
            await pool.request()
                .input('emailId', sql.Int, emailQueueId)
                .query('UPDATE EmailQueue SET status = \'sending\', lastAttemptDate = GETDATE() WHERE id = @emailId');

            // Decrypt password
            let smtpPassword = profile.password_encrypted;
            if (smtpPassword) {
                smtpPassword = decryptMessage(smtpPassword);
            }

            // Configure transporter
            const transportConfig = {
                host: profile.smtpHost,
                port: profile.smtpPort,
                secure: profile.useSSL,
                auth: profile.authRequired ? {
                    user: profile.username,
                    pass: smtpPassword
                } : undefined,
                tls: {
                    rejectUnauthorized: false
                }
            };

            if (profile.useTLS) {
                transportConfig.requireTLS = true;
            }

            const transporter = nodemailer.createTransport(transportConfig);

            // Prepare mail options
            const mailOptions = {
                from: `"${profile.fromName}" <${profile.fromEmail}>`,
                to: `"OrbisHub Support" <info.orbishub@gmail.com>`,
                subject: `[OrbisHub Bug] [${bugData.severity}] ${bugData.title}`,
                html: emailBodyHtml,
                text: emailBodyText
            };

            if (profile.replyToEmail) {
                mailOptions.replyTo = profile.replyToEmail;
            }

            // Add CC if user provided email
            if (bugData.userEmail && bugData.userEmail.trim()) {
                mailOptions.cc = bugData.userEmail.trim();
            }

            // Send email
            const info = await transporter.sendMail(mailOptions);

            // Update queue status to sent
            await pool.request()
                .input('emailId', sql.Int, emailQueueId)
                .input('messageId', sql.NVarChar, info.messageId || null)
                .query(`
                    UPDATE EmailQueue 
                    SET status = 'sent', 
                        sentAt = GETDATE(), 
                        lastAttemptDate = GETDATE()
                    WHERE id = @emailId
                `);

            console.log('Bug report email sent successfully:', info.messageId);
            
            return {
                success: true,
                message: `Bug report sent successfully${bugData.userEmail ? ' (CC sent to your email)' : ''}`,
                emailQueueId: emailQueueId,
                messageId: info.messageId
            };

        } catch (emailError) {
            console.error('Failed to send bug report email:', emailError);
            
            // Update queue with error
            await pool.request()
                .input('emailId', sql.Int, emailQueueId)
                .input('errorMessage', sql.NVarChar, emailError.message || 'Unknown error')
                .query(`
                    UPDATE EmailQueue 
                    SET status = 'failed', 
                        attempts = attempts + 1, 
                        lastAttemptDate = GETDATE(),
                        errorMessage = @errorMessage
                    WHERE id = @emailId
                `);

            // Return queued status - it will be retried later
            return {
                success: true,
                message: 'Bug report queued for sending. Email server may be temporarily unavailable.',
                emailQueueId: emailQueueId,
                warning: 'Email queued but not sent immediately: ' + emailError.message
            };
        }

    } catch (error) {
        console.error('Failed to submit bug report:', error);
        return {
            success: false,
            error: error.message || 'Failed to submit bug report'
        };
    }
});

// ==================== END BUG REPORTING ====================

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
    
    // Check every 5 seconds for new messages (balanced approach)
    // Only queries for unread messages, minimizing database load
    messageCheckInterval = setInterval(async () => {
        try {
            if (!dbPool || !mainWindow) return;
            
            // Skip if window is minimized or hidden to save resources
            if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
                return;
            }
            
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
    }, 5000); // Check every 5 seconds (12 queries/min vs 30 queries/min)
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
    isInstallingUpdate = true;
    autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Handle exit confirmation
ipcMain.handle('confirm-exit', () => {
    mainWindow.destroy();
    app.quit();
});

// ========== ORBISAGENT API HANDLERS ==========

// Agent registration endpoint
ipcMain.handle('agent-register', async (event, agentData) => {
    try {
        const pool = await getDbPool();
        await pool.request()
            .input('id', sql.NVarChar, agentData.id)
            .input('machineName', sql.NVarChar, agentData.machineName)
            .input('os', sql.NVarChar, agentData.os)
            .input('ipAddress', sql.NVarChar, agentData.ipAddress)
            .input('status', sql.NVarChar, agentData.status || 'online')
            .input('lastHeartbeat', sql.DateTime, new Date())
            .input('version', sql.NVarChar, agentData.version || '1.0.0')
            .input('metadata', sql.NVarChar, JSON.stringify(agentData.metadata || {}))
            .query(`
                MERGE Agents AS target
                USING (SELECT @id AS id) AS source
                ON target.id = source.id
                WHEN MATCHED THEN
                    UPDATE SET 
                        lastHeartbeat = @lastHeartbeat, 
                        status = @status, 
                        ipAddress = @ipAddress,
                        os = @os,
                        version = @version,
                        metadata = @metadata
                WHEN NOT MATCHED THEN
                    INSERT (id, machineName, os, ipAddress, status, lastHeartbeat, version, metadata)
                    VALUES (@id, @machineName, @os, @ipAddress, @status, @lastHeartbeat, @version, @metadata);
            `);
        
        return { success: true };
    } catch (error) {
        console.error('Agent registration failed:', error);
        return { success: false, error: error.message };
    }
});

// Poll for pending jobs
ipcMain.handle('agent-poll', async (event, agentId) => {
    try {
        const pool = await getDbPool();
        const result = await pool.request()
            .input('agentId', sql.NVarChar, agentId)
            .query(`
                SELECT * FROM AgentJobs 
                WHERE agentId = @agentId AND status = 'pending'
                ORDER BY createdAt
            `);
        
        // Mark jobs as running
        for (const job of result.recordset) {
            await pool.request()
                .input('id', sql.NVarChar, job.id)
                .query(`UPDATE AgentJobs SET status = 'running', startedAt = GETDATE() WHERE id = @id`);
        }
        
        return { success: true, jobs: result.recordset };
    } catch (error) {
        console.error('Agent poll failed:', error);
        return { success: false, error: error.message, jobs: [] };
    }
});

// Update job status
ipcMain.handle('agent-job-status', async (event, { jobId, status, result: jobResult }) => {
    try {
        const pool = await getDbPool();
        
        if (status === 'running') {
            await pool.request()
                .input('id', sql.NVarChar, jobId)
                .input('status', sql.NVarChar, status)
                .query(`UPDATE AgentJobs SET status = @status, startedAt = GETDATE() WHERE id = @id`);
        } else if (status === 'completed' || status === 'failed') {
            await pool.request()
                .input('id', sql.NVarChar, jobId)
                .input('status', sql.NVarChar, status)
                .input('result', sql.NVarChar, jobResult)
                .query(`UPDATE AgentJobs SET status = @status, result = @result, completedAt = GETDATE() WHERE id = @id`);
        }
        
        return { success: true };
    } catch (error) {
        console.error('Job status update failed:', error);
        return { success: false, error: error.message };
    }
});

// Save agent metrics
ipcMain.handle('agent-metrics', async (event, metricsData) => {
    try {
        const pool = await getDbPool();
        const metricId = crypto.randomUUID();
        
        await pool.request()
            .input('id', sql.NVarChar, metricId)
            .input('agentId', sql.NVarChar, metricsData.agentId)
            .input('timestamp', sql.DateTime, new Date())
            .input('cpuPercent', sql.Float, metricsData.cpuPercent || 0)
            .input('memoryPercent', sql.Float, metricsData.memoryPercent || 0)
            .input('diskPercent', sql.Float, metricsData.diskPercent || 0)
            .input('networkIn', sql.BigInt, metricsData.networkIn || 0)
            .input('networkOut', sql.BigInt, metricsData.networkOut || 0)
            .input('customMetrics', sql.NVarChar, JSON.stringify(metricsData.customMetrics || {}))
            .query(`
                INSERT INTO AgentMetrics (id, agentId, timestamp, cpuPercent, memoryPercent, diskPercent, networkIn, networkOut, customMetrics)
                VALUES (@id, @agentId, @timestamp, @cpuPercent, @memoryPercent, @diskPercent, @networkIn, @networkOut, @customMetrics)
            `);
        
        // Update agent heartbeat
        await pool.request()
            .input('agentId', sql.NVarChar, metricsData.agentId)
            .input('metadata', sql.NVarChar, JSON.stringify({ 
                cpuPercent: metricsData.cpuPercent,
                memoryPercent: metricsData.memoryPercent,
                diskPercent: metricsData.diskPercent
            }))
            .query(`UPDATE Agents SET lastHeartbeat = GETDATE(), metadata = @metadata WHERE id = @agentId`);
        
        return { success: true };
    } catch (error) {
        console.error('Metrics save failed:', error);
        return { success: false, error: error.message };
    }
});

// App lifecycle
app.whenReady().then(async () => {
    await clearChromiumCaches();
    createWindow();
    
    // Initialize auto-updater
    initializeAutoUpdater();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    app.quit();
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
