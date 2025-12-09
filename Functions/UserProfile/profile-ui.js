/**
 * User Profile UI Controller
 * Handles all UI interactions for the user profile modal
 */

(function () {
  if (!window || !window.UserProfileService) {
    console.error('User Profile UI: UserProfileService not available');
    return;
  }

  const service = window.UserProfileService;

  // ==================== INITIALIZATION ====================

  async function initUserProfile() {
    try {
      await service.initialize();
      setupEventListeners();
      console.log('User Profile UI initialized');
    } catch (error) {
      console.error('Failed to initialize User Profile UI:', error);
      showError('Failed to initialize user profile');
    }
  }

  function setupEventListeners() {
    // Modal controls
    const closeBtn = document.querySelector('#userProfileModal .modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeProfileModal);
    }

    // Tab switching
    const tabButtons = document.querySelectorAll('.profile-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabId = e.currentTarget.dataset.tab;
        switchTab(tabId);
      });
    });

    // Edit profile button
    const editBtn = document.getElementById('profileEditBtn');
    if (editBtn) {
      editBtn.addEventListener('click', handleEditProfile);
    }

    // Refresh activity button
    const refreshBtn = document.getElementById('profileRefreshActivityBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => loadUserActivity(true));
    }
  }

  // ==================== MODAL MANAGEMENT ====================

  async function openProfileModal() {
    const modal = document.getElementById('userProfileModal');
    if (!modal) {
      console.error('Profile modal not found');
      return;
    }

    try {
      // Get session info
      const sessionInfo = service.getSessionInfo();
      if (!sessionInfo) {
        showError('No active session found');
        return;
      }

      // Load profile data
      await loadProfileData(sessionInfo);

      // Show modal
      modal.showModal();
      
      // Load default tab content
      switchTab('overview');
    } catch (error) {
      console.error('Failed to open profile modal:', error);
      showError('Failed to load profile');
    }
  }

  function closeProfileModal() {
    const modal = document.getElementById('userProfileModal');
    if (modal) {
      modal.close();
    }
  }

  // ==================== DATA LOADING ====================

  async function loadProfileData(sessionInfo) {
    try {
      // Set basic profile information
      setElement('profileFullName', sessionInfo.fullName);
      setElement('profileUsername', `@${sessionInfo.username}`);
      setElement('profileEmail', sessionInfo.email);
      setElement('profileRole', sessionInfo.role);
      setElement('profileDepartment', sessionInfo.department);

      // Set account information section (duplicate fields)
      setElement('profileUsernameInfo', sessionInfo.username);
      setElement('profileRoleInfo', sessionInfo.role);
      setElement('profileDepartmentInfo', sessionInfo.department);

      // Set profile avatar (use initials if no image)
      const avatarEl = document.getElementById('profileAvatar');
      if (avatarEl) {
        if (sessionInfo.profileImage) {
          avatarEl.innerHTML = `<img src="${sessionInfo.profileImage}" alt="${sessionInfo.fullName}">`;
        } else {
          const initials = getInitials(sessionInfo.fullName);
          avatarEl.innerHTML = `<div class="profile-avatar-initials">${initials}</div>`;
        }
      }

      // Load user statistics
      const statsResult = await service.getUserStats(sessionInfo.userId);
      if (statsResult.success) {
        displayUserStats(statsResult.data);
      }

      // Load recent activity
      await loadUserActivity();

      // Load permissions summary
      await loadUserPermissions(sessionInfo.userId);

    } catch (error) {
      console.error('Failed to load profile data:', error);
      showError('Failed to load some profile information');
    }
  }

  async function loadUserActivity(refresh = false) {
    const sessionInfo = service.getSessionInfo();
    if (!sessionInfo) return;

    const activityContainer = document.getElementById('profileActivityList');
    if (!activityContainer) return;

    if (refresh) {
      activityContainer.innerHTML = '<div class="profile-loading">Loading activity...</div>';
    }

    try {
      const result = await service.getUserActivity(sessionInfo.userId, 15);
      
      if (result.success && result.data && result.data.length > 0) {
        renderActivityList(result.data);
      } else {
        activityContainer.innerHTML = `
          <div class="profile-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p>No recent activity</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to load activity:', error);
      activityContainer.innerHTML = '<div class="profile-error">Failed to load activity</div>';
    }
  }

  async function loadUserPermissions(userId) {
    const permissionsContainer = document.getElementById('profilePermissionsList');
    if (!permissionsContainer) return;

    try {
      const result = await service.getUserPermissions(userId);
      
      if (result.success && result.data && result.data.length > 0) {
        renderPermissionsList(result.data);
      } else {
        permissionsContainer.innerHTML = `
          <div class="profile-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <p>No permissions assigned</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
      permissionsContainer.innerHTML = '<div class="profile-error">Failed to load permissions</div>';
    }
  }

  // ==================== RENDERING ====================

  function displayUserStats(stats) {
    setElement('statTotalLogins', stats.totalLogins || 0);
    setElement('statTotalActions', stats.totalActions || 0);
    
    // Calculate account age from session createdAt
    const sessionInfo = service.getSessionInfo();
    if (sessionInfo && sessionInfo.createdAt) {
      const createdDate = new Date(sessionInfo.createdAt);
      const today = new Date();
      const ageInDays = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
      setElement('statAccountAge', ageInDays);
    } else {
      setElement('statAccountAge', stats.accountAge || 0);
    }
    
    // Handle lastLogin - could be timestamp or null
    if (stats.lastLogin && stats.lastLogin > 0) {
      const lastLoginDate = new Date(stats.lastLogin);
      setElement('statLastLogin', formatDateTime(lastLoginDate));
    } else {
      setElement('statLastLogin', 'Never');
    }
  }

  function renderActivityList(activities) {
    const container = document.getElementById('profileActivityList');
    if (!container) return;

    const html = activities.map(activity => {
      const activityTime = new Date(activity.timestamp);
      const icon = getActivityIcon(activity.type);
      const color = getActivityColor(activity.type);

      return `
        <div class="profile-activity-item">
          <div class="profile-activity-icon" style="background-color: ${color}15; color: ${color}">
            ${icon}
          </div>
          <div class="profile-activity-content">
            <div class="profile-activity-title">${escapeHtml(activity.action)}</div>
            <div class="profile-activity-meta">
              <span>${formatRelativeTime(activityTime)}</span>
              ${activity.details ? `<span class="profile-activity-details">${escapeHtml(activity.details)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html || '<div class="profile-empty-state">No activity found</div>';
  }

  function renderPermissionsList(permissions) {
    const container = document.getElementById('profilePermissionsList');
    if (!container) return;

    const groupedPermissions = groupPermissionsByCategory(permissions);
    
    const html = Object.keys(groupedPermissions).map(category => {
      const perms = groupedPermissions[category];
      const icon = getCategoryIcon(category);
      
      return `
        <div class="profile-permission-group">
          <div class="profile-permission-group-header">
            <div class="profile-permission-group-icon">${icon}</div>
            <span class="profile-permission-group-title">${category}</span>
            <span class="profile-permission-count">${perms.length}</span>
          </div>
          <div class="profile-permission-list">
            ${perms.map(p => `
              <div class="profile-permission-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>${escapeHtml(p.name)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  // ==================== TAB MANAGEMENT ====================

  function switchTab(tabId) {
    // Update tab buttons
    const tabButtons = document.querySelectorAll('.profile-tab-btn');
    tabButtons.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update tab content
    const tabPanes = document.querySelectorAll('.profile-tab-pane');
    tabPanes.forEach(pane => {
      if (pane.id === `profileTab${capitalize(tabId)}`) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });

    // Load tab-specific data if needed
    if (tabId === 'activity') {
      loadUserActivity();
    }
  }

  // ==================== ACTIONS ====================

  function handleEditProfile() {
    showToast('Edit profile functionality coming soon', 'info');
  }

  // ==================== UTILITIES ====================

  function setElement(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value;
    }
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  function getActivityIcon(type) {
    const icons = {
      login: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
      create: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
      update: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
      delete: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
      view: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
    };
    return icons[type] || icons.view;
  }

  function getActivityColor(type) {
    const colors = {
      login: '#667eea',
      create: '#0ea770',
      update: '#f59e0b',
      delete: '#ef4444',
      view: '#6366f1'
    };
    return colors[type] || '#6366f1';
  }

  function getCategoryIcon(category) {
    const icons = {
      'Environments': '🌐',
      'Credentials': '🔐',
      'Users': '👥',
      'Agents': '🤖',
      'Tickets': '🎫',
      'Servers': '🖥️',
      'Messages': '💬',
      'System': '⚙️'
    };
    return icons[category] || '📋';
  }

  function groupPermissionsByCategory(permissions) {
    const grouped = {};
    permissions.forEach(perm => {
      const category = perm.category || 'Other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(perm);
    });
    return grouped;
  }

  function formatDateTime(date) {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) return formatDateTime(date);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showError(message) {
    if (window.showToast) {
      window.showToast(message, 'error');
    } else {
      console.error(message);
    }
  }

  function showToast(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }

  // ==================== EXPORTS ====================

  window.UserProfileUI = {
    initialize: initUserProfile,
    open: openProfileModal,
    close: closeProfileModal
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserProfile);
  } else {
    initUserProfile();
  }
})();
