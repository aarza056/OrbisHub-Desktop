# Password Manager - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OrbisHub Desktop                         │
│                    (Electron App)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌──────────────┐                      ┌──────────────┐
│   Frontend   │                      │   Backend    │
│   (UI Layer) │                      │  (Service)   │
└──────────────┘                      └──────────────┘
        │                                       │
        │                                       │
        ▼                                       ▼
┌──────────────────────────────┐    ┌──────────────────────────┐
│   password-ui.js             │    │   password-service.js    │
│   - Event handlers           │    │   - CRUD operations      │
│   - Rendering                │    │   - Encryption           │
│   - User interactions        │    │   - Validation           │
│   - Modal management         │    │   - Audit logging        │
│   - Password generation      │    │                          │
│   - Clipboard operations     │    │                          │
└──────────────────────────────┘    └──────────────────────────┘
        │                                       │
        │                                       │
        ▼                                       ▼
┌──────────────────────────────────────────────────────────────┐
│                        DB Service (window.DB)                 │
│                   - Query execution                          │
│                   - Connection management                    │
└──────────────────────────────────────────────────────────────┘
                            │
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   SQL Server Database                        │
│                                                              │
│   ┌──────────────────┐  ┌──────────────────┐               │
│   │ PasswordEntries  │  │PasswordCategories│               │
│   ├──────────────────┤  ├──────────────────┤               │
│   │ id               │  │ id               │               │
│   │ name             │  │ name             │               │
│   │ username         │  │ color            │               │
│   │ password_enc     │  │ icon             │               │
│   │ url              │  └──────────────────┘               │
│   │ notes            │                                       │
│   │ category         │  ┌──────────────────┐               │
│   │ tags             │  │PasswordAccessLog │               │
│   │ created_by       │  ├──────────────────┤               │
│   │ created_at       │  │ id               │               │
│   │ updated_at       │  │ password_entry_id│               │
│   │ last_accessed    │  │ user_id          │               │
│   │ is_favorite      │  │ action           │               │
│   └──────────────────┘  │ accessed_at      │               │
│                         └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Creating a Password

```
User Action → UI Event → Service Method → Encryption → Database → Response → UI Update

1. User clicks "Add Password"
2. passwordUI.openPasswordModal() - Shows modal
3. User fills form and clicks "Create"
4. passwordUI.savePassword() - Validates form
5. passwordService.createPassword() - Encrypts password
6. DB.query() - Inserts into PasswordEntries
7. passwordService.logPasswordAccess() - Logs 'create' action
8. passwordUI.loadPasswords() - Refreshes list
9. passwordUI.showToast() - Success message
```

### 2. Viewing a Password

```
User Click → Load Details → Decrypt → Render → Log Access

1. User clicks password in list
2. passwordUI.loadPasswordDetail(id)
3. passwordService.getPassword(id)
4. DB.query() - Fetches from database
5. passwordService.simpleDecrypt() - Decrypts password
6. passwordService.logPasswordAccess() - Logs 'view' action
7. DB.query() - Updates last_accessed
8. passwordUI.renderPasswordDetail() - Shows details
```

### 3. Copying to Clipboard

```
User Click → Copy → Log → Feedback

1. User clicks copy button
2. passwordUI.copyToClipboard(text, button)
3. navigator.clipboard.writeText(text)
4. passwordService.logPasswordAccess() - Logs 'copy' action
5. Button shows checkmark (visual feedback)
6. passwordUI.showToast() - "Copied to clipboard"
```

### 4. Searching Passwords

```
User Types → Filter → Re-render

1. User types in search box
2. passwordUI.setupEventListeners() - Captures input
3. passwordUI.filterPasswords() - Client-side filtering
4. passwordUI.renderPasswordList() - Updates display
   (No database query - uses cached data)
```

## Component Interaction

```
┌─────────────────────────────────────────────────────────────┐
│                        index.html                            │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Navigation Menu                                    │    │
│  │  - "Password Manager" button (data-view="passwords")│    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  View Section (id="view-passwords")                │    │
│  │                                                      │    │
│  │  ┌──────────────┐  ┌─────────────────────────┐    │    │
│  │  │   Sidebar    │  │    Main Content         │    │    │
│  │  │              │  │                         │    │    │
│  │  │ - Search     │  │  - Header               │    │    │
│  │  │ - Categories │  │  - Password Details     │    │    │
│  │  │ - List       │  │  - Actions              │    │    │
│  │  └──────────────┘  └─────────────────────────┘    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Stylesheets                                        │    │
│  │  - password-ui.css                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Scripts (loaded in order)                         │    │
│  │  1. app.js (DB service)                           │    │
│  │  2. password-service.js (Backend)                 │    │
│  │  3. password-ui.js (Frontend)                     │    │
│  │  4. app-main.js (View router)                     │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Initialization Flow

```
Page Load
    │
    ▼
