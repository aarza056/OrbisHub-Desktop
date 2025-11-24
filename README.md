# OrbisHub Desktop

**Comprehensive DevOps management platform for Remote Desktop connections, server monitoring, and team collaboration**

## 🎯 Overview

OrbisHub Desktop is a full-featured desktop application built with Electron that provides enterprise-grade remote access management, server monitoring, audit logging, and team messaging capabilities. Designed for DevOps teams and system administrators to efficiently manage infrastructure and collaborate securely.

## ✨ Core Features

### 🖥️ Remote Desktop Management
- **Native RDP Connections** - Direct mstsc.exe launching for Windows servers
- **SSH/PuTTY Integration** - Seamless SSH connections to Linux servers via PuTTY
- **Credential Vault** - Secure encrypted credential storage with AES-256 encryption
- **Server Inventory** - Complete server catalog with health monitoring and grouping
- **Connection History** - Track all remote access sessions with audit logs

### 🌐 Environment Management
- **Multi-Environment Support** - Manage Dev, QA, UAT, Production environments
- **Server Mapping** - Associate servers with environments for organized access
- **Health Monitoring** - Real-time environment status tracking
- **Uptime Tracking** - Monitor server uptime across Windows and Linux systems
- **URL Management** - Quick access to environment web interfaces

### 🔐 Security & Authentication
- **User Management** - Multi-user support with role-based access (Admin/Viewer)
- **Password Policies** - Enforced strong password requirements
- **Password Hashing** - PBKDF2 hashing with salt for secure storage
- **Session Management** - Auto-logout after 10 minutes of inactivity
- **Account Lockout** - Protection against brute force attacks (5 failed attempts)
- **Change Password on Login** - Force password change for new/reset accounts
- **Activity Tracking** - Monitor user sessions and last activity timestamps

### 📊 Audit & Compliance
- **Comprehensive Audit Logs** - Track all system actions (create, update, delete, connect)
- **User Activity Tracking** - Monitor who did what and when
- **IP Address Logging** - Record source IP for all actions
- **Advanced Filtering** - Search by action type, entity, user, or keyword
- **Pagination Support** - Efficiently browse large audit log datasets
- **Export Capabilities** - Extract audit data for compliance reporting

### 💬 Team Messaging
- **Direct Messaging** - Secure peer-to-peer communication between users
- **Message Encryption** - AES-256-CBC encryption for all messages
- **File Attachments** - Share files securely via encrypted database storage
- **Unread Notifications** - Real-time desktop notifications for new messages
- **Read Receipts** - Track message read status
- **Message History** - Persistent conversation storage

### 🗄️ Database Management
- **SQL Server Integration** - Native Microsoft SQL Server connectivity
- **Windows Authentication** - Seamless integration with Active Directory
- **SQL Authentication** - Support for SQL Server logins
- **Database Schema Builder** - Automated table creation and migrations
- **Connection Pooling** - Efficient database connection management
- **Trust Certificate** - Support for self-signed certificates

### 🔧 Integration & Automation
- **External System Integration** - Connect to Exchange Server, SharePoint, etc.
- **Connection Testing** - Validate integration endpoints
- **Credential Mapping** - Associate credentials with external systems
- **Deployment Automation** - Integrated deployment credential management

### 📈 Monitoring & Diagnostics
- **Server Health Checks** - ICMP ping and TCP port probing
- **Connectivity Testing** - Multi-port fallback for reliable detection
- **Uptime Reporting** - WMI/CIM queries for Windows, /proc/uptime for Linux
- **Network Diagnostics** - Detailed connection troubleshooting information

### 🔄 Auto-Update System
- **GitHub Releases Integration** - Automatic update detection
- **Background Downloads** - Non-intrusive update installation
- **Version Management** - Track current and available versions
- **Update Notifications** - User-controlled update process
- **Rollback Support** - Safe update installation with automatic fallback

