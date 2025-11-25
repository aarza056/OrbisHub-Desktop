USE [OrbisHub]
GO

-- Rename columns in Agents table to match Core Service expectations
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Agents') AND name = 'createdAt')
BEGIN
    EXEC sp_rename 'Agents.createdAt', 'CreatedUtc', 'COLUMN';
    EXEC sp_rename 'Agents.updatedAt', 'UpdatedUtc', 'COLUMN';
    EXEC sp_rename 'Agents.lastHeartbeat', 'LastHeartbeat', 'COLUMN';
    PRINT 'Renamed Agents table columns'
END

-- Rename columns in AgentJobs table to match Core Service expectations  
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('AgentJobs') AND name = 'createdAt')
BEGIN
    EXEC sp_rename 'AgentJobs.createdAt', 'CreatedUtc', 'COLUMN';
    EXEC sp_rename 'AgentJobs.startedAt', 'StartedUtc', 'COLUMN';
    EXEC sp_rename 'AgentJobs.completedAt', 'CompletedUtc', 'COLUMN';
    EXEC sp_rename 'AgentJobs.scriptType', 'Type', 'COLUMN';
    EXEC sp_rename 'AgentJobs.scriptContent', 'Script', 'COLUMN';
    EXEC sp_rename 'AgentJobs.parameters', 'Parameters', 'COLUMN';
    EXEC sp_rename 'AgentJobs.output', 'Result', 'COLUMN';
    EXEC sp_rename 'AgentJobs.exitCode', 'ExitCode', 'COLUMN';
    EXEC sp_rename 'AgentJobs.createdBy', 'CreatedBy', 'COLUMN';
    PRINT 'Renamed AgentJobs table columns'
END

PRINT 'Schema update complete'
