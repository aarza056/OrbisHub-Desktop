# OrbisHub Desktop - Project Documentation for Automation Testing

## Project Overview
OrbisHub Desktop is an Electron-based desktop application for managing remote connections (RDP/SSH) and internal messaging with SQL Server database backend.

---

## Technology Stack

### Frontend
- **Framework**: Electron (Chromium-based)
- **UI**: Vanilla JavaScript, HTML5, CSS3
- **Architecture**: Renderer process with contextBridge IPC

### Backend
- **Main Process**: Node.js (Electron main)
- **Database**: Microsoft SQL Server
- **ORM/Driver**: mssql (node-mssql)
- **Authentication**: Windows Authentication & SQL Server Authentication

### File Structure
```
OrbisDesktop/
├── main.js                 # Electron main process
├── preload.js             # IPC bridge (contextBridge)
├── package.json           # Dependencies and scripts
├── app/
│   ├── index.html         # Main HTML file
│   ├── app.js             # API fetch interceptor
│   ├── app-main.js        # Main application logic & UI
│   └── styles.css         # Application styles
├── assets/
│   ├── icon.ico2          # Application icon
│   └── old/               # Legacy assets
└── media/                 # Media resources
```

---

## Database Schema

### Database Configuration
- **Default Server**: `localhost` or custom server
- **Database Name**: Configurable (default: `OrbisHubDB`)
- **Authentication Types**: 
  - Windows Authentication (Integrated Security)
  - SQL Server Authentication (Username/Password)

### Tables

#### 1. Users Table
```sql
CREATE TABLE [dbo].[Users] (
    [Id] NVARCHAR(50) PRIMARY KEY,
    [Username] NVARCHAR(100) NOT NULL UNIQUE,
    [Password] NVARCHAR(255) NOT NULL,
    [Email] NVARCHAR(100),
    [CreatedAt] DATETIME DEFAULT GETDATE()
)
```

**Fields:**
- `Id`: Unique identifier (format: `user_<timestamp>_<random>`)
- `Username`: Unique username
- `Password`: Hashed password
- `Email`: User email address
- `CreatedAt`: Account creation timestamp

#### 2. Messages Table
```sql
CREATE TABLE [dbo].[Messages] (
    [Id] NVARCHAR(50) PRIMARY KEY,
    [SenderId] NVARCHAR(50) NOT NULL,
    [RecipientId] NVARCHAR(50) NULL,
    [Content] NVARCHAR(MAX),
    [SentAt] DATETIME DEFAULT GETDATE(),
    [Read] BIT DEFAULT 0,
    [HasAttachment] BIT DEFAULT 0,
    [AttachmentName] NVARCHAR(255) NULL,
    [AttachmentSize] INT NULL,
    [AttachmentType] NVARCHAR(100) NULL,
    [AttachmentData] VARBINARY(MAX) NULL,
    FOREIGN KEY ([SenderId]) REFERENCES [dbo].[Users]([Id]),
    FOREIGN KEY ([RecipientId]) REFERENCES [dbo].[Users]([Id])
)
```

**Fields:**
- `Id`: Unique message identifier (format: `msg_<timestamp>_<random>`)
- `SenderId`: User ID of sender (FK to Users)
- `RecipientId`: User ID of recipient, NULL for self-notes (FK to Users)
- `Content`: Message text content
- `SentAt`: Message send timestamp
- `Read`: Message read status (0 = unread, 1 = read)
- `HasAttachment`: Whether message has file attachment
- `AttachmentName`: Original filename
- `AttachmentSize`: File size in bytes
- `AttachmentType`: File extension (e.g., `.png`, `.pdf`)
- `AttachmentData`: Binary file data (VARBINARY)

**Indexes:**
- Primary Key on `Id`
- Foreign Keys on `SenderId` and `RecipientId`

---

## API Endpoints (Internal)

### Authentication

