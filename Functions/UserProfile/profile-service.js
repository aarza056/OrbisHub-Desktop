/**
 * User Profile Service
 * Handles user profile data retrieval and management
 */

(function () {
  if (typeof window === 'undefined') {
    return;
  }

  class UserProfileService {
    constructor() {
      this.initialized = false;
      this.currentProfile = null;
    }

    /**
     * Initialize the user profile service
     */
    async initialize() {
      try {
        this.initialized = true;
        console.log('User Profile Service initialized');
        return { success: true };
      } catch (error) {
        console.error('Failed to initialize User Profile Service:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * Get current user profile data
     */
    async getUserProfile(userId) {
      try {
        const result = await window.electronAPI.userProfileGet(userId);
        if (result.success) {
          this.currentProfile = result.data;
        }
        return result;
      } catch (error) {
        console.error('Failed to get user profile:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * Get user's recent activity
     */
    async getUserActivity(userId, limit = 10) {
      try {
        const result = await window.electronAPI.userProfileGetActivity(userId, limit);
        return result;
      } catch (error) {
        console.error('Failed to get user activity:', error);
        return { success: false, error: error.message, data: [] };
      }
    }

    /**
     * Get user statistics
     */
    async getUserStats(userId) {
      try {
        const result = await window.electronAPI.userProfileGetStats(userId);
        return result;
      } catch (error) {
        console.error('Failed to get user statistics:', error);
        return { 
          success: false, 
          error: error.message,
          data: {
            totalLogins: 0,
            totalActions: 0,
            lastLogin: null,
            accountAge: 0
          }
        };
      }
    }

    /**
     * Update user profile
     */
    async updateProfile(userId, updates) {
      try {
        const result = await window.electronAPI.userProfileUpdate(userId, updates);
        if (result.success) {
          this.currentProfile = { ...this.currentProfile, ...updates };
        }
        return result;
      } catch (error) {
        console.error('Failed to update user profile:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * Get user permissions summary
     */
    async getUserPermissions(userId) {
      try {
        const result = await window.electronAPI.userProfileGetPermissions(userId);
        return result;
      } catch (error) {
        console.error('Failed to get user permissions:', error);
        return { success: false, error: error.message, data: [] };
      }
    }

    /**
     * Get user's session information
     */
    getSessionInfo() {
      const session = window.getSession ? window.getSession() : null;
      if (!session) {
        return null;
      }

      return {
        userId: session.userId,
        username: session.username,
        fullName: session.fullName || session.username,
        email: session.email || 'Not set',
        role: session.role || 'User',
        department: session.department || 'Not set',
        lastLogin: session.lastLogin,
        profileImage: session.profileImage || null,
        createdAt: session.createdAt
      };
    }

    /**
     * Clear cached profile data
     */
    clear() {
      this.currentProfile = null;
      console.log('User profile cache cleared');
    }
  }

  // Expose service globally
  window.UserProfileService = new UserProfileService();
})();
