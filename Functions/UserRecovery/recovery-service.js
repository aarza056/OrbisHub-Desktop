/**
 * OrbisHub User Recovery Service
 * Handles password reset and account recovery via email
 */

(function () {
  if (!window || !window.electronAPI) return;

  const RecoveryService = {
    /**
     * Generate a secure random token
     */
    generateToken() {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Generate a unique ID
     */
    generateId() {
      return 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Request password reset for a user
     * @param {string} usernameOrEmail - Username or email address
     * @returns {Promise<Object>} Result with success status and message
     */
    async requestPasswordReset(usernameOrEmail) {
      try {
        // Step 1: Find user by username or email
        const userResult = await window.electronAPI.dbQuery(
          'EXEC sp_GetUserForRecovery @param0',
          [{ value: usernameOrEmail }]
        );

        if (!userResult.success || !userResult.data || userResult.data.length === 0) {
          // Don't reveal whether user exists (security best practice)
          // Always return success to prevent user enumeration
          return {
            success: true,
            message: 'If an account exists with that information, a password reset email has been sent.'
          };
        }

        const user = userResult.data[0];

        // Validate user has an email
        if (!user.email || user.email.trim() === '') {
          return {
            success: false,
            message: 'No email address associated with this account. Please contact your administrator.'
          };
        }

        // Step 2: Generate reset token
        const token = this.generateToken();
        const expiryMinutes = 60; // Token expires in 1 hour

        // Step 3: Create token record in database
        const tokenResult = await window.electronAPI.dbQuery(
          `EXEC sp_CreatePasswordResetToken 
            @param0, @param1, @param2, @param3, @param4, @param5`,
          [
            { value: user.id },
            { value: token },
            { value: user.email },
            { value: expiryMinutes },
            { value: this.getLocalIP() },
            { value: navigator.userAgent }
          ]
        );

        if (!tokenResult.success || !tokenResult.data || tokenResult.data.length === 0) {
          throw new Error('Failed to create reset token');
        }

        const tokenRecord = tokenResult.data[0];

        // Step 4: Get default email profile
        if (!window.EmailService) {
          throw new Error('Email service not available. Please contact administrator.');
        }

        const emailProfile = await window.EmailService.getDefaultProfile();
        if (!emailProfile) {
          throw new Error('No email server configured. Please contact administrator.');
        }

        // Step 5: Create reset link (electron app uses custom protocol or localhost)
        // For desktop app, we'll use a token-based approach shown in the UI
        const resetLink = `orbishub://reset-password?token=${token}`;
        
        // Step 6: Prepare email content
        const emailSubject = 'Reset Your OrbisHub Password';
        const emailBody = this.generateResetEmail(user.name || user.username, token, expiryMinutes, resetLink);

        // Step 7: Queue email for sending
        const emailQueueId = await window.EmailService.queueEmail({
          toEmail: user.email,
          toName: user.name || user.username,
          subject: emailSubject,
          bodyText: emailBody.text,
          bodyHtml: emailBody.html,
          priority: 10,
          emailType: 'password-reset',
          relatedEntityType: 'password-reset',
          relatedEntityId: tokenRecord.id,
          createdBy: user.id
        });

        if (!emailQueueId) {
          throw new Error('Failed to queue reset email');
        }

        // Try to send the email immediately
        try {
          await window.EmailService.sendQueuedEmail(emailQueueId);
        } catch (emailError) {
          console.warn('Email queued but failed to send immediately:', emailError);
          // Email is still in queue, can be retried later
        }

        // Step 8: Update token with email sent status
        await window.electronAPI.dbExecute(
          `UPDATE PasswordResetTokens 
           SET emailSentAt = GETDATE(), emailStatus = @param0 
           WHERE id = @param1`,
          [
            { value: 'sent' },
            { value: tokenRecord.id }
          ]
        );

        // Step 9: Log the recovery attempt
        await this.logRecoveryAttempt({
          userId: user.id,
          username: user.username,
          email: user.email,
          action: 'request_reset',
          status: 'success'
        });

        return {
          success: true,
          message: 'If an account exists with that information, a password reset email has been sent.',
          tokenId: tokenRecord.id // For internal tracking only
        };

      } catch (error) {
        console.error('Error requesting password reset:', error);
        
        // Log the failure
        await this.logRecoveryAttempt({
          username: usernameOrEmail,
          action: 'request_reset',
          status: 'failed',
          failureReason: error.message
        });

        return {
          success: false,
          message: 'An error occurred while processing your request. Please try again or contact support.'
        };
      }
    },

    /**
     * Verify a password reset token
     * @param {string} token - The reset token
     * @returns {Promise<Object>} Verification result with user info if valid
     */
    async verifyResetToken(token) {
      try {
        const result = await window.electronAPI.dbQuery(
          'EXEC sp_VerifyPasswordResetToken @param0, @param1',
          [
            { value: token },
            { value: 0 } // Don't mark as used yet
          ]
        );

        if (!result.success || !result.data || result.data.length === 0) {
          return {
            success: false,
            valid: false,
            message: 'Invalid or expired reset token'
          };
        }

        const tokenData = result.data[0];

        if (!tokenData.isValid || tokenData.isValid === 0) {
          let message = 'Invalid or expired reset token';
          if (tokenData.isUsed) {
            message = 'This reset token has already been used';
          } else if (new Date(tokenData.expiresAt) < new Date()) {
            message = 'This reset token has expired';
          }

          return {
            success: false,
            valid: false,
            message: message
          };
        }

        // Get user information
        const userResult = await window.electronAPI.dbQuery(
          'SELECT id, username, email, name FROM Users WHERE id = @param0',
          [{ value: tokenData.userId }]
        );

        if (!userResult.success || !userResult.data || userResult.data.length === 0) {
          return {
            success: false,
            valid: false,
            message: 'User not found'
          };
        }

        const user = userResult.data[0];

        // Log verification
        await this.logRecoveryAttempt({
          userId: user.id,
          username: user.username,
          email: user.email,
          action: 'verify_token',
          status: 'success'
        });

        return {
          success: true,
          valid: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            name: user.name
          },
          expiresAt: tokenData.expiresAt
        };

      } catch (error) {
        console.error('Error verifying reset token:', error);
        return {
          success: false,
          valid: false,
          message: 'Error verifying token'
        };
      }
    },

    /**
     * Reset user password with a valid token
     * @param {string} token - The reset token
     * @param {string} newPassword - The new password
     * @returns {Promise<Object>} Result of password reset
     */
    async resetPassword(token, newPassword) {
      try {
        // Step 1: Verify token is still valid
        const verifyResult = await this.verifyResetToken(token);
        if (!verifyResult.success || !verifyResult.valid) {
          return {
            success: false,
            message: verifyResult.message || 'Invalid or expired token'
          };
        }

        const user = verifyResult.user;

        // Step 2: Validate password
        const validation = this.validatePassword(newPassword);
        if (!validation.valid) {
          return {
            success: false,
            message: validation.message
          };
        }

        // Step 3: Hash the new password
        const hashResult = await window.electronAPI.hashPassword(newPassword);
        if (!hashResult || !hashResult.success) {
          throw new Error('Failed to hash password');
        }

        // Step 4: Update user password and clear failed login attempts
        const updateResult = await window.electronAPI.dbExecute(
          `UPDATE Users 
           SET password = @param0, 
               failedLoginAttempts = 0, 
               lockedUntil = NULL,
               changePasswordOnLogin = 0
           WHERE id = @param1`,
          [
            { value: hashResult.hash },
            { value: user.id }
          ]
        );

        if (!updateResult.success) {
          throw new Error('Failed to update password');
        }

        // Step 5: Mark token as used
        await window.electronAPI.dbExecute(
          'EXEC sp_VerifyPasswordResetToken @param0, @param1',
          [
            { value: token },
            { value: 1 } // Mark as used
          ]
        );

        // Step 6: Log successful password reset
        await this.logRecoveryAttempt({
          userId: user.id,
          username: user.username,
          email: user.email,
          action: 'reset_password',
          status: 'success'
        });

        // Step 7: Send confirmation email (optional but recommended)
        try {
          await this.sendPasswordChangedEmail(user);
        } catch (emailError) {
          console.warn('Failed to send confirmation email:', emailError);
          // Don't fail the whole operation if email fails
        }

        return {
          success: true,
          message: 'Password successfully reset. You can now login with your new password.'
        };

      } catch (error) {
        console.error('Error resetting password:', error);
        
        await this.logRecoveryAttempt({
          action: 'reset_password',
          status: 'failed',
          failureReason: error.message
        });

        return {
          success: false,
          message: 'An error occurred while resetting your password. Please try again.'
        };
      }
    },

    /**
     * Validate password strength
     */
    validatePassword(password) {
      if (!password || password.length < 8) {
        return {
          valid: false,
          message: 'Password must be at least 8 characters long'
        };
      }

      if (password.length > 128) {
        return {
          valid: false,
          message: 'Password must be less than 128 characters'
        };
      }

      // Check for at least one number
      if (!/\d/.test(password)) {
        return {
          valid: false,
          message: 'Password must contain at least one number'
        };
      }

      // Check for at least one letter
      if (!/[a-zA-Z]/.test(password)) {
        return {
          valid: false,
          message: 'Password must contain at least one letter'
        };
      }

      return { valid: true };
    },

    /**
     * Generate password reset email content
     */
    generateResetEmail(userName, token, expiryMinutes, resetLink) {
      const text = `Hello ${userName},

We received a request to reset your password for your OrbisHub account.

Your password reset token is: ${token}

To reset your password:
1. Click the "Forgot Password" link on the login screen
2. Click "I have a reset token"
3. Enter this token: ${token}
4. Set your new password

This token will expire in ${expiryMinutes} minutes.

If you did not request a password reset, please ignore this email and contact your system administrator immediately.

---
OrbisHub - IT Management System
This is an automated message, please do not reply.`;

      const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">🔐 Password Reset</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="font-size: 16px; color: #374151; margin: 0 0 20px;">Hello <strong>${userName}</strong>,</p>
                            
                            <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0 0 25px;">
                                We received a request to reset your password for your OrbisHub account.
                            </p>
                            
                            <div style="background-color: #f9fafb; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 25px; border-radius: 4px;">
                                <p style="font-size: 13px; color: #6b7280; margin: 0 0 10px;">Your password reset token:</p>
                                <p style="font-size: 18px; font-weight: 600; color: #1f2937; font-family: 'Courier New', monospace; margin: 0; letter-spacing: 1px;">${token}</p>
                            </div>
                            
                            <div style="background-color: #eff6ff; border: 1px solid #dbeafe; padding: 15px; border-radius: 6px; margin: 0 0 25px;">
                                <p style="font-size: 13px; color: #1e40af; margin: 0 0 10px; font-weight: 600;">📋 To reset your password:</p>
                                <ol style="font-size: 13px; color: #1e40af; margin: 0; padding-left: 20px; line-height: 1.8;">
                                    <li>Click the "Forgot Password" link on the login screen</li>
                                    <li>Click "I have a reset token"</li>
                                    <li>Enter the token shown above</li>
                                    <li>Set your new password</li>
                                </ol>
                            </div>
                            
                            <p style="font-size: 13px; color: #9ca3af; margin: 0 0 20px;">
                                ⏱️ This token will expire in <strong style="color: #ef4444;">${expiryMinutes} minutes</strong>.
                            </p>
                            
                            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 0; border-radius: 4px;">
                                <p style="font-size: 13px; color: #991b1b; margin: 0;">
                                    <strong>⚠️ Security Notice:</strong> If you did not request a password reset, please ignore this email and contact your system administrator immediately.
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                                <strong>OrbisHub</strong> - IT Management System<br>
                                This is an automated message, please do not reply.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

      return { text, html };
    },

    /**
     * Send password changed confirmation email
     */
    async sendPasswordChangedEmail(user) {
      if (!window.EmailService) return;

      const emailBody = {
        text: `Hello ${user.name || user.username},

This is to confirm that your OrbisHub password has been successfully changed.

If you did not make this change, please contact your system administrator immediately.

---
OrbisHub - IT Management System`,
        html: `<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">✅ Password Changed</h1>
        </div>
        <div style="padding: 30px;">
            <p style="font-size: 16px; color: #374151;">Hello <strong>${user.name || user.username}</strong>,</p>
            <p style="font-size: 14px; color: #6b7280;">This is to confirm that your OrbisHub password has been successfully changed.</p>
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="font-size: 13px; color: #991b1b; margin: 0;">
                    <strong>⚠️ Security Notice:</strong> If you did not make this change, please contact your system administrator immediately.
                </p>
            </div>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">OrbisHub - IT Management System</p>
        </div>
    </div>
</body>
</html>`
      };

      const emailQueueId = await window.EmailService.queueEmail({
        toEmail: user.email,
        toName: user.name || user.username,
        subject: 'Your OrbisHub Password Has Been Changed',
        bodyText: emailBody.text,
        bodyHtml: emailBody.html,
        priority: 10,
        emailType: 'security',
        relatedEntityType: 'user',
        relatedEntityId: user.id,
        createdBy: user.id
      });

      // Try to send the email immediately
      if (emailQueueId) {
        try {
          await window.EmailService.sendQueuedEmail(emailQueueId);
        } catch (emailError) {
          console.warn('Confirmation email queued but failed to send immediately:', emailError);
        }
      }
    },

    /**
     * Log recovery attempt
     */
    async logRecoveryAttempt(data) {
      try {
        const logId = this.generateId();
        await window.electronAPI.dbExecute(
          `INSERT INTO AccountRecoveryLog (
            id, userId, username, email, action, status, 
            requestIp, userAgent, failureReason, createdAt
          ) VALUES (
            @param0, @param1, @param2, @param3, @param4, @param5,
            @param6, @param7, @param8, GETDATE()
          )`,
          [
            { value: logId },
            { value: data.userId || null },
            { value: data.username || null },
            { value: data.email || null },
            { value: data.action },
            { value: data.status },
            { value: this.getLocalIP() },
            { value: navigator.userAgent },
            { value: data.failureReason || null }
          ]
        );
      } catch (error) {
        console.error('Error logging recovery attempt:', error);
      }
    },

    /**
     * Get local IP (placeholder - returns localhost for desktop app)
     */
    getLocalIP() {
      return '127.0.0.1';
    },

    /**
     * Clean up expired tokens (admin function)
     */
    async cleanupExpiredTokens(retentionDays = 30) {
      try {
        const result = await window.electronAPI.dbQuery(
          'EXEC sp_CleanupExpiredResetTokens @param0',
          [{ value: retentionDays }]
        );

        return {
          success: result.success,
          data: result.data && result.data.length > 0 ? result.data[0] : null
        };
      } catch (error) {
        console.error('Error cleaning up expired tokens:', error);
        return { success: false, error: error.message };
      }
    }
  };

  // Expose globally
  window.RecoveryService = RecoveryService;

  console.log('✅ RecoveryService initialized');

})();
