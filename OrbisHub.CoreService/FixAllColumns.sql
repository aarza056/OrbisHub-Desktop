USE [OrbisHub]
GO

-- Fix all column names in Agents table
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Agents') AND name = 'id')
BEGIN
    EXEC sp_rename 'Agents.id', 'AgentId', 'COLUMN';
    EXEC sp_rename 'Agents.machineName', 'MachineName', 'COLUMN';
    EXEC sp_rename 'Agents.ipAddress', 'IPAddress', 'COLUMN';
    EXEC sp_rename 'Agents.os', 'OSVersion', 'COLUMN';
    EXEC sp_rename 'Agents.version', 'AgentVersion', 'COLUMN';
    EXEC sp_rename 'Agents.status', 'Status', 'COLUMN';
    EXEC sp_rename 'Agents.metadata', 'Metadata', 'COLUMN';
    EXEC sp_rename 'Agents.LastHeartbeat', 'LastSeenUtc', 'COLUMN';
    PRINT 'Fixed all Agents columns'
END

-- Fix AgentJobs column names
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('AgentJobs') AND name = 'id')
BEGIN
    EXEC sp_rename 'AgentJobs.id', 'JobId', 'COLUMN';
    EXEC sp_rename 'AgentJobs.agentId', 'AgentId', 'COLUMN';
    EXEC sp_rename 'AgentJobs.status', 'Status', 'COLUMN';
    PRINT 'Fixed AgentJobs columns'
END

PRINT 'All columns fixed'
