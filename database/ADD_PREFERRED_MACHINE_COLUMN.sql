-- Add preferred_machine_id column to Credentials table
-- Run this if you get "Invalid column name 'preferred_machine_id'" error

USE [OrbisHub]
GO

-- Check if column exists and add it if it doesn't
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('Credentials') 
    AND name = 'preferred_machine_id'
)
BEGIN
    ALTER TABLE Credentials 
    ADD preferred_machine_id NVARCHAR(50) NULL
    
    PRINT 'Column preferred_machine_id added successfully'
END
ELSE
BEGIN
    PRINT 'Column preferred_machine_id already exists'
END
GO
