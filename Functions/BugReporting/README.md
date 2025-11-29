# Bug Reporting Feature

## Overview
Professional bug reporting system for OrbisHub Desktop application. Allows users to submit detailed bug reports that are automatically sent to the development team.

## Features

### 🐛 Comprehensive Bug Reporting
- **Title & Description**: Clear bug identification
- **Severity Levels**: Critical, High, Medium, Low, Minor
- **Categories**: UI/UX, Functionality, Performance, Security, Data, Integration, Documentation, General
- **Detailed Information**:
  - Steps to reproduce
  - Expected behavior
  - Actual behavior
  - User email (optional)

### 📧 Email Submission
All bug reports are automatically sent to: **development@orbis-hub.com**

### 📊 System Information
Automatically includes:
- Operating system details
- Application version
- Timestamp
- Current user information

### 🎨 Professional UI
- Modern, clean interface
- Visual severity indicators
- Category icons
- Form validation
- Success confirmation
- Character counters

## File Structure

```
Functions/BugReporting/
├── bug-service.js      # Backend logic for bug reporting
├── bug-ui.js          # UI controller and event handlers
├── bug-ui.css         # Styling for bug report interface
└── README.md          # This file
```

## Integration

### 1. HTML Integration
Add to `app/index.html`:

```html
<!-- In <head> section -->
<link rel="stylesheet" href="../Functions/BugReporting/bug-ui.css" />

<!-- Before </body> tag -->
<script src="../Functions/BugReporting/bug-service.js"></script>
<script src="../Functions/BugReporting/bug-ui.js"></script>
```

### 2. Navigation Integration
Add button in sidebar under "Documentation":

```html
<button class="nav__btn" data-view="bug-report">
  <svg><!-- Bug icon --></svg>
  Report a Bug
</button>
```

### 3. Main Process Integration
Add IPC handler in `main.js`:

```javascript
ipcMain.handle('bug-report:submit', async (event, bugData) => {
  // Send email to development@orbis-hub.com
  // Implementation details in main.js
});

ipcMain.handle('bug-report:getSystemInfo', async (event) => {
  return {
    success: true,
    data: {
      os: `${os.platform()} ${os.release()}`,
      appVersion: app.getVersion(),
      timestamp: new Date().toISOString()
    }
  };
});
```

## Usage

1. Navigate to "Report a Bug" in the sidebar
2. Fill in the required fields:
   - Bug title (minimum 5 characters)
   - Bug description (minimum 20 characters)
3. Select severity level (default: Medium)
4. Select category (default: UI/UX)
5. Optionally provide:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Contact email
6. Click "Submit Bug Report"

## Email Format

Bug reports are sent with the following information:

```
Subject: [OrbisHub Bug] [SEVERITY] Bug Title

Body:
- Title
- Description
- Severity
- Category
- Steps to Reproduce
- Expected Behavior
- Actual Behavior
- System Information
- User Information
- Timestamp
```

## Security

- Email validation for user-provided emails
- Input sanitization
- XSS protection
- No sensitive data exposure in bug reports

## Requirements

- Electron IPC for communication with main process
- Email service configured in main process
- Internet connection for email submission

## Development

### Testing
1. Fill out bug report form
2. Submit and verify email delivery
3. Check success message display
4. Verify form reset functionality

### Customization
- Modify severity levels in `bug-service.js`
- Add/remove categories in `bug-service.js`
- Customize email template in main process
- Adjust styling in `bug-ui.css`

## Support

For issues with the bug reporting feature itself, contact:
**development@orbis-hub.com**

## Version History

- **1.0.0** (2025-11-30): Initial release
  - Basic bug reporting functionality
  - Email submission
  - Professional UI
  - System information collection
