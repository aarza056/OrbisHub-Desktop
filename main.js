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

        // Validate that we have a password
        if (!password) {
            return { success: false, error: 'No password found in credential' };
        }

        // Create temporary RDP file
        const tempDir = os.tmpdir();
        const fileName = `orbis_${server.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.rdp`;
        const filePath = path.join(tempDir, fileName);

        // Write RDP content to temp file
        fs.writeFileSync(filePath, rdpContent, 'utf8');

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
                    [LastSeenUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
                    [CreatedUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
                    [Metadata] NVARCHAR(MAX) NULL
                );

                CREATE INDEX IX_Agents_MachineName ON [dbo].[Agents]([MachineName]);
                CREATE INDEX IX_Agents_LastSeenUtc ON [dbo].[Agents]([LastSeenUtc]);
            END
        `);
        migrations.push('Agents table created');
        
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
        // Format the email body
        const emailBody = `
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

Operating System: ${bugData.systemInfo.os}
App Version: ${bugData.systemInfo.appVersion}
Electron Version: ${bugData.systemInfo.electronVersion || 'N/A'}
Node Version: ${bugData.systemInfo.nodeVersion || 'N/A'}
Total Memory: ${bugData.systemInfo.totalMemory || 'N/A'}
Free Memory: ${bugData.systemInfo.freeMemory || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This bug report was automatically generated by OrbisHub Desktop.
        `.trim();

        // Create mailto link with subject and body
        const subject = encodeURIComponent(`[OrbisHub Bug] [${bugData.severity}] ${bugData.title}`);
        const body = encodeURIComponent(emailBody);
        const mailto = `mailto:development@orbis-hub.com?subject=${subject}&body=${body}`;

        // Open default email client
        await shell.openExternal(mailto);

        console.log('Bug report email composed successfully');
        
        return {
            success: true,
            message: 'Bug report email opened in your default email client'
        };
    } catch (error) {
        console.error('Failed to submit bug report:', error);
        return {
            success: false,
            error: error.message || 'Failed to open email client'
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