### 🎨 User Interface
- **Modern Design** - Clean, intuitive interface with dark theme
- **Responsive Layout** - Adaptive UI for different screen sizes
- **Toast Notifications** - Non-intrusive success/error messages
- **Modal Dialogs** - Context-aware action confirmations
- **Real-time Updates** - Live data refresh and notifications
- **Card Locking** - Prevent accidental deletion of critical resources

## 📋 Detailed Feature Breakdown

### Server Management
- Add/Edit/Delete servers with validation
- Group servers by categories (Database, Web, Application, etc.)
- Server types: Windows (RDP), Linux (SSH)
- Health status indicators (Online/Offline)
- Connection history and tracking
- Credential assignment per server
- Bulk operations support

### Credential Management
- Username/Password credential storage
- Domain support for Windows authentication
- Encrypted storage in SQL Server
- Credential usage tracking
- Protection against deletion when in use
- Audit trail for all credential operations

### Environment Management
- Environment types: Development, QA, UAT, Production, Staging
- Custom color coding for visual organization
- Server mapping and association
- Environment health status monitoring
- Quick URL access to environment portals
- Deployment credential integration

### User Administration
- User creation with full profile support
- Role-based permissions (Admin/Viewer)
- Position and squad/team assignment
- Password policy enforcement:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character
- Force password change on first login
- Account lockout after 5 failed attempts (10-minute lockout)
- Session timeout after 10 minutes of inactivity
- User activity tracking and online status

### Audit System
- Action tracking: create, update, delete, connect, login, logout
- Entity types: user, server, credential, environment, integration
- Old vs new value comparison for updates
- IP address and timestamp logging
- Advanced search and filtering
- Pagination for large datasets (customizable page size)
- Export functionality for compliance

### Messaging System
- One-on-one messaging between users
- AES-256-CBC encrypted message content
- File attachment support (stored in database)
- Attachment types: images, documents, archives
- File download capability
- Unread message counter
- Real-time message polling (2-second intervals)
- Desktop notifications for new messages
- Message read status tracking

### Database Features
- Automatic schema creation and migrations
- Connection testing before setup
- Support for multiple SQL Server instances
- Database creation wizard
- Table structure validation
- Index optimization
- Connection pooling for performance
- Error handling and recovery

### Monitoring Capabilities
- **Windows Servers:**
  - WMI/CIM queries for uptime
  - Get-WmiObject fallback support
  - WMIC legacy support
  - PowerShell remoting capabilities
  
- **Linux Servers:**
  - /proc/uptime parsing via SSH
  - PuTTY plink integration
  - SSH key authentication support
  
- **Network Testing:**
  - ICMP ping checks
  - TCP port connectivity (3389, 22, 5985, 445, 80)
  - Multi-port fallback mechanism
  - Timeout handling and error reporting

### Integration Management
- External system connections (Exchange, SharePoint, etc.)
- Connection string storage
- Integration testing
- Credential mapping
- Description and metadata storage

## 🚀 Installation

### Prerequisites
- Windows 10/11 or Windows Server 2016+
- Microsoft SQL Server (Express, Standard, or Enterprise)
- .NET Framework 4.7.2+ (for RDP client)
- PuTTY (optional, for Linux SSH connections)

### First-Time Setup

1. **Download and Install**
   ```powershell
   # Download the latest release from GitHub
   # Run the installer (OrbisHub-Desktop-Setup.exe)
   ```

2. **Database Configuration Wizard**
   - On first launch, the setup wizard guides you through:
     - SQL Server connection setup
     - Database creation (or connect to existing)
     - Schema migration and table creation
     - Initial admin user creation

3. **Connect to SQL Server**
   - Server address: `localhost\SQLEXPRESS` or your server name
   - Choose authentication method:
     - **Windows Authentication** (recommended for domain environments)
     - **SQL Server Authentication** (username/password)
   - Test connection before proceeding

4. **Create Database**
   - Wizard automatically creates database if it doesn't exist
   - Runs migrations to create all required tables:
     - Users
     - Environments
     - Servers
     - Credentials
     - AuditLogs
     - Messages
   - Sets up indexes and relationships

