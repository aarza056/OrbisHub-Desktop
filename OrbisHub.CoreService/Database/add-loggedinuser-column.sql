-- Add LoggedInUser column to Agents table
-- Run this script on your OrbisHub database

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'Agents') 
    AND name = 'LoggedInUser'
)
BEGIN
    ALTER TABLE Agents
    ADD LoggedInUser NVARCHAR(100) NULL;
    
    PRINT 'LoggedInUser column added successfully';
END
ELSE
BEGIN
    PRINT 'LoggedInUser column already exists';
END
GO