window.DB initialized (app.js)
    │
    ▼
window.PasswordService initialized (password-service.js)
    │
    ├─► initializeEncryption()
    │   └─► Generates session-based encryption key
    │
    ▼
window.PasswordUI initialized (password-ui.js)
    │
    ▼
User clicks "Password Manager"
    │
    ▼
app-main.js → showView('passwords')
    │
    ▼
window.PasswordUI.init()
    │
    ├─► loadCategories()
    │   └─► Fetches from PasswordCategories table
    │
    ├─► loadPasswords()
    │   └─► Fetches from PasswordEntries table
    │
    ├─► setupEventListeners()
    │   └─► Binds event handlers
    │
    ▼
Password Manager Ready
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Security Layers                            │
│                                                              │
│  1. Session-Based Encryption Key                           │
│     - Generated from user session (user ID + username)      │
│     - Unique per session                                     │
│     - Stored in memory only                                 │
│                                                              │
│  2. Encryption Process                                      │
│     Plain Text → XOR with Key → Base64 Encode → Encrypted  │
│                                                              │
│  3. Decryption Process                                      │
│     Encrypted → Base64 Decode → XOR with Key → Plain Text  │
│                                                              │
│  4. Database Storage                                        │
│     - Passwords stored encrypted                            │
│     - Never stored in plain text                            │
│                                                              │
│  5. Audit Trail                                             │
│     - All access logged (view, copy, edit, delete, create)  │
│     - User identification                                    │
│     - Timestamp tracking                                    │
│                                                              │
│  6. Client-Side Security                                    │
│     - Password masking by default                           │
│     - Clipboard access logged                               │
│     - No password transmission over network                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## State Management

```
┌─────────────────────────────────────────────────────────────┐
│                    Application State                         │
│                                                              │
│  Global Variables (password-ui.js)                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │ currentFilter = {                                   │    │
│  │   category: null,                                   │    │
│  │   search: '',                                       │    │
│  │   favorites: false                                  │    │
│  │ }                                                   │    │
│  │                                                      │    │
│  │ currentPassword = null   // Selected password       │    │
│  │ allPasswords = []        // Cached password list    │    │
│  │ categories = []          // Available categories    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Global Variables (password-service.js)                     │
│  ┌────────────────────────────────────────────────────┐    │
│  │ encryptionKey = null     // Session encryption key  │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Error Handling

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Flow                                │
│                                                              │
│  Try-Catch Blocks                                           │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Service Layer (password-service.js)                │    │
│  │  - Returns { success: false, error: message }      │    │
│  │  - Logs errors to console                          │    │
│  │  - Graceful degradation                            │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ UI Layer (password-ui.js)                          │    │
│  │  - Catches service errors                          │    │
│  │  - Shows user-friendly error messages              │    │
│  │  - Uses showToast() for notifications              │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Performance Optimization

```
┌─────────────────────────────────────────────────────────────┐
│                Performance Strategies                        │
│                                                              │
│  1. Client-Side Filtering                                   │
│     - Passwords loaded once                                 │
│     - Search/filter happens in memory                       │
│     - No database query per keystroke                       │
│                                                              │
│  2. Database Indexes                                        │
│     - IX_PasswordEntries_Name                              │
│     - IX_PasswordEntries_Category                          │
│     - IX_PasswordEntries_CreatedBy                         │
│                                                              │
│  3. Lazy Loading                                            │
│     - Password details loaded on click                      │
│     - Not all passwords decrypted at once                   │
│                                                              │
│  4. Event Delegation                                        │
│     - Single listener for password list                     │
│     - Uses event.target to identify clicks                  │
│                                                              │
│  5. Minimal DOM Updates                                     │
│     - Batch rendering                                       │
│     - innerHTML for large lists                             │
│     - Targeted updates for small changes                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Extension Points

```
┌─────────────────────────────────────────────────────────────┐
│              Future Enhancement Hooks                        │
│                                                              │
│  1. Encryption Upgrade                                      │
│     Location: password-service.js                           │
│     Functions: simpleEncrypt(), simpleDecrypt()            │
│     Replace with: Web Crypto API (AES-256-GCM)             │
│                                                              │
│  2. Import/Export                                           │
│     Location: password-service.js (new functions)           │
│     Add: importPasswords(), exportPasswords()              │
│                                                              │
│  3. Password Sharing                                        │
│     Location: password-schema.sql (new table)               │
│     Add: PasswordShares table                              │
│                                                              │
│  4. Password Expiration                                     │
│     Location: password-schema.sql (add column)              │
│     Add: expires_at column, notification system            │
│                                                              │
│  5. Browser Extension                                       │
│     Location: New extension folder                          │
│     Integration: Message passing with Electron             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
