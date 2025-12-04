/**
 * User Recovery UI Controller
 * Manages the forgot password and reset password interface
 */

(function () {
  if (!window.RecoveryService) {
    console.error('RecoveryService not loaded');
    return;
  }

  const RecoveryUI = {
    modalsLoaded: false,
    currentToken: null,
    currentUser: null,

    /**
     * Initialize Recovery UI
     */
    async init() {
      console.log('🔐 Initializing User Recovery UI...');
      await this.loadModals();
      // Event listeners are now attached in loadModals() after HTML is loaded
    },

    /**
     * Load modal HTML from external file
     */
    async loadModals() {
      if (this.modalsLoaded) return;
      
      try {
        const response = await fetch('../Functions/UserRecovery/recovery-modals.html');
        const html = await response.text();
        
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        while (temp.firstChild) {
          document.body.appendChild(temp.firstChild);
        }
        
        this.modalsLoaded = true;
        
        // Attach event listeners after modals are loaded
        this.attachEventListeners();
        
        console.log('✅ Recovery modals loaded');
      } catch (error) {
        console.error('❌ Error loading recovery modals:', error);
      }
    },

    /**
     * Attach event listeners
     */
    attachEventListeners() {
      // Request reset form
      const requestForm = document.getElementById('requestResetForm');
      if (requestForm) {
        requestForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleRequestReset();
        });
      }

      // Verify token form
      const verifyTokenForm = document.getElementById('verifyTokenForm');
      if (verifyTokenForm) {
        verifyTokenForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleVerifyToken();
        });
      }

      // Reset password form
      const resetPasswordForm = document.getElementById('resetPasswordForm');
      if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleResetPassword();
        });
      }

      // Password visibility toggles
      this.setupPasswordToggles();
    },

    /**
     * Setup password visibility toggles
     */
    setupPasswordToggles() {
      const toggles = document.querySelectorAll('.toggle-password');
      toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
          const input = toggle.previousElementSibling;
          const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
          input.setAttribute('type', type);
          
          const icon = toggle.querySelector('svg use');
          if (icon) {
            icon.setAttribute('xlink:href', type === 'password' ? '#eye-icon' : '#eye-off-icon');
          }
        });
      });
    },

    /**
     * Open forgot password modal
     */
    openForgotPasswordModal() {
      const modal = document.getElementById('forgotPasswordModal');
      if (modal) {
        this.resetForgotPasswordForm();
        try {
          modal.showModal();
        } catch (e) {
          modal.setAttribute('open', '');
        }
      }
    },

    /**
     * Close forgot password modal
     */
    closeForgotPasswordModal() {
      const modal = document.getElementById('forgotPasswordModal');
      if (modal) {
        try {
          modal.close();
        } catch (e) {
          modal.removeAttribute('open');
        }
        this.resetForgotPasswordForm();
      }
    },

    /**
     * Reset forgot password form
     */
    resetForgotPasswordForm() {
      const form = document.getElementById('requestResetForm');
      if (form) form.reset();

      const requestStep = document.getElementById('requestResetStep');
      const verifyStep = document.getElementById('verifyTokenStep');
      const resetStep = document.getElementById('resetPasswordStep');

      if (requestStep) requestStep.style.display = 'block';
      if (verifyStep) verifyStep.style.display = 'none';
      if (resetStep) resetStep.style.display = 'none';

      this.clearMessages();
      this.currentToken = null;
      this.currentUser = null;
    },

    /**
     * Handle request password reset
     */
    async handleRequestReset() {
      const usernameOrEmail = document.getElementById('recoveryUsernameOrEmail').value.trim();
      
      if (!usernameOrEmail) {
        this.showError('Please enter your username or email address', 'requestResetError');
        return;
      }

      this.setLoading('requestResetBtn', true);
      this.clearMessages();

      try {
        const result = await window.RecoveryService.requestPasswordReset(usernameOrEmail);

        if (result.success) {
          this.showSuccess(result.message, 'requestResetSuccess');
          
          // Show the verify token step after 2 seconds
          setTimeout(() => {
            this.showVerifyTokenStep();
          }, 2000);
        } else {
          this.showError(result.message, 'requestResetError');
        }
      } catch (error) {
        console.error('Error requesting reset:', error);
        this.showError('An error occurred. Please try again.', 'requestResetError');
      } finally {
        this.setLoading('requestResetBtn', false);
      }
    },

    /**
     * Show verify token step
     */
    showVerifyTokenStep() {
      const requestStep = document.getElementById('requestResetStep');
      const verifyStep = document.getElementById('verifyTokenStep');

      if (requestStep) requestStep.style.display = 'none';
      if (verifyStep) verifyStep.style.display = 'block';

      // Focus on token input
      const tokenInput = document.getElementById('resetToken');
      if (tokenInput) {
        setTimeout(() => tokenInput.focus(), 100);
      }
    },

    /**
     * Go back to request step
     */
    backToRequestStep() {
      const requestStep = document.getElementById('requestResetStep');
      const verifyStep = document.getElementById('verifyTokenStep');

      if (requestStep) requestStep.style.display = 'block';
      if (verifyStep) verifyStep.style.display = 'none';

      this.clearMessages();
    },

    /**
     * Handle verify token
     */
    async handleVerifyToken() {
      const token = document.getElementById('resetToken').value.trim();
      
      if (!token) {
        this.showError('Please enter the reset token from your email', 'verifyTokenError');
        return;
      }

      this.setLoading('verifyTokenBtn', true);
      this.clearMessages();

      try {
        const result = await window.RecoveryService.verifyResetToken(token);

        if (result.success && result.valid) {
          this.currentToken = token;
          this.currentUser = result.user;
          
          this.showSuccess('Token verified! Please enter your new password.', 'verifyTokenSuccess');
          
          // Show reset password step after 1 second
          setTimeout(() => {
            this.showResetPasswordStep();
          }, 1000);
        } else {
          this.showError(result.message || 'Invalid or expired token', 'verifyTokenError');
        }
      } catch (error) {
        console.error('Error verifying token:', error);
        this.showError('An error occurred. Please try again.', 'verifyTokenError');
      } finally {
        this.setLoading('verifyTokenBtn', false);
      }
    },

    /**
     * Show reset password step
     */
    showResetPasswordStep() {
      const verifyStep = document.getElementById('verifyTokenStep');
      const resetStep = document.getElementById('resetPasswordStep');

      if (verifyStep) verifyStep.style.display = 'none';
      if (resetStep) resetStep.style.display = 'block';

      // Display username
      const usernameDisplay = document.getElementById('resetUsernameDisplay');
      if (usernameDisplay && this.currentUser) {
        usernameDisplay.textContent = this.currentUser.username;
      }

      // Focus on password input
      const passwordInput = document.getElementById('recoveryNewPassword');
      if (passwordInput) {
        setTimeout(() => passwordInput.focus(), 100);
      }
    },

    /**
     * Go back to verify step
     */
    backToVerifyStep() {
      const verifyStep = document.getElementById('verifyTokenStep');
      const resetStep = document.getElementById('resetPasswordStep');

      if (verifyStep) verifyStep.style.display = 'block';
      if (resetStep) resetStep.style.display = 'none';

      this.clearMessages();
    },

    /**
     * Handle reset password
     */
    async handleResetPassword() {
      const newPasswordInput = document.getElementById('recoveryNewPassword');
      const confirmPasswordInput = document.getElementById('recoveryConfirmNewPassword');
      
      const newPassword = newPasswordInput?.value?.trim() || '';
      const confirmPassword = confirmPasswordInput?.value?.trim() || '';
      
      // Validate passwords
      if (!newPassword || !confirmPassword) {
        this.showError('Please fill in both password fields', 'resetPasswordError');
        return;
      }

      if (newPassword !== confirmPassword) {
        this.showError('Passwords do not match', 'resetPasswordError');
        return;
      }

      // Validate password strength
      const validation = window.RecoveryService.validatePassword(newPassword);
      if (!validation.valid) {
        this.showError(validation.message, 'resetPasswordError');
        return;
      }

      if (!this.currentToken) {
        this.showError('Invalid session. Please start over.', 'resetPasswordError');
        return;
      }

      this.setLoading('resetPasswordBtn', true);
      this.clearMessages();

      try {
        const result = await window.RecoveryService.resetPassword(this.currentToken, newPassword);

        if (result.success) {
          this.showSuccess(result.message, 'resetPasswordSuccess');
          
          // Close modal and return to login after 3 seconds
          setTimeout(() => {
            this.closeForgotPasswordModal();
            this.showLoginSuccessMessage();
          }, 3000);
        } else {
          this.showError(result.message, 'resetPasswordError');
        }
      } catch (error) {
        console.error('Error resetting password:', error);
        this.showError('An error occurred. Please try again.', 'resetPasswordError');
      } finally {
        this.setLoading('resetPasswordBtn', false);
      }
    },

    /**
     * Show login success message
     */
    showLoginSuccessMessage() {
      // Show a toast notification on the login screen
      if (window.Toast) {
        window.Toast.success('Password reset successful! You can now login with your new password.');
      } else {
        alert('Password reset successful! You can now login with your new password.');
      }
    },

    /**
     * Show error message
     */
    showError(message, elementId) {
      const errorEl = document.getElementById(elementId);
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        
        // Auto-hide after 8 seconds
        setTimeout(() => {
          errorEl.style.display = 'none';
        }, 8000);
      }
    },

    /**
     * Show success message
     */
    showSuccess(message, elementId) {
      const successEl = document.getElementById(elementId);
      if (successEl) {
        successEl.textContent = message;
        successEl.style.display = 'block';
      }
    },

    /**
     * Clear all messages
     */
    clearMessages() {
      const messageElements = [
        'requestResetError', 'requestResetSuccess',
        'verifyTokenError', 'verifyTokenSuccess',
        'resetPasswordError', 'resetPasswordSuccess'
      ];

      messageElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = 'none';
          el.textContent = '';
        }
      });
    },

    /**
     * Set button loading state
     */
    setLoading(buttonId, loading) {
      const button = document.getElementById(buttonId);
      if (button) {
        button.disabled = loading;
        
        if (loading) {
          button.dataset.originalText = button.textContent;
          button.innerHTML = `
            <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="60" stroke-dashoffset="0">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
              </circle>
            </svg>
            Processing...
          `;
        } else {
          button.textContent = button.dataset.originalText || 'Submit';
        }
      }
    },

    /**
     * Utility to escape HTML
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  };

  // Expose globally
  window.RecoveryUI = RecoveryUI;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      RecoveryUI.init();
    });
  } else {
    RecoveryUI.init();
  }

  console.log('✅ RecoveryUI initialized');

})();
