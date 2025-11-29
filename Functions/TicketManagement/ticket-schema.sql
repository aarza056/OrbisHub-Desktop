-- =====================================================
-- OrbisHub Ticket Management System - Database Schema
-- Professional ticketing system similar to Jira
-- =====================================================

-- Ticket Priorities Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketPriorities')
BEGIN
    CREATE TABLE TicketPriorities (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(50) NOT NULL UNIQUE,
        color NVARCHAR(7) NOT NULL,
        level INT NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT CK_Priority_Color CHECK (color LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
    );

    INSERT INTO TicketPriorities (name, color, level) VALUES
    ('Critical', '#dc2626', 5),
    ('High', '#ea580c', 4),
    ('Medium', '#f59e0b', 3),
    ('Low', '#3b82f6', 2),
    ('Trivial', '#6b7280', 1);
END
GO

-- Ticket Statuses Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketStatuses')
BEGIN
    CREATE TABLE TicketStatuses (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(50) NOT NULL UNIQUE,
        color NVARCHAR(7) NOT NULL,
        category NVARCHAR(20) NOT NULL,
        display_order INT NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT CK_Status_Category CHECK (category IN ('open', 'in_progress', 'resolved', 'closed')),
        CONSTRAINT CK_Status_Color CHECK (color LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
    );

    INSERT INTO TicketStatuses (name, color, category, display_order) VALUES
    ('Open', '#3b82f6', 'open', 1),
    ('In Progress', '#f59e0b', 'in_progress', 2),
    ('Blocked', '#dc2626', 'in_progress', 3),
    ('In Review', '#8b5cf6', 'in_progress', 4),
    ('Resolved', '#10b981', 'resolved', 5),
    ('Closed', '#6b7280', 'closed', 6),
    ('Reopened', '#f97316', 'open', 7);
END
GO

-- Ticket Types Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketTypes')
BEGIN
    CREATE TABLE TicketTypes (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(50) NOT NULL UNIQUE,
        icon NVARCHAR(50) NOT NULL,
        color NVARCHAR(7) NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE()
    );

    INSERT INTO TicketTypes (name, icon, color) VALUES
    ('Bug', 'bug', '#dc2626'),
    ('Feature', 'star', '#8b5cf6'),
    ('Task', 'checklist', '#3b82f6'),
    ('Improvement', 'trending-up', '#10b981'),
    ('Question', 'help-circle', '#f59e0b'),
    ('Epic', 'layers', '#ec4899');
END
GO

-- Ticket Projects Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketProjects')
BEGIN
    CREATE TABLE TicketProjects (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(100) NOT NULL,
        [key] NVARCHAR(10) NOT NULL UNIQUE,
        description NVARCHAR(MAX),
        color NVARCHAR(7) NOT NULL DEFAULT '#3b82f6',
        is_active BIT DEFAULT 1,
        created_by NVARCHAR(50) NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_TicketProjects_CreatedBy FOREIGN KEY (created_by) REFERENCES Users(id)
    );

    -- Default project
    DECLARE @adminId INT = (SELECT TOP 1 id FROM Users WHERE role = 'admin' ORDER BY id);
    IF @adminId IS NOT NULL
    BEGIN
        INSERT INTO TicketProjects (name, [key], description, color, created_by) 
        VALUES ('OrbisHub', 'ORB', 'Default OrbisHub project for system administration tasks', '#8aa2ff', @adminId);
    END
END
GO

-- Main Tickets Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tickets')
BEGIN
    CREATE TABLE Tickets (
        id INT PRIMARY KEY IDENTITY(1,1),
        ticket_number NVARCHAR(20) NOT NULL UNIQUE,
        project_id INT NOT NULL,
        type_id INT NOT NULL,
        title NVARCHAR(200) NOT NULL,
        description NVARCHAR(MAX),
        status_id INT NOT NULL,
        priority_id INT NOT NULL,
        assignee_id NVARCHAR(50),
        reporter_id NVARCHAR(50) NOT NULL,
        environment_id NVARCHAR(50),
        server_id NVARCHAR(50),
        story_points INT,
        estimated_hours DECIMAL(10,2),
        actual_hours DECIMAL(10,2),
        due_date DATETIME2,
        parent_ticket_id INT,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        resolved_at DATETIME2,
        closed_at DATETIME2,
        CONSTRAINT FK_Tickets_Project FOREIGN KEY (project_id) REFERENCES TicketProjects(id),
        CONSTRAINT FK_Tickets_Type FOREIGN KEY (type_id) REFERENCES TicketTypes(id),
        CONSTRAINT FK_Tickets_Status FOREIGN KEY (status_id) REFERENCES TicketStatuses(id),
        CONSTRAINT FK_Tickets_Priority FOREIGN KEY (priority_id) REFERENCES TicketPriorities(id),
        CONSTRAINT FK_Tickets_Assignee FOREIGN KEY (assignee_id) REFERENCES Users(id),
        CONSTRAINT FK_Tickets_Reporter FOREIGN KEY (reporter_id) REFERENCES Users(id),
        CONSTRAINT FK_Tickets_Environment FOREIGN KEY (environment_id) REFERENCES Environments(id),
        CONSTRAINT FK_Tickets_Server FOREIGN KEY (server_id) REFERENCES Servers(id),
        CONSTRAINT FK_Tickets_Parent FOREIGN KEY (parent_ticket_id) REFERENCES Tickets(id)
    );

    -- Indexes for performance
    CREATE INDEX IX_Tickets_Project ON Tickets(project_id);
    CREATE INDEX IX_Tickets_Status ON Tickets(status_id);
    CREATE INDEX IX_Tickets_Assignee ON Tickets(assignee_id);
    CREATE INDEX IX_Tickets_Reporter ON Tickets(reporter_id);
    CREATE INDEX IX_Tickets_DueDate ON Tickets(due_date);
    CREATE INDEX IX_Tickets_CreatedAt ON Tickets(created_at);
END
GO

-- Ticket Comments Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketComments')
BEGIN
    CREATE TABLE TicketComments (
        id INT PRIMARY KEY IDENTITY(1,1),
        ticket_id INT NOT NULL,
        user_id NVARCHAR(50) NOT NULL,
        comment NVARCHAR(MAX) NOT NULL,
        is_internal BIT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_TicketComments_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_TicketComments_User FOREIGN KEY (user_id) REFERENCES Users(id)
    );

    CREATE INDEX IX_TicketComments_Ticket ON TicketComments(ticket_id);
    CREATE INDEX IX_TicketComments_CreatedAt ON TicketComments(created_at);
END
GO

-- Ticket Attachments Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketAttachments')
BEGIN
    CREATE TABLE TicketAttachments (
        id INT PRIMARY KEY IDENTITY(1,1),
        ticket_id INT NOT NULL,
        filename NVARCHAR(255) NOT NULL,
        filepath NVARCHAR(500) NOT NULL,
        filesize BIGINT NOT NULL,
        mimetype NVARCHAR(100),
        uploaded_by NVARCHAR(50) NOT NULL,
        uploaded_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_TicketAttachments_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_TicketAttachments_User FOREIGN KEY (uploaded_by) REFERENCES Users(id)
    );

    CREATE INDEX IX_TicketAttachments_Ticket ON TicketAttachments(ticket_id);
END
GO

-- Ticket Watchers Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketWatchers')
BEGIN
    CREATE TABLE TicketWatchers (
        id INT PRIMARY KEY IDENTITY(1,1),
        ticket_id INT NOT NULL,
        user_id NVARCHAR(50) NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_TicketWatchers_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_TicketWatchers_User FOREIGN KEY (user_id) REFERENCES Users(id),
        CONSTRAINT UQ_TicketWatchers UNIQUE (ticket_id, user_id)
    );

    CREATE INDEX IX_TicketWatchers_Ticket ON TicketWatchers(ticket_id);
    CREATE INDEX IX_TicketWatchers_User ON TicketWatchers(user_id);
END
GO

-- Ticket Activity Log Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketActivityLog')
BEGIN
    CREATE TABLE TicketActivityLog (
        id INT PRIMARY KEY IDENTITY(1,1),
        ticket_id INT NOT NULL,
        user_id NVARCHAR(50) NOT NULL,
        action NVARCHAR(50) NOT NULL,
        field_name NVARCHAR(100),
        old_value NVARCHAR(MAX),
        new_value NVARCHAR(MAX),
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_TicketActivityLog_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_TicketActivityLog_User FOREIGN KEY (user_id) REFERENCES Users(id)
    );

    CREATE INDEX IX_TicketActivityLog_Ticket ON TicketActivityLog(ticket_id);
    CREATE INDEX IX_TicketActivityLog_CreatedAt ON TicketActivityLog(created_at);
END
GO

-- Ticket Labels Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketLabels')
BEGIN
    CREATE TABLE TicketLabels (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(50) NOT NULL UNIQUE,
        color NVARCHAR(7) NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE()
    );

    INSERT INTO TicketLabels (name, color) VALUES
    ('urgent', '#dc2626'),
    ('security', '#ea580c'),
    ('performance', '#f59e0b'),
    ('ui-ux', '#8b5cf6'),
    ('backend', '#3b82f6'),
    ('database', '#10b981'),
    ('documentation', '#6b7280');
END
GO

-- Ticket-Label Mapping Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketLabelMap')
BEGIN
    CREATE TABLE TicketLabelMap (
        id INT PRIMARY KEY IDENTITY(1,1),
        ticket_id INT NOT NULL,
        label_id INT NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_TicketLabelMap_Ticket FOREIGN KEY (ticket_id) REFERENCES Tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_TicketLabelMap_Label FOREIGN KEY (label_id) REFERENCES TicketLabels(id),
        CONSTRAINT UQ_TicketLabelMap UNIQUE (ticket_id, label_id)
    );
END
GO

-- Drop old trigger if exists (no longer needed - ticket numbers generated in app code)
IF OBJECT_ID('trg_GenerateTicketNumber', 'TR') IS NOT NULL
    DROP TRIGGER trg_GenerateTicketNumber;
GO

PRINT 'Ticket Management System schema created successfully!';