#### POST `/auth/login`
**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```
**Response:**
```json
{
  "success": true,
  "userId": "user_...",
  "username": "string"
}
```

#### POST `/auth/register`
**Request:**
```json
{
  "username": "string",
  "password": "string",
  "email": "string"
}
```
**Response:**
```json
{
  "success": true,
  "userId": "user_...",
  "username": "string"
}
```

### Users

#### GET `/users`
**Response:**
```json
{
  "success": true,
  "users": [
    {
      "Id": "user_...",
      "Username": "string",
      "Email": "string",
      "CreatedAt": "ISO8601 datetime"
    }
  ]
}
```

#### GET `/users/:userId`
**Response:**
```json
{
  "success": true,
  "user": {
    "Id": "user_...",
    "Username": "string",
    "Email": "string",
    "CreatedAt": "ISO8601 datetime"
  }
}
```

### Messages

#### POST `/messages`
**Request (Text Message):**
```json
{
  "senderId": "user_...",
  "recipientId": "user_..." | null,
  "content": "string",
  "hasAttachment": false
}
```

**Request (File Attachment):**
```json
{
  "senderId": "user_...",
  "recipientId": "user_..." | null,
  "content": "",
  "hasAttachment": true,
  "attachmentName": "filename.ext",
  "attachmentSize": 12345,
  "attachmentType": ".ext",
  "attachmentData": [byte array]
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "Id": "msg_...",
    "SenderId": "user_...",
    "RecipientId": "user_..." | null,
    "Content": "string",
    "SentAt": "ISO8601 datetime",
    "Read": 0
  }
}
```

#### GET `/messages?senderId=...&recipientId=...`
**Query Parameters:**
- `senderId`: Required - current user's ID
- `recipientId`: Optional - other user's ID (null for self-notes)

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "Id": "msg_...",
      "SenderId": "user_...",
      "SenderName": "string",
      "RecipientId": "user_..." | null,
      "Content": "string",
      "SentAt": "ISO8601 datetime",
      "Read": 0 | 1,
      "HasAttachment": 0 | 1,
      "AttachmentName": "string" | null,
      "AttachmentSize": 12345 | null,
      "AttachmentType": ".ext" | null
    }
  ]
}
```

---

## IPC Communication (Electron)

### Available IPC Channels

#### Database Configuration
- **Channel**: `db-get-config`
- **Parameters**: None
- **Returns**: Database configuration object

- **Channel**: `db-save-config`
- **Parameters**: `{ server, database, authType, user, password, encrypt, trustCert }`
- **Returns**: `{ success: boolean }`

- **Channel**: `db-test-connection`
- **Parameters**: Configuration object
- **Returns**: `{ success: boolean, error?: string }`

- **Channel**: `db-run-migrations`
- **Parameters**: Configuration object
- **Returns**: `{ success: boolean }`

#### Database Operations
- **Channel**: `db-query`
- **Parameters**: `(query: string, params?: array)`
- **Returns**: `{ success: boolean, data: array, error?: string }`

- **Channel**: `db-execute`
- **Parameters**: `(query: string, params?: array)`
- **Returns**: `{ success: boolean, rowsAffected: number, error?: string }`

**Parameter Format:**
```javascript
[
  { value: "paramValue" },
  { value: 123 },
  { value: Buffer.from([...]) } // For binary data
]
```

#### File Operations
- **Channel**: `select-file`
- **Parameters**: None
- **Returns**: 
```javascript
{
  canceled: false,
  filePath: "C:\\path\\to\\file.ext",
  fileName: "file.ext",
  fileSize: 12345,
  fileBuffer: Buffer,
  fileType: ".ext"
}
```

- **Channel**: `download-file`
- **Parameters**: `{ messageId: "msg_...", fileName: "file.ext" }`
- **Returns**: `{ success: boolean, filePath?: string, error?: string }`

---

## Features & Functionality

### 1. User Authentication
- Registration with username/password/email
- Login with username/password
- Session management (localStorage)
- Password hashing (bcrypt)

### 2. Direct Messaging
- Send text messages to other users
- Send messages to self (notes)
- Real-time message display
- Message read status tracking
- Conversation history

### 3. File Attachments
- **Upload**: Select files via dialog
- **Size Limit**: 3MB maximum
- **Storage**: VARBINARY in database
- **Supported Types**: All file types (images, documents, archives, media)
- **Download**: Save file dialog
- **Icons**: Visual file type indicators (🖼️ 📕 📘 📊 📙 📦 🎵 🎬 📄)

