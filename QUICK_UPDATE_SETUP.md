# Quick Update Setup Guide

## TL;DR - Get Updates Working in 5 Minutes

### Option 1: GitHub Releases (Easiest)

1. **Update package.json:**
```json
"build": {
  "publish": [
    {
      "provider": "github",
      "owner": "YOUR_GITHUB_USERNAME",
      "repo": "orbis-desktop"
    }
  ]
}
```

2. **Set GitHub Token:**
```bash
# Windows PowerShell
$env:GH_TOKEN = "your_github_token_here"
```

3. **Build and Publish:**
```bash
npm run build:win -- --publish always
```

That's it! Updates will be served from GitHub Releases automatically.

---

### Option 2: Simple HTTP Server (No GitHub)

1. **Create a simple update server** (Node.js example):

```javascript
// update-server.js
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.static('releases'));

app.listen(3000, () => {
  console.log('Update server running on http://localhost:3000');
});
```

2. **Update package.json:**
```json
"build": {
  "publish": [
    {
      "provider": "generic",
      "url": "http://your-server.com:3000"
    }
  ]
}
```

3. **Build app:**
```bash
npm run build:win
```

4. **Upload to server:**
- Copy `dist/OrbisHub-Desktop-Setup-X.X.X.exe` to server's `releases/` folder
- Copy `dist/latest.yml` to server's `releases/` folder

---

### For Testing Locally

1. **Create a local test server:**
```bash
# In a new terminal, serve the dist folder
cd dist
npx http-server -p 8080 --cors
```

2. **In main.js, temporarily add:**
```javascript
// Add after autoUpdater import
if (process.env.NODE_ENV === 'development') {
  autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml');
}
```

3. **Create dev-app-update.yml:**
```yaml
provider: generic
url: http://localhost:8080
```

4. **Test by bumping version** in package.json and rebuilding

---

## What Users See

1. **Notification appears** in bottom-right after 3 seconds (if update available)
2. User clicks **"Download"**
3. Progress bar shows download
4. User clicks **"Restart & Install"**
5. App closes, installs, and restarts automatically

---

## Common Issues

**Update not detected?**
- Check that `latest.yml` exists on your server
- Visit the URL in browser: `http://your-server.com/latest.yml`
- Check console for errors

**Download fails?**
- Ensure CORS is enabled on your server
- Check firewall/antivirus settings

**Can't publish to GitHub?**
- Create Personal Access Token: GitHub → Settings → Developer Settings → Personal Access Tokens
- Give it `repo` permissions
- Set as environment variable: `$env:GH_TOKEN = "token"`

---

## Need More Details?
See `UPDATE_SYSTEM.md` for comprehensive documentation.
