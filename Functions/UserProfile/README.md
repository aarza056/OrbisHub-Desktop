# User Profile Module

## Overview

The User Profile module provides a comprehensive, interactive interface for users to view their account information, activity history, and permissions within OrbisHub Desktop. This feature-rich modal offers a modern, gradient-themed design with intuitive navigation and real-time data display.

## Features

### 🎨 Visual Design
- **Beautiful Gradient Header**: Eye-catching purple-to-indigo gradient with subtle grid pattern
- **Profile Avatar System**: Displays user images or auto-generated initials
- **Responsive Layout**: Fully adaptive design for all screen sizes
- **Smooth Animations**: Polished tab transitions and hover effects
- **Custom Styling**: Consistent with OrbisHub Desktop theme

### 📊 Three Main Sections

#### 1. Overview Tab
- **Statistics Dashboard**
  - Total Logins
  - Total Actions
  - Last Login Date/Time
  - Account Age (days)
- **Account Information**
  - Email Address
  - Username
  - Role
  - Department

#### 2. Activity Tab
- Recent activity timeline
- Color-coded activity types (Login, Create, Update, Delete, View)
- Relative time stamps
- Refresh capability
- Activity details and descriptions

#### 3. Permissions Tab
- Grouped permissions by category
- Category icons (Environments, Credentials, Users, etc.)
- Permission count badges
- Visual checkmarks for granted permissions

## Files Structure

```
Functions/UserProfile/
├── profile-service.js      # Service layer for data management
├── profile-ui.js           # UI controller and event handlers
├── profile-ui.css          # Comprehensive styling
└── README.md              # This file
```

## Technical Architecture

### Service Layer (`profile-service.js`)

The service handles all data operations:

```javascript
// Main service instance
window.UserProfileService

// Methods available:
- initialize()                    // Initialize the service
- getUserProfile(userId)          // Get user profile data
- getUserActivity(userId, limit)  // Get activity history
- getUserStats(userId)            // Get user statistics
- getUserPermissions(userId)      // Get permissions
- updateProfile(userId, updates)  // Update profile (prepared)
- getSessionInfo()               // Get current session info
- clear()                        // Clear cached data
```

### UI Controller (`profile-ui.js`)

Manages all UI interactions:

```javascript
// Main UI instance
window.UserProfileUI

// Methods available:
- initialize()    // Initialize UI and event listeners
- open()         // Open the profile modal
- close()        // Close the profile modal
```

### Styling (`profile-ui.css`)

Comprehensive CSS with:
- CSS Variables for theming
- Responsive breakpoints
- Animation keyframes
- Hover states and transitions
- Custom scrollbar styling
- Dark mode support

## Usage

### Opening the Profile Modal

The profile modal can be opened in several ways:

1. **Via User Menu Button** (Default)
   ```javascript
   // Already wired up - click "View Profile" in user menu
   ```

2. **Programmatically**
   ```javascript
   // Call from anywhere in the application
   window.UserProfileUI.open()
   ```

3. **Check Availability**
   ```javascript
   if (window.UserProfileUI && window.UserProfileUI.open) {
       window.UserProfileUI.open()
   }
   ```

### Closing the Modal

```javascript
// Close programmatically
window.UserProfileUI.close()

// Or users can click the X button or press ESC
```

## Integration Points

### Session Management
The profile module integrates with the application's session management:

```javascript
const sessionInfo = window.getSession()
// Returns: { userId, username, fullName, email, role, department, ... }
```

### Permissions System
Connects with the permissions module:

```javascript
// Permissions are loaded and displayed in the Permissions tab
// Uses existing PermissionsService if available
```

### Toast Notifications
Uses the global toast system for user feedback:

```javascript
window.showToast(message, type)
```

## API Endpoints (Backend Integration)

The following Electron IPC endpoints should be implemented:

### Get User Profile
```javascript
window.electronAPI.userProfileGet(userId)
// Returns: { success: true, data: { ...profileData } }
```

### Get User Activity
```javascript
window.electronAPI.userProfileGetActivity(userId, limit)
// Returns: { success: true, data: [...activities] }
```

### Get User Statistics
```javascript
window.electronAPI.userProfileGetStats(userId)
// Returns: { 
//   success: true, 
//   data: { 
//     totalLogins, 
//     totalActions, 
//     lastLogin, 
//     accountAge 
//   } 
// }
```