### 4. Emoji Picker
- 100 emojis in 10x10 grid
- Click to insert into message
- Categories: Faces, Gestures, Hearts, Animals, Objects

### 5. UI Components
- **Navigation**: Top bar with user menu
- **Tabs**: Direct Messages, Group Chats (placeholder)
- **User List**: Shows all registered users
- **Message View**: Chat-style message display
- **Input Area**: Message composer with emoji & attachment buttons
- **Toasts**: Success/error notifications

---

## File Size & Limits

### Constraints
- **Max File Size**: 3,145,728 bytes (3 MB)
- **Message Content**: NVARCHAR(MAX) (2GB theoretical, practical ~1GB)
- **Username**: Max 100 characters
- **Email**: Max 100 characters
- **Password**: Max 255 characters (hashed)
- **Attachment Filename**: Max 255 characters

---

## Application Flow

### Startup Sequence
1. Electron main process starts
2. Load database configuration from `userData/db-config.json`
3. Initialize database connection pool
4. Create main window (1400x900)
5. Load `app/index.html`
6. Initialize preload.js (IPC bridge)
7. Load app-main.js (UI logic)
8. Check for existing login session
9. Show login/main screen

### Message Send Flow
1. User types message or selects file
2. Click send button
3. Frontend validates input
4. For files: Read file as buffer, check size
5. Call API endpoint via fetch() interceptor
6. app.js intercepts and routes to IPC
7. Main process receives IPC call
8. Convert array to Buffer (for files)
9. Execute SQL INSERT with parameters
10. Return success/error to renderer
11. Reload messages to show new message

### Message Load Flow
1. User selects conversation
2. Frontend requests messages via API
3. SQL SELECT with JOIN to get sender names
4. Return messages with ISNULL() for attachment columns
5. Frontend formats each message
6. Render HTML with file attachments as clickable divs
7. Attach event listeners for downloads

### File Download Flow
1. User clicks file attachment
2. Event delegation captures click
3. Extract messageId and fileName from data attributes
4. Call downloadFile() function
5. IPC call to main process
6. Query database for AttachmentData
7. Show save dialog to user
8. Write Buffer to selected file path
9. Show success toast

---

## Testing Scenarios

### Authentication Tests
1. **Register new user** - Valid credentials
2. **Register duplicate** - Username already exists (should fail)
3. **Login valid** - Correct credentials
4. **Login invalid** - Wrong password (should fail)
5. **Session persistence** - Refresh app, should stay logged in

### Messaging Tests
1. **Send text message** - To another user
2. **Send self-note** - RecipientId = null
3. **Send empty message** - Should be prevented
4. **Load conversation** - Between two users
5. **Load self-notes** - RecipientId = null
6. **Message ordering** - Should be chronological

### File Attachment Tests
1. **Upload small file** - < 3MB (should succeed)
2. **Upload large file** - > 3MB (should fail with toast)
3. **Upload image** - PNG/JPG (check icon)
4. **Upload document** - PDF/DOCX (check icon)
5. **Download file** - Save to disk
6. **Verify file integrity** - Compare checksums
7. **Multiple attachments** - In same conversation

### Database Tests
1. **Connection test** - Valid config
2. **Connection failure** - Invalid server
3. **Query execution** - SELECT users
4. **Insert operation** - New message
5. **Update operation** - Mark message as read
6. **Foreign key constraint** - Invalid SenderId (should fail)

### UI Tests
1. **Login screen display**
2. **Main screen navigation**
3. **User list population**
4. **Message display formatting**
5. **Emoji picker interaction**
6. **File attachment display**
7. **Toast notifications**
8. **Tab switching**

---

## Error Handling

### Common Errors
- **Database Connection**: "Failed to connect to database"
- **Invalid Credentials**: "Invalid username or password"
- **Duplicate User**: "Username already exists"
- **File Too Large**: "File size exceeds 3MB limit"
- **File Not Found**: "Message not found in database"
- **No Attachment**: "Message has no attachment"
- **SQL Errors**: Logged to console with query details

