-- =====================================================
-- OrbisHub Password Manager - Database Schema
-- Secure password storage with encryption
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

    -- Index for faster searches
    CREATE INDEX IX_PasswordEntries_Name ON PasswordEntries(name);
    CREATE INDEX IX_PasswordEntries_Category ON PasswordEntries(category);
    CREATE INDEX IX_PasswordEntries_CreatedBy ON PasswordEntries(created_by);
END
GO

-- Password Categories Table (Optional - for categorization)
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

    -- Insert default categories with Unicode icon support
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

-- Audit log for password access
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

    -- Index for faster queries
    CREATE INDEX IX_PasswordAccessLog_Entry ON PasswordAccessLog(password_entry_id);
    CREATE INDEX IX_PasswordAccessLog_User ON PasswordAccessLog(user_id);
    CREATE INDEX IX_PasswordAccessLog_AccessedAt ON PasswordAccessLog(accessed_at);
END
GO