5. **Initial Login**
   - Default admin user is created during setup
   - Change password on first login (enforced)

### Development Mode

```powershell
# Clone the repository
git clone https://github.com/aarza056/OrbisHub-Desktop.git
cd OrbisHub-Desktop

# Install dependencies
npm install

# Run in development mode
npm start
```

### Building Installer

```powershell
# Build Windows installer with electron-builder
npm run build:win

# Installer will be created in dist/ folder
# Output: OrbisHub-Desktop-Setup-{version}.exe
```

## 🗂️ Project Structure

```
OrbisHub-Desktop/
├── main.js                 # Electron main process (IPC handlers, DB, RDP/SSH)
├── preload.js             # IPC bridge (secure context isolation)
├── package.json           # Dependencies & build configuration
├── app/
│   ├── index.html         # Main UI markup
│   ├── styles.css         # Application styles (dark theme)
│   ├── app.js             # Electron-specific API adapters
│   ├── app-main.js        # Core application logic
│   ├── services/          # Business logic modules
│   │   ├── audit.js       # Audit logging service
│   │   ├── data.js        # Data synchronization service
│   │   ├── db.js          # Database query wrapper
│   │   ├── entities.js    # Entity CRUD operations
│   │   └── messages.js    # Messaging system
│   ├── utils/
│   │   └── toast.js       # Toast notification manager
│   └── views/
│       └── environments.js # Environment rendering logic
├── assets/
│   ├── icon.ico           # Application icon
│   └── media/             # Logos and images
├── AutomationTests/       # C# automation test suite
│   ├── CredentialTester.cs
│   ├── DatabaseTester.cs
│   ├── EnvironmentTester.cs
│   ├── MessageTester.cs
│   ├── ServerTester.cs
│   └── UserTester.cs
└── database/
    └── ADD_PIPELINE_TABLES.sql  # SQL schema scripts
```

## ⚙️ Configuration

### Database Configuration
Stored in: `%APPDATA%\orbis-desktop\db-config.json`

```json
{
  "server": "localhost\\SQLEXPRESS",
  "database": "OrbisHub",
  "authType": "windows",
  "encrypt": false,
  "trustCert": true,
  "connected": true
}
```

### Application Settings
- Session timeout: 10 minutes
- Session warning: 8 minutes (2 minutes before logout)
- Account lockout: 5 failed login attempts
- Lockout duration: 10 minutes
- Message polling interval: 2 seconds
- Database connection pool: max 10 connections

## 🔑 Usage Guide

### Connecting to Servers

**Windows (RDP):**
1. Navigate to Servers tab
2. Click "+ Add Server"
3. Fill in details:
   - Display Name
   - Hostname
   - IP Address
   - Type (Database, Web, etc.)
   - OS: Windows
   - Server Group
4. Assign a credential from the vault
5. Click "Connect" to launch RDP session

**Linux (SSH):**
1. Add server with OS set to "Linux"
2. Assign SSH credential (username/password)
3. Ensure PuTTY is installed (C:\Program Files\PuTTY\putty.exe)
4. Click "Connect" to launch SSH session
5. Fallback to Windows OpenSSH if PuTTY not found

### Managing Credentials

1. Go to Credentials tab
2. Click "+ Add Credential"
3. Enter:
   - Name (e.g., "Production Admin")
   - Type (Username/Password, SSH Key, etc.)
   - Username
   - Password (encrypted with AES-256)
   - Domain (optional, for Windows)
   - Description
4. Credentials are encrypted before storage
5. Assign to servers/environments as needed

### Environment Management

1. Navigate to Environments tab
2. Click "+ Add Environment"
3. Configure:
   - Name (e.g., "Production")
   - Type (Development, QA, UAT, Production, Staging)
   - URL (environment portal address)
   - Color (for visual organization)
   - Description
4. Map servers to environment
5. Assign deployer credentials
6. Monitor health status and uptime

### Sending Messages

