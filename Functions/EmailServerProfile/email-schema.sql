-- =====================================================
-- OrbisHub Email Server Profile Schema
-- Similar to CRM Dynamics Email Server Profiles
-- =====================================================

USE [OrbisHub]
GO

-- Email Server Profiles Table
-- Stores SMTP configuration for outbound email
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailServerProfiles')
BEGIN
    CREATE TABLE EmailServerProfiles (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(500) NULL,
        
        -- SMTP Configuration
        smtpHost NVARCHAR(255) NOT NULL,
        smtpPort INT NOT NULL DEFAULT 587,
        useSSL BIT NOT NULL DEFAULT 1,
        useTLS BIT NOT NULL DEFAULT 1,
        
        -- Authentication
        authRequired BIT NOT NULL DEFAULT 1,
        username NVARCHAR(255) NULL,
        password_encrypted NVARCHAR(MAX) NULL, -- Encrypted password
        
        -- Sender Information
        fromEmail NVARCHAR(255) NOT NULL,
        fromName NVARCHAR(255) NOT NULL,
        replyToEmail NVARCHAR(255) NULL,
        
        -- Settings
        isActive BIT NOT NULL DEFAULT 1,
        isDefault BIT NOT NULL DEFAULT 0,
        maxRetriesOnFailure INT NOT NULL DEFAULT 3,
        retryIntervalMinutes INT NOT NULL DEFAULT 5,
        
        -- Rate Limiting
        maxEmailsPerHour INT NULL,
        maxEmailsPerDay INT NULL,
        
        -- Testing & Validation
        lastTestDate DATETIME2 NULL,
        lastTestStatus NVARCHAR(50) NULL, -- 'success', 'failed'
        lastTestMessage NVARCHAR(MAX) NULL,
        
        -- Audit
        createdBy NVARCHAR(50) NOT NULL,
        createdAt DATETIME2 DEFAULT GETDATE(),
        updatedBy NVARCHAR(50) NULL,
        updatedAt DATETIME2 NULL,
        
        CONSTRAINT FK_EmailServerProfile_CreatedBy FOREIGN KEY (createdBy) REFERENCES Users(id) ON DELETE NO ACTION,
        CONSTRAINT FK_EmailServerProfile_UpdatedBy FOREIGN KEY (updatedBy) REFERENCES Users(id) ON DELETE NO ACTION,
        CONSTRAINT CK_EmailServerProfile_Port CHECK (smtpPort BETWEEN 1 AND 65535)
    );

    CREATE INDEX IX_EmailServerProfiles_IsActive ON EmailServerProfiles(isActive);
    CREATE INDEX IX_EmailServerProfiles_IsDefault ON EmailServerProfiles(isDefault);
    CREATE INDEX IX_EmailServerProfiles_CreatedAt ON EmailServerProfiles(createdAt);
END
GO

-- Email Queue Table
-- Stores emails to be sent (retry mechanism)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailQueue')
BEGIN
    CREATE TABLE EmailQueue (
        id INT PRIMARY KEY IDENTITY(1,1),
        emailServerProfileId NVARCHAR(50) NULL,
        
        -- Email Details
        toEmail NVARCHAR(255) NOT NULL,
        toName NVARCHAR(255) NULL,
        ccEmails NVARCHAR(MAX) NULL, -- JSON array
        bccEmails NVARCHAR(MAX) NULL, -- JSON array
        subject NVARCHAR(500) NOT NULL,
        bodyHtml NVARCHAR(MAX) NULL,
        bodyText NVARCHAR(MAX) NULL,
        attachments NVARCHAR(MAX) NULL, -- JSON array of file paths or base64
        
        -- Email Type & Context
        emailType NVARCHAR(50) NOT NULL, -- 'password_reset', 'bug_report', 'notification', 'alert', 'custom'
        relatedEntityType NVARCHAR(50) NULL, -- 'user', 'bug', 'ticket', etc.
        relatedEntityId NVARCHAR(50) NULL,
        
        -- Queue Status
        status NVARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sending', 'sent', 'failed', 'cancelled'
        priority INT NOT NULL DEFAULT 5, -- 1-10, lower is higher priority
        
        -- Retry Logic
        attempts INT NOT NULL DEFAULT 0,
        maxAttempts INT NOT NULL DEFAULT 3,
        lastAttemptDate DATETIME2 NULL,
        nextRetryDate DATETIME2 NULL,
        errorMessage NVARCHAR(MAX) NULL,
        
        -- Timestamps
        createdBy NVARCHAR(50) NULL,
        createdAt DATETIME2 DEFAULT GETDATE(),
        sentAt DATETIME2 NULL,
        
        CONSTRAINT FK_EmailQueue_Profile FOREIGN KEY (emailServerProfileId) REFERENCES EmailServerProfiles(id) ON DELETE SET NULL,
        CONSTRAINT FK_EmailQueue_CreatedBy FOREIGN KEY (createdBy) REFERENCES Users(id) ON DELETE NO ACTION,
        CONSTRAINT CK_EmailQueue_Status CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
        CONSTRAINT CK_EmailQueue_Priority CHECK (priority BETWEEN 1 AND 10)
    );

    CREATE INDEX IX_EmailQueue_Status ON EmailQueue(status);
    CREATE INDEX IX_EmailQueue_Priority ON EmailQueue(priority);
    CREATE INDEX IX_EmailQueue_NextRetryDate ON EmailQueue(nextRetryDate);
    CREATE INDEX IX_EmailQueue_EmailType ON EmailQueue(emailType);
    CREATE INDEX IX_EmailQueue_CreatedAt ON EmailQueue(createdAt);
    CREATE INDEX IX_EmailQueue_Status_Priority_NextRetry ON EmailQueue(status, priority, nextRetryDate);
