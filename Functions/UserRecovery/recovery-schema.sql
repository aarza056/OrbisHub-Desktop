-- =====================================================
-- OrbisHub User Recovery Schema
-- Password reset and account recovery via email
-- =====================================================

USE [OrbisHub]
GO

-- Password Reset Tokens Table
-- Stores temporary tokens for password reset requests
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PasswordResetTokens')
BEGIN
    CREATE TABLE PasswordResetTokens (
        id NVARCHAR(50) PRIMARY KEY,
        userId NVARCHAR(50) NOT NULL,
        token NVARCHAR(255) NOT NULL UNIQUE,
        
        -- Token Management
        expiresAt DATETIME2 NOT NULL,
        isUsed BIT NOT NULL DEFAULT 0,
        usedAt DATETIME2 NULL,
        
        -- Request Information
        requestedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        requestIp NVARCHAR(50) NULL,
        userAgent NVARCHAR(500) NULL,
        
        -- Email Information
        emailSentTo NVARCHAR(255) NOT NULL,
        emailSentAt DATETIME2 NULL,
        emailStatus NVARCHAR(50) NULL, -- 'pending', 'sent', 'failed'
        
        -- Audit
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        
        CONSTRAINT FK_PasswordResetToken_User FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
    );
    
    PRINT 'Table PasswordResetTokens created successfully';
END
ELSE
BEGIN
    PRINT 'Table PasswordResetTokens already exists';
END
GO

-- Create index for faster token lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PasswordResetTokens_Token')
BEGIN
    CREATE INDEX IX_PasswordResetTokens_Token ON PasswordResetTokens(token);
    PRINT 'Index IX_PasswordResetTokens_Token created';
END
GO

-- Create index for user lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PasswordResetTokens_UserId')
BEGIN
    CREATE INDEX IX_PasswordResetTokens_UserId ON PasswordResetTokens(userId);
    PRINT 'Index IX_PasswordResetTokens_UserId created';
END
GO

-- Create index for cleanup of expired tokens
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PasswordResetTokens_ExpiresAt')
BEGIN
    CREATE INDEX IX_PasswordResetTokens_ExpiresAt ON PasswordResetTokens(expiresAt);
    PRINT 'Index IX_PasswordResetTokens_ExpiresAt created';
END
GO

-- Account Recovery Audit Log
-- Track all recovery attempts for security
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AccountRecoveryLog')
BEGIN
    CREATE TABLE AccountRecoveryLog (
        id NVARCHAR(50) PRIMARY KEY,
        userId NVARCHAR(50) NULL,
        username NVARCHAR(50) NULL,
        email NVARCHAR(255) NULL,
        
        -- Action Details
        action NVARCHAR(50) NOT NULL, -- 'request_reset', 'verify_token', 'reset_password', 'failed_attempt'
        status NVARCHAR(50) NOT NULL, -- 'success', 'failed', 'blocked'
        
        -- Request Information
        requestIp NVARCHAR(50) NULL,
        userAgent NVARCHAR(500) NULL,
        
        -- Additional Details
        failureReason NVARCHAR(500) NULL,
        metadata NVARCHAR(MAX) NULL, -- JSON for additional info
        
        -- Timestamp
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        
        CONSTRAINT FK_AccountRecoveryLog_User FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE SET NULL
    );
    
    PRINT 'Table AccountRecoveryLog created successfully';
END
ELSE
BEGIN
    PRINT 'Table AccountRecoveryLog already exists';
END
GO

-- Create index for audit log queries
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AccountRecoveryLog_UserId')
BEGIN
    CREATE INDEX IX_AccountRecoveryLog_UserId ON AccountRecoveryLog(userId);
    PRINT 'Index IX_AccountRecoveryLog_UserId created';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AccountRecoveryLog_CreatedAt')
BEGIN
    CREATE INDEX IX_AccountRecoveryLog_CreatedAt ON AccountRecoveryLog(createdAt);
    PRINT 'Index IX_AccountRecoveryLog_CreatedAt created';
END
GO

-- Ensure Users table has email column (if not already present)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'email')
BEGIN
    ALTER TABLE Users ADD email NVARCHAR(255) NULL;
    PRINT 'Added email column to Users table';
END
GO

-- Add email index for faster lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Users_Email' AND object_id = OBJECT_ID('Users'))
BEGIN
    CREATE INDEX IX_Users_Email ON Users(email);
    PRINT 'Index IX_Users_Email created';
END
GO

-- Stored Procedure: Create Password Reset Token
IF OBJECT_ID('sp_CreatePasswordResetToken', 'P') IS NOT NULL
    DROP PROCEDURE sp_CreatePasswordResetToken;
GO

CREATE PROCEDURE sp_CreatePasswordResetToken
    @userId NVARCHAR(50),
    @token NVARCHAR(255),
    @email NVARCHAR(255),
    @expiryMinutes INT = 60,
    @requestIp NVARCHAR(50) = NULL,
    @userAgent NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @tokenId NVARCHAR(50) = NEWID();
    DECLARE @expiresAt DATETIME2 = DATEADD(MINUTE, @expiryMinutes, GETDATE());
    
    -- Invalidate any existing unused tokens for this user
    UPDATE PasswordResetTokens 
    SET isUsed = 1, usedAt = GETDATE()
    WHERE userId = @userId AND isUsed = 0;
    
    -- Create new token
    INSERT INTO PasswordResetTokens (
        id, userId, token, expiresAt, requestedAt, requestIp, 
        userAgent, emailSentTo, emailStatus
    )
    VALUES (
        @tokenId, @userId, @token, @expiresAt, GETDATE(), @requestIp,
        @userAgent, @email, 'pending'
    );
    
    -- Return the token record
    SELECT * FROM PasswordResetTokens WHERE id = @tokenId;