1. Click Messages icon in top navigation
2. Select user from contacts list
3. Type message in input field
4. Attach files (optional):
   - Click attachment icon
   - Select file (max size based on SQL Server settings)
   - File is encrypted and stored in database
5. Press Enter or click Send
6. Messages are encrypted end-to-end
7. Receive desktop notifications for new messages

### Viewing Audit Logs

1. Go to Admin panel
2. Click "Audit Logs" tab
3. Use filters:
   - Search by keyword
   - Filter by action (create, update, delete, connect, login)
   - Filter by entity type (user, server, credential, etc.)
4. Pagination controls:
   - Change page size (7, 10, 25, 50 entries)
   - Navigate pages
   - Jump to first/last page
5. Review details:
   - User who performed action
   - Timestamp and IP address
   - Old vs new values (for updates)

### User Administration

**Creating Users:**
1. Admin panel → Users tab
2. Click "+ Add User"
3. Fill in user details:
   - Full Name
   - Username (unique)
   - Email
   - Password (must meet policy)
   - Position & Squad
   - Role (Admin/Viewer)
4. Option: Force password change on first login
5. User receives encrypted password in database

**Managing Users:**
- Edit user details (except username)
- Reset passwords
- Change roles
- View last login and activity
- Unlock locked accounts
- Monitor online/offline status
- Delete users (with confirmation)

### Auto-Updates

1. App checks for updates on startup and every 4 hours
2. Notification appears when update is available
3. Click "Download Update" to begin
4. Progress shown during download
5. Click "Install Update" when ready
6. App restarts and applies update
7. Rollback automatic if update fails

## 🔐 Security Features

### Encryption
- **Password Hashing:** PBKDF2 with 10,000 iterations and SHA-512
- **Message Encryption:** AES-256-CBC with random IV per message
- **Credential Storage:** Encrypted in SQL Server database
- **Secure IPC:** Context isolation with preload script
- **No Plain Text:** All sensitive data encrypted at rest

### Authentication & Authorization
- **Multi-User Support:** Separate accounts per user
- **Role-Based Access:** Admin vs Viewer permissions
- **Password Policies:** Enforced complexity requirements
- **Session Management:** Auto-logout after inactivity
- **Account Lockout:** Brute force protection
- **Activity Tracking:** Monitor user sessions and actions

### Network Security
- **SQL Server Encryption:** Optional TLS/SSL support
- **Trusted Certificates:** Self-signed certificate support
- **IP Logging:** Track source IP for all actions
- **Local Network:** No external API calls (data stays local)

### Audit & Compliance
- **Complete Audit Trail:** All actions logged
- **User Attribution:** Track who did what and when
- **IP Address Logging:** Source tracking for compliance
- **Change History:** Before/after values for updates
- **Immutable Logs:** Audit logs preserved in database

## 🛠️ Technical Architecture

### Technology Stack
- **Frontend:** Electron, HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js, mssql driver for SQL Server
- **Database:** Microsoft SQL Server (Express/Standard/Enterprise)
- **Security:** Node crypto module (AES-256, PBKDF2)
- **Updates:** electron-updater with GitHub Releases
- **Build:** electron-builder for Windows installers

### Database Schema

**Users Table:**
- id, username, password (hashed), name, email, role
- position, squad, lastLogin, lastActivity, ip
- isActive, changePasswordOnLogin
- failedLoginAttempts, lockedUntil, lastFailedLogin

**Servers Table:**
- id, name, host, port, environment_id, credential_id
- description, status, created_at

**Environments Table:**
- id, name, type, url, health
- deployerCredentialId, mappedServers (JSON)
- description, color, created_at

**Credentials Table:**
- id, name, username, password (encrypted)
- domain, description, created_at

**Messages Table:**
- Id, SenderId, RecipientId, Content (encrypted)
- SentAt, Read, HasAttachment
- AttachmentName, AttachmentSize, AttachmentType
- AttachmentData (VARBINARY)

**AuditLogs Table:**
- id, action, entityType, entityName
- user, username, timestamp, ip, details (JSON)