END
GO

-- Email Templates Table
-- Reusable email templates
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailTemplates')
BEGIN
    CREATE TABLE EmailTemplates (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(500) NULL,
        emailType NVARCHAR(50) NOT NULL, -- matches EmailQueue.emailType
        
        -- Template Content
        subject NVARCHAR(500) NOT NULL,
        bodyHtml NVARCHAR(MAX) NOT NULL,
        bodyText NVARCHAR(MAX) NULL,
        
        -- Template Variables (JSON)
        -- e.g., ["{{userName}}", "{{resetLink}}", "{{expiryTime}}"]
        variables NVARCHAR(MAX) NULL,
        
        -- Settings
        isActive BIT NOT NULL DEFAULT 1,
        isSystem BIT NOT NULL DEFAULT 0, -- System templates can't be deleted
        
        -- Audit
        createdBy NVARCHAR(50) NOT NULL,
        createdAt DATETIME2 DEFAULT GETDATE(),
        updatedBy NVARCHAR(50) NULL,
        updatedAt DATETIME2 NULL,
        
        CONSTRAINT FK_EmailTemplate_CreatedBy FOREIGN KEY (createdBy) REFERENCES Users(id) ON DELETE NO ACTION,
        CONSTRAINT FK_EmailTemplate_UpdatedBy FOREIGN KEY (updatedBy) REFERENCES Users(id) ON DELETE NO ACTION
    );

    CREATE INDEX IX_EmailTemplates_EmailType ON EmailTemplates(emailType);
    CREATE INDEX IX_EmailTemplates_IsActive ON EmailTemplates(isActive);
END
GO

-- Email Sent History Table
-- Archive of successfully sent emails (for audit/compliance)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailSentHistory')
BEGIN
    CREATE TABLE EmailSentHistory (
        id INT PRIMARY KEY IDENTITY(1,1),
        emailQueueId INT NULL, -- Reference to original queue item
        emailServerProfileId NVARCHAR(50) NULL,
        
        toEmail NVARCHAR(255) NOT NULL,
        subject NVARCHAR(500) NOT NULL,
        emailType NVARCHAR(50) NOT NULL,
        sentAt DATETIME2 DEFAULT GETDATE(),
        sentBy NVARCHAR(50) NULL,
        
        -- Archival fields (optional)
        bodyPreview NVARCHAR(1000) NULL, -- First 1000 chars for search
        relatedEntityType NVARCHAR(50) NULL,
        relatedEntityId NVARCHAR(50) NULL,
        
        CONSTRAINT FK_EmailHistory_Queue FOREIGN KEY (emailQueueId) REFERENCES EmailQueue(id) ON DELETE SET NULL,
        CONSTRAINT FK_EmailHistory_Profile FOREIGN KEY (emailServerProfileId) REFERENCES EmailServerProfiles(id) ON DELETE SET NULL,
        CONSTRAINT FK_EmailHistory_SentBy FOREIGN KEY (sentBy) REFERENCES Users(id) ON DELETE NO ACTION
    );

    CREATE INDEX IX_EmailSentHistory_SentAt ON EmailSentHistory(sentAt);
    CREATE INDEX IX_EmailSentHistory_EmailType ON EmailSentHistory(emailType);
    CREATE INDEX IX_EmailSentHistory_ToEmail ON EmailSentHistory(toEmail);
END
GO

