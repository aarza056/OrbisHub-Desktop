/**
 * OrbisHub Email Server Profile Service
 * Manages email server profiles, queue, and sending functionality
 * Similar to CRM Dynamics Email Server Profiles
 */

(function () {
  if (!window || !window.electronAPI) return;

  const EmailService = {
    /**
     * Get all email server profiles
     */
    async getAllProfiles() {
      try {
        const result = await window.electronAPI.dbQuery('SELECT * FROM EmailServerProfiles ORDER BY isDefault DESC, name ASC', []);
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch email profiles');
        }
        return result.data || [];
      } catch (error) {
        console.error('Error fetching email profiles:', error);
        throw error;
      }
    },

    /**
     * Get active/default email server profile
     */
    async getDefaultProfile() {
      try {
        const result = await window.electronAPI.dbQuery(
          'SELECT TOP 1 * FROM EmailServerProfiles WHERE isActive = 1 AND isDefault = 1 ORDER BY createdAt DESC',
          []
        );
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch default email profile');
        }
        return result.data && result.data.length > 0 ? result.data[0] : null;
      } catch (error) {
        console.error('Error fetching default email profile:', error);
        throw error;
      }
    },

    /**
     * Get email server profile by ID
     */
    async getProfileById(profileId) {
      try {
        const result = await window.electronAPI.dbQuery(
          'SELECT * FROM EmailServerProfiles WHERE id = @param0',
          [{ value: profileId }]
        );
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch email profile');
        }
        return result.data && result.data.length > 0 ? result.data[0] : null;
      } catch (error) {
        console.error('Error fetching email profile:', error);
        throw error;
      }
    },

    /**
     * Create new email server profile
     */
    async createProfile(profile) {
      try {
        const profileId = this.generateId();
        
        // If this is set as default, unset other defaults first
        if (profile.isDefault) {
          await window.electronAPI.dbExecute(
            'UPDATE EmailServerProfiles SET isDefault = 0',
            []
          );
        }

        // Encrypt password before storing
        let encryptedPassword = null;
        if (profile.password) {
          const encryptResult = await window.electronAPI.encryptMessage(profile.password);
          if (encryptResult && encryptResult.success) {
            encryptedPassword = encryptResult.encrypted;
          }
        }

        const result = await window.electronAPI.dbExecute(
          `INSERT INTO EmailServerProfiles (
            id, name, description, smtpHost, smtpPort, useSSL, useTLS,
            authRequired, username, password_encrypted, fromEmail, fromName, replyToEmail,
            isActive, isDefault, maxRetriesOnFailure, retryIntervalMinutes,
            maxEmailsPerHour, maxEmailsPerDay, createdBy, createdAt
          ) VALUES (
            @param0, @param1, @param2, @param3, @param4, @param5, @param6,
            @param7, @param8, @param9, @param10, @param11, @param12,
            @param13, @param14, @param15, @param16, @param17, @param18, @param19, GETDATE()
          )`,
          [
            { value: profileId },
            { value: profile.name },
            { value: profile.description || null },
            { value: profile.smtpHost },
            { value: profile.smtpPort || 587 },
            { value: profile.useSSL ? 1 : 0 },
            { value: profile.useTLS ? 1 : 0 },
            { value: profile.authRequired ? 1 : 0 },
            { value: profile.username || null },
            { value: encryptedPassword },
            { value: profile.fromEmail },
            { value: profile.fromName },
            { value: profile.replyToEmail || null },
            { value: profile.isActive ? 1 : 0 },
            { value: profile.isDefault ? 1 : 0 },
            { value: profile.maxRetriesOnFailure || 3 },
            { value: profile.retryIntervalMinutes || 5 },
            { value: profile.maxEmailsPerHour || null },
            { value: profile.maxEmailsPerDay || null },
            { value: profile.createdBy }
          ]
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to create email profile');
        }

        return profileId;
      } catch (error) {
        console.error('Error creating email profile:', error);
        throw error;
      }
    },

    /**
     * Update email server profile
     */
    async updateProfile(profileId, updates) {
      try {
        // If setting as default, unset other defaults first
        if (updates.isDefault) {
          await window.electronAPI.dbExecute(
            'UPDATE EmailServerProfiles SET isDefault = 0 WHERE id != @param0',
            [{ value: profileId }]
          );
        }

        // Encrypt password if provided
        let encryptedPassword = undefined;
        if (updates.password) {
          const encryptResult = await window.electronAPI.encryptMessage(updates.password);
          if (encryptResult && encryptResult.success) {
            encryptedPassword = encryptResult.encrypted;
          }
        }

        const params = [];
        const setClauses = [];
        let paramIndex = 0;

        const fieldMap = {
          name: 'name',
          description: 'description',
          smtpHost: 'smtpHost',
          smtpPort: 'smtpPort',
          useSSL: 'useSSL',
          useTLS: 'useTLS',
          authRequired: 'authRequired',
          username: 'username',
          fromEmail: 'fromEmail',
          fromName: 'fromName',
          replyToEmail: 'replyToEmail',
          isActive: 'isActive',
          isDefault: 'isDefault',
          maxRetriesOnFailure: 'maxRetriesOnFailure',
          retryIntervalMinutes: 'retryIntervalMinutes',
          maxEmailsPerHour: 'maxEmailsPerHour',
          maxEmailsPerDay: 'maxEmailsPerDay'
        };

        Object.keys(fieldMap).forEach(key => {
          if (updates[key] !== undefined) {
            setClauses.push(`${fieldMap[key]} = @param${paramIndex}`);
            let value = updates[key];
            if (typeof value === 'boolean') value = value ? 1 : 0;
            params.push({ value });
            paramIndex++;
          }
        });

        if (encryptedPassword !== undefined) {
          setClauses.push(`password_encrypted = @param${paramIndex}`);
          params.push({ value: encryptedPassword });
          paramIndex++;
        }

        if (updates.updatedBy) {
          setClauses.push(`updatedBy = @param${paramIndex}`);
          params.push({ value: updates.updatedBy });
          paramIndex++;
        }

        setClauses.push(`updatedAt = GETDATE()`);

        // Add WHERE clause parameter
        params.push({ value: profileId });

        const sql = `UPDATE EmailServerProfiles SET ${setClauses.join(', ')} WHERE id = @param${paramIndex}`;

        const result = await window.electronAPI.dbExecute(sql, params);

        if (!result.success) {
          throw new Error(result.error || 'Failed to update email profile');
        }

        return true;
      } catch (error) {
        console.error('Error updating email profile:', error);
        throw error;
      }
    },

    /**
     * Delete email server profile
     */
    async deleteProfile(profileId) {
      try {
        const result = await window.electronAPI.dbExecute(
          'DELETE FROM EmailServerProfiles WHERE id = @param0',
          [{ value: profileId }]
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete email profile');
        }

        return true;
      } catch (error) {
        console.error('Error deleting email profile:', error);
        throw error;
      }
    },

    /**
     * Test email server profile connection
     */
    async testProfile(profileId, testEmail) {
      try {
        const result = await window.electronAPI.testEmailProfile(profileId, testEmail);
        
        // Update test status in database
        await window.electronAPI.dbExecute(
          `UPDATE EmailServerProfiles 
           SET lastTestDate = GETDATE(), 
               lastTestStatus = @param0, 
               lastTestMessage = @param1 
           WHERE id = @param2`,
          [
            { value: result.success ? 'success' : 'failed' },
            { value: result.message || (result.success ? 'Test email sent successfully' : 'Test failed') },
            { value: profileId }
          ]
        );

        return result;
      } catch (error) {
        console.error('Error testing email profile:', error);
        
        // Update failure status
        await window.electronAPI.dbExecute(
          `UPDATE EmailServerProfiles 
           SET lastTestDate = GETDATE(), 
               lastTestStatus = 'failed', 
               lastTestMessage = @param0 
           WHERE id = @param1`,
          [
            { value: error.message || 'Connection test failed' },
            { value: profileId }
          ]
        );

        throw error;
      }
    },

    /**
     * Queue email for sending
     */
    async queueEmail(emailData) {
      try {
        const emailId = await window.electronAPI.dbQuery(
          `INSERT INTO EmailQueue (
            emailServerProfileId, toEmail, toName, ccEmails, bccEmails,
            subject, bodyHtml, bodyText, attachments, emailType,
            relatedEntityType, relatedEntityId, status, priority,
            attempts, maxAttempts, createdBy, createdAt
          ) OUTPUT INSERTED.id VALUES (
            @param0, @param1, @param2, @param3, @param4,
            @param5, @param6, @param7, @param8, @param9,
            @param10, @param11, @param12, @param13,
            @param14, @param15, @param16, GETDATE()
          )`,
          [
            { value: emailData.emailServerProfileId || null },
            { value: emailData.toEmail },
            { value: emailData.toName || null },
            { value: emailData.ccEmails ? JSON.stringify(emailData.ccEmails) : null },
            { value: emailData.bccEmails ? JSON.stringify(emailData.bccEmails) : null },
            { value: emailData.subject },
            { value: emailData.bodyHtml || null },
            { value: emailData.bodyText || null },
            { value: emailData.attachments ? JSON.stringify(emailData.attachments) : null },
            { value: emailData.emailType || 'custom' },
            { value: emailData.relatedEntityType || null },
            { value: emailData.relatedEntityId || null },
            { value: 'pending' },
            { value: emailData.priority || 5 },
            { value: 0 },
            { value: emailData.maxAttempts || 3 },
            { value: emailData.createdBy || null }
          ]
        );

        if (!emailId.success || !emailId.data || emailId.data.length === 0) {
          throw new Error('Failed to queue email');
        }

        return emailId.data[0].id;
      } catch (error) {
        console.error('Error queuing email:', error);
        throw error;
      }
    },

    /**
     * Send email from queue
     */
    async sendQueuedEmail(emailQueueId) {
      try {
        const result = await window.electronAPI.sendEmailFromQueue(emailQueueId);
        return result;
      } catch (error) {
        console.error('Error sending queued email:', error);
        throw error;
      }
    },

    /**
     * Get email queue items
     */
    async getQueueItems(filters = {}) {
      try {
        let whereClauses = [];
        let params = [];
        let paramIndex = 0;

        if (filters.status) {
          whereClauses.push(`status = @param${paramIndex}`);
          params.push({ value: filters.status });
          paramIndex++;
        }

        if (filters.emailType) {
          whereClauses.push(`emailType = @param${paramIndex}`);
          params.push({ value: filters.emailType });
          paramIndex++;
        }

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const sql = `SELECT * FROM EmailQueue ${whereClause} ORDER BY priority ASC, createdAt DESC`;

        const result = await window.electronAPI.dbQuery(sql, params);

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch email queue');
        }

        return result.data || [];
      } catch (error) {
        console.error('Error fetching email queue:', error);
        throw error;
      }
    },

    /**
     * Get email templates
     */
    async getTemplates(emailType = null) {
      try {
        const sql = emailType
          ? 'SELECT * FROM EmailTemplates WHERE emailType = @param0 AND isActive = 1 ORDER BY name ASC'
          : 'SELECT * FROM EmailTemplates WHERE isActive = 1 ORDER BY emailType ASC, name ASC';
        
        const params = emailType ? [{ value: emailType }] : [];
        const result = await window.electronAPI.dbQuery(sql, params);

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch email templates');
        }

        return result.data || [];
      } catch (error) {
        console.error('Error fetching email templates:', error);
        throw error;
      }
    },

    /**
     * Render email template with variables
     */
    renderTemplate(template, variables) {
      let subject = template.subject;
      let bodyHtml = template.bodyHtml;
      let bodyText = template.bodyText || '';

      Object.keys(variables).forEach(key => {
        const placeholder = `{{${key}}}`;
        const value = variables[key] || '';
        subject = subject.replace(new RegExp(placeholder, 'g'), value);
        bodyHtml = bodyHtml.replace(new RegExp(placeholder, 'g'), value);
        bodyText = bodyText.replace(new RegExp(placeholder, 'g'), value);
      });

      return { subject, bodyHtml, bodyText };
    },

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(userId, userEmail, userName, resetToken) {
      try {
        const templates = await this.getTemplates('password_reset');
        if (!templates || templates.length === 0) {
          throw new Error('Password reset email template not found');
        }

        const template = templates[0];
        const resetLink = `orbis://reset-password?token=${resetToken}`;
        const expiryTime = '30 minutes';

        const rendered = this.renderTemplate(template, {
          userName,
          resetLink,
          expiryTime
        });

        const emailId = await this.queueEmail({
          toEmail: userEmail,
          toName: userName,
          subject: rendered.subject,
          bodyHtml: rendered.bodyHtml,
          bodyText: rendered.bodyText,
          emailType: 'password_reset',
          relatedEntityType: 'user',
          relatedEntityId: userId,
          priority: 2,
          createdBy: 'system'
        });

        // Try to send immediately
        await this.sendQueuedEmail(emailId);

        return emailId;
      } catch (error) {
        console.error('Error sending password reset email:', error);
        throw error;
      }
    },

    /**
     * Send bug report email
     */
    async sendBugReportEmail(bugData, recipientEmail) {
      try {
        const templates = await this.getTemplates('bug_report');
        if (!templates || templates.length === 0) {
          throw new Error('Bug report email template not found');
        }

        const template = templates[0];
        const rendered = this.renderTemplate(template, {
          bugTitle: bugData.title,
          reporterName: bugData.reporterName,
          reporterEmail: bugData.reporterEmail,
          severity: bugData.severity,
          bugDescription: bugData.description,
          bugLink: `orbis://bugs/${bugData.id}`
        });

        const emailId = await this.queueEmail({
          toEmail: recipientEmail,
          subject: rendered.subject,
          bodyHtml: rendered.bodyHtml,
          bodyText: rendered.bodyText,
          emailType: 'bug_report',
          relatedEntityType: 'bug',
          relatedEntityId: bugData.id,
          priority: 3,
          createdBy: bugData.reporterId || 'system'
        });

        // Try to send immediately
        await this.sendQueuedEmail(emailId);

        return emailId;
      } catch (error) {
        console.error('Error sending bug report email:', error);
        throw error;
      }
    },

    /**
     * Get email sent history
     */
    async getSentHistory(filters = {}) {
      try {
        let whereClauses = [];
        let params = [];
        let paramIndex = 0;

        if (filters.emailType) {
          whereClauses.push(`emailType = @param${paramIndex}`);
          params.push({ value: filters.emailType });
          paramIndex++;
        }

        if (filters.toEmail) {
          whereClauses.push(`toEmail LIKE @param${paramIndex}`);
          params.push({ value: `%${filters.toEmail}%` });
          paramIndex++;
        }

        if (filters.startDate) {
          whereClauses.push(`sentAt >= @param${paramIndex}`);
          params.push({ value: filters.startDate });
          paramIndex++;
        }

        if (filters.endDate) {
          whereClauses.push(`sentAt <= @param${paramIndex}`);
          params.push({ value: filters.endDate });
          paramIndex++;
        }

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const sql = `SELECT TOP 500 * FROM EmailSentHistory ${whereClause} ORDER BY sentAt DESC`;

        const result = await window.electronAPI.dbQuery(sql, params);

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch email history');
        }

        return result.data || [];
      } catch (error) {
        console.error('Error fetching email history:', error);
        throw error;
      }
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
  window.EmailService = EmailService;
})();
