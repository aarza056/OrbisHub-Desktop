/**
 * Bug Reporting Service
 * Handles bug report submission and email generation
 */

(function () {
  if (typeof window === 'undefined') {
    return;
  }

  class BugReportService {
    constructor() {
      this.initialized = false;
    }

    /**
     * Initialize the bug reporting service
     */
    async initialize() {
      try {
        this.initialized = true;
        console.log('Bug Reporting Service initialized');
        return { success: true };
      } catch (error) {
        console.error('Failed to initialize Bug Reporting Service:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * Get system information for bug report context
     */
    async getSystemInfo() {
      try {
        const result = await window.electronAPI.bugReportGetSystemInfo();
        return result;
      } catch (error) {
        console.error('Failed to get system info:', error);
        return {
          success: false,
          data: {
            os: 'Unknown',
            appVersion: 'Unknown',
            timestamp: new Date().toISOString()
          }
        };
      }
    }

    /**
     * Submit a bug report
     */
    async submitBugReport(bugData) {
      try {
        // Validate required fields
        if (!bugData.title || !bugData.description) {
          return {
            success: false,
            error: 'Title and description are required'
          };
        }

        // Get system info
        const systemInfoResult = await this.getSystemInfo();
        const systemInfo = systemInfoResult.success ? systemInfoResult.data : {};

        // Prepare bug report data
        const reportData = {
          title: bugData.title,
          description: bugData.description,
          severity: bugData.severity || 'Medium',
          category: bugData.category || 'General',
          stepsToReproduce: bugData.stepsToReproduce || '',
          expectedBehavior: bugData.expectedBehavior || '',
          actualBehavior: bugData.actualBehavior || '',
          userEmail: bugData.userEmail || '',
          userName: bugData.userName || 'Anonymous',
          systemInfo: systemInfo,
          timestamp: new Date().toISOString(),
          attachments: bugData.attachments || []
        };

        // Send bug report via IPC
        const result = await window.electronAPI.bugReportSubmit(reportData);
        
        if (result.success) {
          // Log the bug report submission
          console.log('Bug report submitted successfully:', reportData.title);
        }

        return result;
      } catch (error) {
        console.error('Failed to submit bug report:', error);
        return {
          success: false,
          error: error.message || 'Failed to submit bug report'
        };
      }
    }

    /**
     * Get bug severity levels
     */
    getSeverityLevels() {
      return [
        { value: 'Critical', label: 'Critical', color: '#ef4444', icon: '🔴' },
        { value: 'High', label: 'High', color: '#f97316', icon: '🟠' },
        { value: 'Medium', label: 'Medium', color: '#eab308', icon: '🟡' },
        { value: 'Low', label: 'Low', color: '#3b82f6', icon: '🔵' },
        { value: 'Minor', label: 'Minor', color: '#8b5cf6', icon: '🟣' }
      ];
    }

    /**
     * Get bug categories
     */
    getCategories() {
      return [
        { value: 'UI/UX', label: 'UI/UX Issue', icon: '🎨' },
        { value: 'Functionality', label: 'Functionality', icon: '⚙️' },
        { value: 'Performance', label: 'Performance', icon: '⚡' },
        { value: 'Security', label: 'Security', icon: '🔒' },
        { value: 'Data', label: 'Data Issue', icon: '💾' },
        { value: 'Integration', label: 'Integration', icon: '🔗' },
        { value: 'Documentation', label: 'Documentation', icon: '📚' },
        { value: 'General', label: 'General', icon: '📝' }
      ];
    }

    /**
     * Validate email format
     */
    isValidEmail(email) {
      if (!email) return true; // Email is optional
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }
  }

  // Export to global scope
  window.BugReportService = new BugReportService();
})();