END
GO

PRINT 'Stored procedure sp_CreatePasswordResetToken created';
GO

-- Stored Procedure: Verify and Use Password Reset Token
IF OBJECT_ID('sp_VerifyPasswordResetToken', 'P') IS NOT NULL
    DROP PROCEDURE sp_VerifyPasswordResetToken;
GO

CREATE PROCEDURE sp_VerifyPasswordResetToken
    @token NVARCHAR(255),
    @markAsUsed BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @tokenRecord TABLE (
        id NVARCHAR(50),
        userId NVARCHAR(50),
        token NVARCHAR(255),
        expiresAt DATETIME2,
        isUsed BIT,
        isValid BIT
    );
    
    -- Check if token exists and is valid
    INSERT INTO @tokenRecord
    SELECT 
        id, userId, token, expiresAt, isUsed,
        CASE 
            WHEN isUsed = 0 AND expiresAt > GETDATE() THEN 1
            ELSE 0
        END as isValid
    FROM PasswordResetTokens
    WHERE token = @token;
    
    -- If valid and markAsUsed is true, mark it as used
    IF @markAsUsed = 1
    BEGIN
        UPDATE PasswordResetTokens
        SET isUsed = 1, usedAt = GETDATE(), emailStatus = 'used'
        WHERE token = @token AND isUsed = 0;
    END
    
    -- Return the result
    SELECT * FROM @tokenRecord;
END
GO

PRINT 'Stored procedure sp_VerifyPasswordResetToken created';
GO

-- Stored Procedure: Clean Up Expired Tokens
IF OBJECT_ID('sp_CleanupExpiredResetTokens', 'P') IS NOT NULL
    DROP PROCEDURE sp_CleanupExpiredResetTokens;
GO

CREATE PROCEDURE sp_CleanupExpiredResetTokens
    @retentionDays INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @cutoffDate DATETIME2 = DATEADD(DAY, -@retentionDays, GETDATE());
    DECLARE @deletedCount INT;
    
    -- Delete old expired tokens
    DELETE FROM PasswordResetTokens
    WHERE expiresAt < @cutoffDate;
    
    SET @deletedCount = @@ROWCOUNT;
    
    -- Also clean up old recovery log entries
    DELETE FROM AccountRecoveryLog
    WHERE createdAt < @cutoffDate;
    
    SELECT @deletedCount as DeletedTokens, @@ROWCOUNT as DeletedLogEntries;
END
GO

PRINT 'Stored procedure sp_CleanupExpiredResetTokens created';
GO

-- Stored Procedure: Get User Recovery Information
IF OBJECT_ID('sp_GetUserForRecovery', 'P') IS NOT NULL
    DROP PROCEDURE sp_GetUserForRecovery;
GO

CREATE PROCEDURE sp_GetUserForRecovery
    @usernameOrEmail NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Find user by username or email
    SELECT id, username, email, name, isActive
    FROM Users
    WHERE (username = @usernameOrEmail OR email = @usernameOrEmail)
        AND isActive = 1
        AND email IS NOT NULL
        AND email != '';
END
GO

PRINT 'Stored procedure sp_GetUserForRecovery created';
GO

-- Create default email template for password reset (if email templates exist)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailTemplates')
BEGIN
    IF NOT EXISTS (SELECT * FROM EmailTemplates WHERE name = 'Password Reset')
    BEGIN
        INSERT INTO EmailTemplates (
            id, name, description, subject, bodyText, bodyHtml,
            category, isActive, createdBy, createdAt
        )
        VALUES (
            NEWID(),
            'Password Reset',
            'Email template for password reset requests',
            'Reset Your OrbisHub Password',
            'Hello {{userName}},

We received a request to reset your password for your OrbisHub account.

Click the link below to reset your password:
{{resetLink}}

This link will expire in {{expiryMinutes}} minutes.

If you did not request a password reset, please ignore this email and contact your system administrator.

---
OrbisHub - IT Management System',
            '<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Password Reset Request</h1>
    </div>
    <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #374151;">Hello <strong>{{userName}}</strong>,</p>
        <p style="font-size: 14px; color: #6b7280;">We received a request to reset your password for your OrbisHub account.</p>
        <p style="text-align: center; margin: 30px 0;">
            <a href="{{resetLink}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Reset Password</a>
        </p>
        <p style="font-size: 13px; color: #9ca3af;">This link will expire in <strong>{{expiryMinutes}} minutes</strong>.</p>
        <p style="font-size: 13px; color: #9ca3af;">If you did not request a password reset, please ignore this email and contact your system administrator.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">OrbisHub - IT Management System</p>
    </div>
</body>
</html>',
            'system',
            1,
            'system',
            GETDATE()
        );
        
        PRINT 'Password Reset email template created';
    END
END
GO

PRINT '✅ User Recovery schema installation completed successfully';
GO