---

## Security Considerations

### Current Implementation
- Password hashing with bcrypt
- SQL parameterized queries (prevents injection)
- Context isolation enabled (Electron)
- No direct Node.js access in renderer
- File size validation before upload

### Recommendations for Testing
- Test SQL injection attempts
- Test XSS in message content
- Test file upload exploits
- Test session hijacking scenarios
- Test path traversal in file downloads

---

## Automation Testing Checklist

### Setup
- [ ] SQL Server installed and running
- [ ] Database created and migrated
- [ ] Test users created in Users table
- [ ] Application builds successfully (`npm start`)

### Database Tests
- [ ] Connection pooling works
- [ ] CRUD operations for Users
- [ ] CRUD operations for Messages
- [ ] Foreign key constraints enforced
- [ ] Attachment columns handle NULL properly
- [ ] Binary data stored/retrieved correctly

### API Tests
- [ ] All endpoints return correct status
- [ ] Request validation works
- [ ] Error responses are consistent
- [ ] Large payloads handled (attachments)

### File Tests
- [ ] File selection dialog works
- [ ] Files < 3MB upload successfully
- [ ] Files > 3MB rejected
- [ ] All file types supported
- [ ] Binary data integrity verified
- [ ] Download saves correct file
- [ ] Downloaded file matches original

### UI Tests
- [ ] All screens render properly
- [ ] Navigation works
- [ ] Forms submit correctly
- [ ] Error messages display
- [ ] Success toasts appear
- [ ] Message history loads
- [ ] File attachments clickable

### Performance Tests
- [ ] Multiple concurrent connections
- [ ] Large message history (1000+ messages)
- [ ] Multiple file uploads in succession
- [ ] Database query performance
- [ ] Memory usage under load

---

## Configuration Files

### package.json Dependencies
```json
{
  "electron": "^latest",
  "mssql": "^latest",
  "bcrypt": "^latest"
}
```

### Database Config Format (userData/db-config.json)
```json
{
  "server": "localhost",
  "database": "OrbisHubDB",
  "authType": "windows",
  "user": "",
  "password": "",
  "encrypt": false,
  "trustCert": true
}
```

---

## Sample Test Data

### Test Users
```sql
INSERT INTO [dbo].[Users] (Id, Username, Password, Email, CreatedAt)
VALUES 
('user_test1', 'testuser1', '$2b$10$...hashed...', 'test1@example.com', GETDATE()),
('user_test2', 'testuser2', '$2b$10$...hashed...', 'test2@example.com', GETDATE());
```

### Test Messages
```sql
INSERT INTO [dbo].[Messages] (Id, SenderId, RecipientId, Content, SentAt, [Read], HasAttachment)
VALUES 
('msg_test1', 'user_test1', 'user_test2', 'Hello from test1!', GETDATE(), 0, 0),
('msg_test2', 'user_test2', 'user_test1', 'Hi test1!', GETDATE(), 0, 0);
```

---

## Build & Run Commands

### Development
```bash
npm install
npm start
```

### Build for Production
```bash
npm run build  # (if configured)
```

### Run Tests
```bash
npm test  # (if configured)
```

---

## Known Issues & Limitations

1. **Real-time Updates**: Messages don't auto-refresh (requires manual reload)
2. **Group Chat**: UI exists but functionality not implemented
3. **Read Status**: Not automatically updated when viewing messages
4. **File Preview**: No preview before download
5. **Search**: No message search functionality
6. **Pagination**: All messages loaded at once (performance concern for large histories)

---

## Version History

### Current Version
- User authentication with bcrypt
- Direct messaging
- Self-notes
- File attachments (database storage)
- Emoji picker
- 3MB file size limit
- SQL Server integration

---

## Contact & Support

For automation testing questions, refer to this documentation or examine the source code in:
- `/app/app-main.js` - Main UI logic
- `/app/app.js` - API interceptor
- `/main.js` - Electron main process
- `/preload.js` - IPC bridge

---

**Last Updated**: November 15, 2025