### IPC Architecture
```
Renderer Process (app.js)
    ↕ IPC (preload.js)
Main Process (main.js)
    ↕ mssql driver
SQL Server Database
```

### Security Model
- **Context Isolation:** Enabled (Electron security best practice)
- **Node Integration:** Disabled in renderer
- **Preload Script:** Controlled IPC bridge
- **CSP:** Content Security Policy enforced
- **No eval():** No dynamic code execution

## 📦 Building & Deployment

### Building from Source
```powershell
# Install dependencies
npm install

# Development mode with DevTools
npm start

# Build production installer
npm run build:win

# Output: dist/OrbisHub-Desktop-Setup-{version}.exe
```

### electron-builder Configuration
```json
{
  "build": {
    "appId": "com.orbis.desktop",
    "productName": "OrbisHub Desktop",
    "win": {
      "target": ["nsis"],
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  }
}
```

### Publishing Updates
1. Create new GitHub Release
2. Tag with version (e.g., v1.1.1)
3. Attach built installer (.exe)
4. electron-updater automatically detects new release
5. Users notified in-app to download update

## 🧪 Testing

### Automated Tests (C# - AutomationTests/)
- **UserTester:** User CRUD, authentication, lockout
- **CredentialTester:** Credential management, encryption
- **ServerTester:** Server operations, health checks
- **EnvironmentTester:** Environment management, mapping
- **MessageTester:** Messaging, encryption, attachments
- **DatabaseTester:** Schema validation, connections

### Manual Testing
1. Launch app in development mode
2. Test database setup wizard
3. Create users with different roles
4. Add servers and credentials
5. Test RDP/SSH connections
6. Send messages with attachments
7. Review audit logs
8. Test session timeout and lockout
9. Verify auto-update flow

## 🐛 Troubleshooting

### Database Connection Issues
- **Error:** "Login failed for user"
  - Solution: Check Windows/SQL authentication settings
  - Verify user has db_owner role on database

- **Error:** "Certificate chain not trusted"
  - Solution: Enable "Trust Server Certificate" in setup

- **Error:** "Database does not exist"
  - Solution: Use wizard to create database first

### RDP Connection Issues
- **Error:** "Connection failed"
  - Check server IP/hostname is correct
  - Verify port 3389 is accessible
  - Ensure credential is assigned to server
  - Check Windows Firewall settings

### SSH Connection Issues
- **Error:** "PuTTY not found"
  - Install PuTTY to C:\Program Files\PuTTY\
  - Or use Windows OpenSSH (fallback)

- **Error:** "Authentication failed"
  - Verify SSH credential username/password
  - Check SSH server allows password authentication

### Session & Login Issues
- **Error:** "Account locked"
  - Wait 10 minutes or admin can unlock
  - Check failedLoginAttempts in database

- **Error:** "Session expired"
  - Auto-logout after 10 min inactivity
  - Just log in again

### Performance Issues
- **Slow queries:**
  - Check database indexes
  - Audit logs table may be large (cleanup periodically)
  - Connection pool may be exhausted

- **High memory usage:**
  - Clear browser cache (F12 → DevTools → Application)
  - Restart application
  - Check for memory leaks in renderer process

## 📝 Changelog

### Version 1.1.1
- Added message encryption (AES-256-CBC)
- Implemented file attachment support
- Added real-time message notifications
- Enhanced audit logging with old/new values
- Improved session management with warnings
- Account lockout protection
- Password policy enforcement
- Database migration wizard improvements

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - See LICENSE file for details

## 👥 Authors

- **OrbisHub Team** - *Initial work and development*

## 🙏 Acknowledgments

- Microsoft SQL Server team for mssql driver
- Electron community for framework and tools
- electron-builder for packaging solution
- PuTTY team for SSH client integration

## 📞 Support

For issues, questions, or feature requests:
- Open an issue on GitHub
- Check existing documentation
- Review troubleshooting guide above

---

**Built with ❤️ by Admins, For Admins**
