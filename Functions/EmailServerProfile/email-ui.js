/**
 * Email Server Profile UI Controller
 * Manages the email configuration interface
 */

(function () {
  if (!window.EmailService) {
    console.error('EmailService not loaded');
    return;
  }

  const EmailUI = {
    currentProfiles: [],
    currentProfile: null,
    modalsLoaded: false,

    /**
     * Initialize Email UI
     */
    async init() {
      console.log('📧 Initializing Email Server Profile UI...');
      await this.loadModals();
      await this.loadProfiles();
      this.attachEventListeners();
    },

    /**
     * Load modal HTML from external file
     */
    async loadModals() {
      if (this.modalsLoaded) return;
      
      try {
        const response = await fetch('../Functions/EmailServerProfile/email-modals.html');
        const html = await response.text();
        
        // Create a temporary container
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        // Append each modal directly to body (not the wrapper div)
        while (temp.firstChild) {
          document.body.appendChild(temp.firstChild);
        }
        
        this.modalsLoaded = true;
        console.log('✅ Email modals loaded');
      } catch (error) {
        console.error('❌ Error loading email modals:', error);
      }
    },

    /**
     * Load all email server profiles
     */
    async loadProfiles() {
      try {
        this.currentProfiles = await window.EmailService.getAllProfiles();
        this.renderProfilesList();
      } catch (error) {
        console.error('Error loading email profiles:', error);
        this.showError('Failed to load email profiles');
      }
    },

    /**
     * Render profiles list
     */
    renderProfilesList() {
      const container = document.getElementById('emailProfilesList');
      if (!container) return;

      if (this.currentProfiles.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📧</div>
            <h3>No Email Server Profiles</h3>
            <p>Create your first email server profile to enable email notifications, password recovery, and bug reporting.</p>
            <button class="btn" onclick="EmailUI.openCreateProfileModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Email Profile
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = this.currentProfiles.map(profile => this.renderProfileCard(profile)).join('');
    },

    /**
     * Render single profile card
     */
    renderProfileCard(profile) {
      const statusClass = profile.isActive ? 'active' : 'inactive';
      const statusText = profile.isActive ? 'Active' : 'Inactive';
      const defaultBadge = profile.isDefault ? '<span class="badge badge-primary">Default</span>' : '';
      
      const lastTestStatus = profile.lastTestStatus 
        ? `<span class="test-status test-${profile.lastTestStatus}">${profile.lastTestStatus === 'success' ? '✓' : '✗'} ${profile.lastTestStatus}</span>`
        : '<span class="test-status">Not tested</span>';

      return `
        <div class="email-profile-card" data-profile-id="${profile.id}">
          <div class="profile-header">
            <div class="profile-title">
              <h4>${this.escapeHtml(profile.name)}</h4>
              <div class="profile-badges">
                ${defaultBadge}
                <span class="badge badge-${statusClass}">${statusText}</span>
              </div>
            </div>
            <div class="profile-actions">
              <button class="btn-icon" onclick="EmailUI.testProfile('${profile.id}')" title="Test Connection">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
              </button>
              <button class="btn-icon" onclick="EmailUI.editProfile('${profile.id}')" title="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-icon btn-danger" onclick="EmailUI.deleteProfile('${profile.id}')" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="profile-details">
            <div class="detail-row">
              <span class="detail-label">SMTP Server:</span>
              <span class="detail-value">${this.escapeHtml(profile.smtpHost)}:${profile.smtpPort}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">From:</span>
              <span class="detail-value">${this.escapeHtml(profile.fromName)} &lt;${this.escapeHtml(profile.fromEmail)}&gt;</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Security:</span>
              <span class="detail-value">${profile.useSSL ? 'SSL' : ''}${profile.useSSL && profile.useTLS ? ' + ' : ''}${profile.useTLS ? 'TLS' : ''}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Last Test:</span>
              <span class="detail-value">${lastTestStatus}</span>
            </div>
          </div>
        </div>
      `;
    },

    /**
     * Open create profile modal
     */
    openCreateProfileModal() {
      const modal = document.getElementById('emailProfileModal');
      if (!modal) return;

      this.currentProfile = null;
      document.getElementById('emailProfileModalTitle').textContent = 'Create Email Server Profile';
      document.getElementById('emailProfileForm').reset();
      
      // Set defaults
      document.getElementById('emailSmtpPort').value = '587';
      document.getElementById('emailUseTLS').checked = true;
      document.getElementById('emailUseSSL').checked = true;
      document.getElementById('emailAuthRequired').checked = true;
      document.getElementById('emailIsActive').checked = true;
      document.getElementById('emailMaxRetries').value = '3';
      document.getElementById('emailRetryInterval').value = '5';

      try {
        modal.showModal();
      } catch (e) {
        modal.setAttribute('open', '');
      }
    },

    /**
     * Edit profile
     */
    async editProfile(profileId) {
      try {
        const profile = await window.EmailService.getProfileById(profileId);
        if (!profile) {
          this.showError('Profile not found');
          return;
        }

        this.currentProfile = profile;
        const modal = document.getElementById('emailProfileModal');
        if (!modal) return;

        document.getElementById('emailProfileModalTitle').textContent = 'Edit Email Server Profile';
        
        // Populate form
        document.getElementById('emailProfileName').value = profile.name || '';
        document.getElementById('emailProfileDescription').value = profile.description || '';
        document.getElementById('emailSmtpHost').value = profile.smtpHost || '';
        document.getElementById('emailSmtpPort').value = profile.smtpPort || '587';
        document.getElementById('emailUseTLS').checked = profile.useTLS;
        document.getElementById('emailUseSSL').checked = profile.useSSL;
        document.getElementById('emailAuthRequired').checked = profile.authRequired;
        document.getElementById('emailUsername').value = profile.username || '';
        document.getElementById('emailPassword').value = ''; // Don't show encrypted password
        document.getElementById('emailFromEmail').value = profile.fromEmail || '';
        document.getElementById('emailFromName').value = profile.fromName || '';
        document.getElementById('emailReplyTo').value = profile.replyToEmail || '';
        document.getElementById('emailIsActive').checked = profile.isActive;
        document.getElementById('emailIsDefault').checked = profile.isDefault;
        document.getElementById('emailMaxRetries').value = profile.maxRetriesOnFailure || '3';
        document.getElementById('emailRetryInterval').value = profile.retryIntervalMinutes || '5';
        document.getElementById('emailMaxPerHour').value = profile.maxEmailsPerHour || '';
        document.getElementById('emailMaxPerDay').value = profile.maxEmailsPerDay || '';

        try {
          modal.showModal();
        } catch (e) {
          modal.setAttribute('open', '');
        }
      } catch (error) {
        console.error('Error editing profile:', error);
        this.showError('Failed to load profile for editing');
      }
    },

    /**
     * Save profile (create or update)
     */
    async saveProfile(event) {
      event.preventDefault();

      const formData = {
        name: document.getElementById('emailProfileName').value.trim(),
        description: document.getElementById('emailProfileDescription').value.trim(),
        smtpHost: document.getElementById('emailSmtpHost').value.trim(),
        smtpPort: parseInt(document.getElementById('emailSmtpPort').value),
        useTLS: document.getElementById('emailUseTLS').checked,
        useSSL: document.getElementById('emailUseSSL').checked,
        authRequired: document.getElementById('emailAuthRequired').checked,
        username: document.getElementById('emailUsername').value.trim(),
        password: document.getElementById('emailPassword').value,
        fromEmail: document.getElementById('emailFromEmail').value.trim(),
        fromName: document.getElementById('emailFromName').value.trim(),
        replyToEmail: document.getElementById('emailReplyTo').value.trim(),
        isActive: document.getElementById('emailIsActive').checked,
        isDefault: document.getElementById('emailIsDefault').checked,
        maxRetriesOnFailure: parseInt(document.getElementById('emailMaxRetries').value) || 3,
        retryIntervalMinutes: parseInt(document.getElementById('emailRetryInterval').value) || 5,
        maxEmailsPerHour: parseInt(document.getElementById('emailMaxPerHour').value) || null,
        maxEmailsPerDay: parseInt(document.getElementById('emailMaxPerDay').value) || null
      };

      // Validation
      if (!formData.name || !formData.smtpHost || !formData.fromEmail || !formData.fromName) {
        this.showError('Please fill in all required fields');
        return;
      }

      try {
        const session = window.getSession ? window.getSession() : null;
        const currentUser = session ? session.id : 'admin';

        if (this.currentProfile) {
          // Update existing profile
          formData.updatedBy = currentUser;
          await window.EmailService.updateProfile(this.currentProfile.id, formData);
          this.showSuccess('Email profile updated successfully');
        } else {
          // Create new profile
          formData.createdBy = currentUser;
          await window.EmailService.createProfile(formData);
          this.showSuccess('Email profile created successfully');
        }

        this.closeModal('emailProfileModal');
        await this.loadProfiles();

        // Log audit
        if (window.Audit) {
          await window.Audit.log({
            id: this.generateId(),
            action: this.currentProfile ? 'update' : 'create',
            entityType: 'email_profile',
            entityName: formData.name,
            user: session ? session.name : 'Admin',
            username: session ? session.username : 'admin',
            timestamp: new Date().toISOString(),
            ip: window.getLocalIP ? window.getLocalIP() : '127.0.0.1',
            details: { profileId: this.currentProfile ? this.currentProfile.id : 'new' }
          });
        }
      } catch (error) {
        console.error('Error saving profile:', error);
        this.showError('Failed to save email profile: ' + error.message);
      }
    },

    /**
     * Test email profile connection
     */
    async testProfile(profileId) {
      this.currentProfile = this.currentProfiles.find(p => p.id === profileId);
      if (!this.currentProfile) {
        this.showError('Profile not found');
        return;
      }

      // Clear previous input
      document.getElementById('testEmailRecipient').value = '';
      
      // Show test email modal
      const modal = document.getElementById('testEmailModal');
      modal.showModal();

      // Handle form submission
      const form = document.getElementById('testEmailForm');
      form.onsubmit = async (e) => {
        e.preventDefault();
        
        const testEmail = document.getElementById('testEmailRecipient').value.trim();
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(testEmail)) {
          this.showError('Please enter a valid email address');
          return;
        }

        // Close modal
        this.closeModal('testEmailModal');

        try {
          this.showInfo('Sending test email...');
          const result = await window.EmailService.testProfile(profileId, testEmail);
          
          if (result.success) {
            this.showSuccess('Test email sent successfully! Check your inbox.');
            await this.loadProfiles();
          } else {
            this.showError('Test failed: ' + (result.message || 'Unknown error'));
          }
        } catch (error) {
          console.error('Error testing profile:', error);
          this.showError('Test failed: ' + error.message);
        }
      };
    },

    /**
     * Delete profile
     */
    async deleteProfile(profileId) {
      const profile = this.currentProfiles.find(p => p.id === profileId);
      if (!profile) return;

      // Show custom delete confirmation modal
      document.getElementById('deleteProfileName').textContent = profile.name;
      const modal = document.getElementById('deleteEmailProfileModal');
      modal.showModal();

      // Handle confirmation
      const confirmBtn = document.getElementById('confirmDeleteBtn');
      confirmBtn.onclick = async () => {
        this.closeModal('deleteEmailProfileModal');
        
        try {
          await window.EmailService.deleteProfile(profileId);
          this.showSuccess('Email profile deleted successfully');
          await this.loadProfiles();

          // Log audit
          const session = window.getSession ? window.getSession() : null;
          if (window.Audit) {
            await window.Audit.log({
              id: this.generateId(),
              action: 'delete',
              entityType: 'email_profile',
              entityName: profile.name,
              user: session ? session.name : 'Admin',
              username: session ? session.username : 'admin',
              timestamp: new Date().toISOString(),
              ip: window.getLocalIP ? window.getLocalIP() : '127.0.0.1',
              details: { profileId }
            });
          }
        } catch (error) {
          console.error('Error deleting profile:', error);
          this.showError('Failed to delete email profile: ' + error.message);
        }
      };
    },

    /**
     * Attach event listeners
     */
    attachEventListeners() {
      const saveBtn = document.getElementById('saveEmailProfileBtn');
      if (saveBtn) {
        saveBtn.onclick = (e) => this.saveProfile(e);
      }

      const createBtn = document.getElementById('createEmailProfileBtn');
      if (createBtn) {
        createBtn.onclick = () => this.openCreateProfileModal();
      }

      // Auth required toggle
      const authRequiredCheckbox = document.getElementById('emailAuthRequired');
      const authFields = document.getElementById('emailAuthFields');
      if (authRequiredCheckbox && authFields) {
        authRequiredCheckbox.addEventListener('change', (e) => {
          authFields.style.display = e.target.checked ? 'block' : 'none';
        });
      }
    },

    /**
     * Close modal
     */
    closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;
      
      try {
        modal.close();
      } catch (e) {
        modal.removeAttribute('open');
      }
    },

    /**
     * Show success toast
     */
    showSuccess(message) {
      if (window.showToast) {
        window.showToast(message, 'success');
      } else {
        alert(message);
      }
    },

    /**
     * Show error toast
     */
    showError(message) {
      if (window.showToast) {
        window.showToast(message, 'error');
      } else {
        alert(message);
      }
    },

    /**
     * Show info toast
     */
    showInfo(message) {
      if (window.showToast) {
        window.showToast(message, 'info');
      } else {
        alert(message);
      }
    },

    /**
     * Escape HTML
     */
    escapeHtml(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text ? text.replace(/[&<>"']/g, m => map[m]) : '';
    },

    /**
     * Generate unique ID
     */
    generateId() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  };

  // Expose globally
  window.EmailUI = EmailUI;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Will be initialized when System Configuration view is shown
    });
  }
})();