-- Insert default email templates
IF NOT EXISTS (SELECT 1 FROM EmailTemplates WHERE emailType = 'password_reset')
BEGIN
    DECLARE @systemUserId NVARCHAR(50)
    SELECT TOP 1 @systemUserId = id FROM Users WHERE username = 'admin'
    
    IF @systemUserId IS NOT NULL
    BEGIN
        -- Password Reset Template
        INSERT INTO EmailTemplates (id, name, description, emailType, subject, bodyHtml, bodyText, variables, isActive, isSystem, createdBy)
        VALUES (
            NEWID(),
            'Password Reset Request',
            'Email template for password reset requests',
            'password_reset',
            'OrbisHub - Password Reset Request',
            '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Password Reset Request</h2>
                    <p>Hello {{userName}},</p>
                    <p>We received a request to reset your password for your OrbisHub account.</p>
                    <p>Click the link below to reset your password:</p>
                    <p style="margin: 20px 0;">
                        <a href="{{resetLink}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
                    </p>
                    <p style="color: #666; font-size: 14px;">This link will expire in {{expiryTime}}.</p>
                    <p style="color: #666; font-size: 14px;">If you did not request a password reset, please ignore this email.</p>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                    <p style="color: #999; font-size: 12px;">OrbisHub - IT Management System</p>
                </div>
            </body></html>',
            'Password Reset Request\n\nHello {{userName}},\n\nWe received a request to reset your password for your OrbisHub account.\n\nClick the link below to reset your password:\n{{resetLink}}\n\nThis link will expire in {{expiryTime}}.\n\nIf you did not request a password reset, please ignore this email.\n\n---\nOrbisHub - IT Management System',
            '["userName", "resetLink", "expiryTime"]',
            1,
            1,
            @systemUserId
        );

        -- Bug Report Template
        INSERT INTO EmailTemplates (id, name, description, emailType, subject, bodyHtml, bodyText, variables, isActive, isSystem, createdBy)
        VALUES (
            NEWID(),
            'Bug Report Notification',
            'Email template for bug report notifications',
            'bug_report',
            'OrbisHub - New Bug Report: {{bugTitle}}',
            '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #ef4444;">🐛 New Bug Report</h2>
                    <p><strong>Title:</strong> {{bugTitle}}</p>
                    <p><strong>Reported by:</strong> {{reporterName}} ({{reporterEmail}})</p>
                    <p><strong>Severity:</strong> <span style="color: #ef4444;">{{severity}}</span></p>
                    <p><strong>Description:</strong></p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 10px 0;">
                        {{bugDescription}}
                    </div>
                    <p style="margin-top: 20px;">
                        <a href="{{bugLink}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Bug Details</a>
                    </p>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                    <p style="color: #999; font-size: 12px;">OrbisHub - IT Management System</p>
                </div>
            </body></html>',
            'New Bug Report\n\nTitle: {{bugTitle}}\nReported by: {{reporterName}} ({{reporterEmail}})\nSeverity: {{severity}}\n\nDescription:\n{{bugDescription}}\n\nView details: {{bugLink}}\n\n---\nOrbisHub - IT Management System',
            '["bugTitle", "reporterName", "reporterEmail", "severity", "bugDescription", "bugLink"]',
            1,
            1,
            @systemUserId
        );

        -- Account Locked Template
        INSERT INTO EmailTemplates (id, name, description, emailType, subject, bodyHtml, bodyText, variables, isActive, isSystem, createdBy)
        VALUES (
            NEWID(),
            'Account Locked Notification',
            'Email template for account lockout notifications',
            'notification',
            'OrbisHub - Your Account Has Been Locked',
            '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #f59e0b;">⚠️ Account Locked</h2>
                    <p>Hello {{userName}},</p>
                    <p>Your OrbisHub account has been locked due to multiple failed login attempts.</p>
                    <p><strong>Lockout Details:</strong></p>
                    <ul>
                        <li>Failed attempts: {{failedAttempts}}</li>
                        <li>Locked until: {{lockoutExpiry}}</li>
                        <li>IP Address: {{ipAddress}}</li>
                    </ul>
                    <p>Your account will be automatically unlocked after the lockout period expires.</p>
                    <p>If this was not you, please contact your system administrator immediately.</p>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                    <p style="color: #999; font-size: 12px;">OrbisHub - IT Management System</p>
                </div>
            </body></html>',
            'Account Locked\n\nHello {{userName}},\n\nYour OrbisHub account has been locked due to multiple failed login attempts.\n\nLockout Details:\n- Failed attempts: {{failedAttempts}}\n- Locked until: {{lockoutExpiry}}\n- IP Address: {{ipAddress}}\n\nYour account will be automatically unlocked after the lockout period expires.\n\nIf this was not you, please contact your system administrator immediately.\n\n---\nOrbisHub - IT Management System',
            '["userName", "failedAttempts", "lockoutExpiry", "ipAddress"]',
            1,
            1,
            @systemUserId
        );
    END
END
GO

PRINT '✅ Email Server Profile schema created successfully.'
PRINT '📧 Default email templates inserted.'
GO
