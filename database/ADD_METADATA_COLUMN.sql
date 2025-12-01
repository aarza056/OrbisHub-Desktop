-- Migration: Add Metadata column to Agents table
-- Purpose: Store agent metrics (CPU, memory, disk, uptime) as JSON
-- Date: 2025-11-30

USE OrbisHub;
GO

-- Check if column exists before adding
IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Agents' 
    AND COLUMN_NAME = 'Metadata'
)
BEGIN
    PRINT 'Adding Metadata column to Agents table...'
    ALTER TABLE [dbo].[Agents] ADD [Metadata] NVARCHAR(MAX) NULL
    PRINT 'Metadata column added successfully'
END
ELSE
BEGIN
    PRINT 'Metadata column already exists - skipping'
END
GO