### Get User Permissions
```javascript
window.electronAPI.userProfileGetPermissions(userId)
// Returns: { success: true, data: [...permissions] }
```

### Update User Profile
```javascript
window.electronAPI.userProfileUpdate(userId, updates)
// Returns: { success: true, data: { ...updatedProfile } }
```

## Data Structures

### Profile Data
```javascript
{
  userId: number,
  username: string,
  fullName: string,
  email: string,
  role: string,
  department: string,
  profileImage: string | null,
  lastLogin: Date,
  createdAt: Date
}
```

### Activity Item
```javascript
{
  type: 'login' | 'create' | 'update' | 'delete' | 'view',
  action: string,
  details: string | null,
  timestamp: Date
}
```

### Permission Item
```javascript
{
  name: string,
  category: string,
  description: string
}
```

### Statistics Data
```javascript
{
  totalLogins: number,
  totalActions: number,
  lastLogin: Date | null,
  accountAge: number  // days since account creation
}
```

## Customization

### Changing Colors

Edit CSS variables in `profile-ui.css`:

```css
#userProfileModal {
  --profile-primary: #667eea;
  --profile-secondary: #764ba2;
  --profile-accent: #f093fb;
}
```

### Adding New Tabs

1. Add tab button in HTML:
```html
<button class="profile-tab-btn" data-tab="newtab">New Tab</button>
```

2. Add tab pane in HTML:
```html
<div id="profileTabNewtab" class="profile-tab-pane">
  <!-- Tab content -->
</div>
```

3. Load data when tab is activated in `profile-ui.js`:
```javascript
if (tabId === 'newtab') {
    loadNewTabData()
}
```

### Extending Statistics

Add new stat cards in the `profile-stats-grid`:

```html
<div class="profile-stat-card">
  <div class="profile-stat-icon">
    <!-- Icon SVG -->
  </div>
  <div class="profile-stat-label">New Stat</div>
  <div class="profile-stat-value" id="statNewStat">0</div>
</div>
```

## Responsive Breakpoints

- **Desktop**: Full layout with side-by-side elements
- **Tablet** (≤1024px): Adjusted grid layouts
- **Mobile** (≤768px): Stacked layout, full-width elements

## Browser Compatibility

- Electron (Chromium-based): ✅ Fully supported
- Modern CSS features used:
  - CSS Grid
  - CSS Variables
  - Flexbox
  - Backdrop Filter
  - CSS Animations

## Performance Considerations

1. **Lazy Loading**: Activity and permissions load only when tabs are accessed
2. **Cached Data**: Session info cached to avoid repeated lookups
3. **Efficient Rendering**: Minimal DOM manipulations
4. **CSS Optimizations**: Hardware-accelerated transforms

## Security

- No sensitive data stored in localStorage
- All data fetched from secure Electron IPC
- XSS protection through proper HTML escaping
- CSP-compliant implementation

## Accessibility

- Semantic HTML structure
- Keyboard navigation support
- Focus management
- High contrast text
- Screen reader ready (ARIA labels can be added)

## Future Enhancements

Prepared but not yet implemented:

1. **Profile Editing**
   - Edit full name
   - Change email
   - Update department
   - Save changes to database

2. **Avatar Upload**
   - Image file selection
   - Crop and resize
   - Upload to server
   - Update profile image

3. **Activity Filtering**
   - Filter by type
   - Date range selection
   - Search functionality

4. **Export Features**
   - Export activity log
   - Download permissions list
   - Generate profile report

5. **Preferences**
   - Notification settings
   - Theme preferences
   - Language selection

## Troubleshooting

### Modal Doesn't Open
1. Check browser console for errors
2. Verify `UserProfileUI` is available: `console.log(window.UserProfileUI)`
3. Ensure scripts are loaded in correct order
4. Check if modal HTML exists in DOM

### Data Not Loading
1. Check if backend API endpoints are implemented
2. Verify `electronAPI` is available
3. Check network/IPC errors in console
4. Ensure user is authenticated

### Styling Issues
1. Verify CSS file is linked in `index.html`
2. Check for CSS conflicts with other modules
3. Clear browser cache
4. Check CSS variable support

## Support

For issues or questions:
1. Check the main OrbisHub Desktop documentation
2. Review this README
3. Check browser console for errors
4. Contact the development team

## License

Part of OrbisHub Desktop - MIT License

---

**Version**: 1.0.0  
**Last Updated**: December 15, 2025  
**Author**: OrbisHub Development Team
