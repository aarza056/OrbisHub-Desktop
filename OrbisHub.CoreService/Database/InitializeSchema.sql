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

PRINT 'OrbisHub Core Service database schema created successfully.'
GO
