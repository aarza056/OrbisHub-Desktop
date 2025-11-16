# OrbisHub Desktop - Release Commands

## Prerequisites

### 1. Set GitHub Token (Required for Publishing)
```powershell
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"
```
**Note:** This token needs to be set in each new PowerShell session before publishing. Generate a token at https://github.com/settings/tokens with `repo` scope.

---

## Release Workflow

### Option 1: Quick Release (Recommended)
Bump version and publish in one command:

```powershell
# For bug fixes (1.0.0 → 1.0.1)
npm version patch; npm run build:win -- --publish always

# For new features (1.0.0 → 1.1.0)
npm version minor; npm run build:win -- --publish always

# For breaking changes (1.0.0 → 2.0.0)
npm version major; npm run build:win -- --publish always
```

### Option 2: With GitHub Token (One-liner)
```powershell
# Bug fix release
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"; npm version patch; npm run build:win -- --publish always

# New feature release
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"; npm version minor; npm run build:win -- --publish always

# Major release
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"; npm version major; npm run build:win -- --publish always
```

### Option 3: Step by Step
```powershell
# 1. Set GitHub token
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"

# 2. Bump version (choose one)
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0

# 3. Build and publish
npm run build:win -- --publish always
```

---

## Development Commands

### Start Development Server
```powershell
npm start
```

### Build Without Publishing
```powershell
npm run build:win
```

### Install Dependencies
```powershell
npm install
```

### Install Specific Package
```powershell
npm install package-name --save
```

---

## Version Bumping Reference

| Command | Current | New | Use Case |
|---------|---------|-----|----------|
| `npm version patch` | 1.0.0 | 1.0.1 | Bug fixes, small changes |
| `npm version minor` | 1.0.0 | 1.1.0 | New features, non-breaking |
| `npm version major` | 1.0.0 | 2.0.0 | Breaking changes |

---

## Publishing Options

### Always Publish (Recommended)
```powershell
npm run build:win -- --publish always
```
Uploads to GitHub Releases every time you build.

### Never Publish (Local Build Only)
```powershell
npm run build:win -- --publish never
```
Only builds locally, doesn't upload to GitHub.

### Publish on Tagged Commits
```powershell
npm run build:win -- --publish onTag
```
Only publishes if current commit has a git tag.

---

## Verify Published Release

Check your GitHub releases page:
```
https://github.com/aarza056/OrbisHub-Desktop/releases
```

You should see:
- Release tag (e.g., `v1.0.4`)
- `OrbisHub-Desktop-Setup-X.X.X.exe` installer
- `latest.yml` metadata file

---

## Testing Updates

### 1. Install Previous Version
```powershell
# Install the built version on test PC
.\dist\OrbisHub-Desktop-Setup-1.0.4.exe
```

### 2. Publish New Version
```powershell
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"
npm version patch
npm run build:win -- --publish always
```

### 3. Check for Updates on Test PC
- Open the installed app
- Press **F12** to open DevTools
- Wait 3 seconds
- Look for update notification
- Or click the **Update Status** button (left of Messages)

---

## Update Status Button States

| State | Appearance | Action |
|-------|-----------|--------|
| **Checking...** | Gray text | Initial state, checking for updates |
| **Up to date ✓** | Green text, green badge | No updates available |
| **Update Available +1** | Yellow text, yellow pulsing badge | Click to show download popup |
| **Downloading...** | Gray text | Download in progress |
| **Ready to Install !** | Yellow text, "!" badge | Click to install and restart |

---

## Troubleshooting

### GitHub Token Error
```
Error: GitHub Personal Access Token is not set
```
**Solution:**
```powershell
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"
```

### Update Not Detected
1. Check internet connection
2. Verify release is published: https://github.com/aarza056/OrbisHub-Desktop/releases
3. Ensure release is not a draft
4. Press F12 in app, check console logs

### Build Fails
```powershell
# Clean build
Remove-Item -Recurse -Force dist
npm run build:win -- --publish always
```

---

## Quick Reference

```powershell
# Complete release workflow (copy & paste)
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"
npm version patch
npm run build:win -- --publish always
```

---

## GitHub Repository
https://github.com/aarza056/OrbisHub-Desktop

## Files Generated After Build
- `dist/OrbisHub-Desktop-Setup-X.X.X.exe` - Windows installer
- `dist/latest.yml` - Update metadata
- `dist/win-unpacked/` - Unpacked application files
- `dist/*.blockmap` - Delta update files

---

## Notes

- **Auto-update** checks for updates every 4 hours while app is running
- **Initial check** happens 3 seconds after app starts
- **Users must install** a packaged version (from `dist/`) to receive updates
- **Development mode** (`npm start`) does not check for updates
- **F12 shortcut** opens DevTools in production builds for debugging
