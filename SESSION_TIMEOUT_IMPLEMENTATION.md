# Session Timeout Implementation

## Overview
Implemented automatic session timeout with 10-minute idle timer that logs users out after inactivity.

## Features Implemented

### 1. **Session Timeout Configuration**
- **Timeout Duration**: 10 minutes (600,000 ms)
- **Warning Duration**: 2 minutes before timeout
- **Activity Tracking**: Mouse movements, clicks, key presses, scrolling, and touch events

### 2. **Activity Tracking**
The system tracks the following user activities:
- Mouse movements (`mousemove`)
- Mouse clicks (`mousedown`, `click`)
- Keyboard input (`keypress`)
- Scrolling (`scroll`)
- Touch events (`touchstart`)

### 3. **Session Warning**
- **Timing**: Appears 2 minutes before session expires (at 8-minute mark)
- **Visual Design**: 
  - Orange gradient background
  - Warning icon
  - Clear message about impending timeout
  - "Stay Logged In" button to reset timer
- **Auto-dismiss**: Clicking the button resets the session timeout

### 4. **Session Timeout Modal**
When the session expires:
- Modal dialog appears with:
  - Clock icon
  - "Session Expired" message
  - Explanation of 10-minute inactivity
  - OK button to dismiss
- Auto-dismisses after 5 seconds
- User is automatically logged out and returned to login screen

### 5. **Audit Logging**
All session events are logged:
- **Logout events**: Records when user is logged out due to inactivity
- **Details logged**:
  - Username
  - Reason: "Session timeout due to inactivity"
  - Duration: "10 minutes"
  - Timestamp and IP address

### 6. **Activity Timestamp Updates**
- User's `lastActivity` timestamp is updated in the database on each audit log action
- Helps track actual user activity for online/offline status

## Technical Implementation

### Files Modified

1. **app/app-main.js**
   - Added session timeout constants and variables
   - Implemented `startSessionTimeout()` function
   - Implemented `stopSessionTimeout()` function
   - Implemented `resetSessionTimeout()` function
   - Implemented `showSessionWarning()` function
   - Implemented `hideSessionWarning()` function
   - Implemented `handleSessionTimeout()` function
   - Implemented `initializeActivityTracking()` function
   - Updated `setSession()` to start timeout tracking
   - Updated `clearSession()` to stop timeout tracking
   - Updated `performSignOut()` to log logout actions
   - Updated `logAudit()` to update lastActivity timestamp
   - Added activity tracking initialization in DOMContentLoaded

2. **app/styles.css**
   - Added `@keyframes slideIn` animation for session warning toast

## Usage

### For Users
1. Log in to the application
2. After 8 minutes of inactivity, a warning will appear
3. Move your mouse, click, or press any key to stay logged in
4. If no activity for 10 minutes total, you'll be automatically logged out

### For Developers
The session timeout is controlled by these constants:
```javascript
const SESSION_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const SESSION_WARNING_MS = 2 * 60 * 1000 // Warning 2 minutes before
```

To change the timeout duration, modify these values in `app/app-main.js`.

## Testing

To test the implementation:
1. Log in to the application
2. Leave the application idle for 8 minutes - warning should appear
3. Leave idle for 2 more minutes - should be logged out
4. Or: Move mouse/press key after warning - timeout should reset

## Security Benefits

1. **Automatic Protection**: Prevents unauthorized access if user walks away
2. **Configurable**: Easy to adjust timeout duration based on security requirements
3. **User-Friendly**: Warning gives users time to stay logged in if they're still present
4. **Audit Trail**: All session timeouts are logged for security auditing

## Future Enhancements

Possible improvements:
- Make timeout duration configurable per user role
- Add "Remember Me" option for extended sessions
- Show countdown timer in warning message
- Add admin settings to configure timeout globally
- Track and display idle time in user profile
