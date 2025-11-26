-- Check agent metadata
USE [OrbisHub]
GO

SELECT 
    AgentId,
    MachineName,
    Metadata,
    LastSeenUtc
FROM Agents
ORDER BY LastSeenUtc DESC;
