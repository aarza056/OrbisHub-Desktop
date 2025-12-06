-- OrbisHub Core Service Database Schema
-- Run this script to create the required tables

USE [OrbisHub]
GO

-- Create Agents table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Agents]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Agents] (
        [AgentId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [MachineName] NVARCHAR(255) NOT NULL,
        [IPAddress] NVARCHAR(500) NULL,
        [OSVersion] NVARCHAR(255) NULL,
        [AgentVersion] NVARCHAR(50) NULL,
        [LoggedInUser] NVARCHAR(100) NULL,
        [Status] NVARCHAR(50) NULL,
        [Metadata] NVARCHAR(MAX) NULL,
        [LastSeenUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
        [CreatedUtc] DATETIME NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE INDEX IX_Agents_MachineName ON [dbo].[Agents]([MachineName]);
    CREATE INDEX IX_Agents_LastSeenUtc ON [dbo].[Agents]([LastSeenUtc]);
END
GO

-- Create AgentJobs table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AgentJobs]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[AgentJobs] (
        [JobId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [AgentId] UNIQUEIDENTIFIER NOT NULL,
        [Type] NVARCHAR(100) NOT NULL,
        [PayloadJson] NVARCHAR(MAX) NULL,
        [Status] NVARCHAR(50) NOT NULL DEFAULT 'Pending',
        [CreatedUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
        [StartedUtc] DATETIME NULL,
        [CompletedUtc] DATETIME NULL,
        [ResultJson] NVARCHAR(MAX) NULL,
        [ErrorMessage] NVARCHAR(MAX) NULL,
        CONSTRAINT FK_AgentJobs_Agents FOREIGN KEY ([AgentId]) 
            REFERENCES [dbo].[Agents]([AgentId]) ON DELETE CASCADE
    );

    CREATE INDEX IX_AgentJobs_AgentId ON [dbo].[AgentJobs]([AgentId]);
    CREATE INDEX IX_AgentJobs_Status ON [dbo].[AgentJobs]([Status]);
    CREATE INDEX IX_AgentJobs_CreatedUtc ON [dbo].[AgentJobs]([CreatedUtc]);
    CREATE INDEX IX_AgentJobs_AgentId_Status_CreatedUtc ON [dbo].[AgentJobs]([AgentId], [Status], [CreatedUtc]);
END
GO

-- =====================================================
-- Password Manager Tables
-- =====================================================

-- Password Entries Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PasswordEntries')
BEGIN
    CREATE TABLE PasswordEntries (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(255) NOT NULL,
        username NVARCHAR(255) NOT NULL,
        password_encrypted NVARCHAR(MAX) NOT NULL,
        url NVARCHAR(500) NULL,
        notes NVARCHAR(MAX) NULL,
        category NVARCHAR(100) NULL,
        tags NVARCHAR(500) NULL,
        created_by NVARCHAR(50) NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        last_accessed DATETIME2 NULL,
        is_favorite BIT DEFAULT 0,
        CONSTRAINT FK_PasswordEntry_User FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE NO ACTION
    );

    CREATE INDEX IX_PasswordEntries_Name ON PasswordEntries(name);
    CREATE INDEX IX_PasswordEntries_Category ON PasswordEntries(category);
    CREATE INDEX IX_PasswordEntries_CreatedBy ON PasswordEntries(created_by);
END
GO

-- Password Categories Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PasswordCategories')
BEGIN
    CREATE TABLE PasswordCategories (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(100) NOT NULL UNIQUE,
        color NVARCHAR(7) NOT NULL,
        icon NVARCHAR(50) NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT CK_PasswordCategory_Color CHECK (color LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
    );

    INSERT INTO PasswordCategories (name, color, icon) VALUES
    (N'Personal', '#3b82f6', N'👤'),
    (N'Work', '#8b5cf6', N'💼'),
    (N'Financial', '#10b981', N'💳'),
    (N'Social Media', '#f59e0b', N'📱'),
    (N'Email', '#06b6d4', N'📧'),
    (N'Development', '#ec4899', N'💻'),
    (N'Database', '#ef4444', N'🗄️'),
    (N'Server', '#f97316', N'🖥️'),
    (N'Other', '#6b7280', N'📝');
END
GO

-- Password Access Log Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PasswordAccessLog')
BEGIN
    CREATE TABLE PasswordAccessLog (
        id INT PRIMARY KEY IDENTITY(1,1),
        password_entry_id INT NOT NULL,
        user_id NVARCHAR(50) NOT NULL,
        action NVARCHAR(50) NOT NULL,
        accessed_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_PasswordAccessLog_Entry FOREIGN KEY (password_entry_id) REFERENCES PasswordEntries(id) ON DELETE CASCADE,
        CONSTRAINT FK_PasswordAccessLog_User FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE NO ACTION,
        CONSTRAINT CK_PasswordAccessLog_Action CHECK (action IN ('view', 'copy', 'edit', 'delete', 'create'))
    );

    CREATE INDEX IX_PasswordAccessLog_Entry ON PasswordAccessLog(password_entry_id);
    CREATE INDEX IX_PasswordAccessLog_User ON PasswordAccessLog(user_id);
    CREATE INDEX IX_PasswordAccessLog_AccessedAt ON PasswordAccessLog(accessed_at);
END
GO

-- =====================================================
-- System Settings Table
-- =====================================================

-- System Settings Table for Desktop App Configuration
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemSettings')
BEGIN
    CREATE TABLE SystemSettings (
        SettingKey NVARCHAR(100) PRIMARY KEY,
        SettingValue NVARCHAR(MAX),
        UpdatedAt DATETIME2 DEFAULT GETDATE()
    );
END
GO

PRINT 'OrbisHub Core Service database schema created successfully.'
GO
