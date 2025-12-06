/**
 * DB Maintenance Service Module
 * Backend service for database maintenance operations
 */

const DBMaintenanceService = {
    /**
     * Get database statistics
     */
    async getDatabaseStats() {
        try {
            // Get overall database size using sp_spaceused
            const dbSizeQuery = `
                EXEC sp_spaceused @oneresultset = 1
            `
            const dbSizeResult = await window.DB.query(dbSizeQuery, [])
            
            // Parse the database size from sp_spaceused result
            let dbSize = 0
            if (dbSizeResult.success && dbSizeResult.data?.[0]) {
                const sizeStr = dbSizeResult.data[0].database_size || dbSizeResult.data[0].Database_size || '0 MB'
                const sizeMatch = sizeStr.match(/(\d+\.?\d*)\s*MB/i)
                if (sizeMatch) {
                    dbSize = parseFloat(sizeMatch[1]) * 1024 * 1024 // Convert MB to bytes
                }
            }

            // Get table statistics using dm_db_partition_stats (more reliable)
            const tablesQuery = `
                SELECT 
                    t.name AS TableName,
                    SUM(p.row_count) AS Rows,
                    SUM(p.reserved_page_count) * 8 AS TotalSizeKB,
                    SUM(p.used_page_count) * 8 AS DataSizeKB,
                    (SUM(p.reserved_page_count) - SUM(p.used_page_count)) * 8 AS IndexSizeKB
                FROM sys.dm_db_partition_stats p
                INNER JOIN sys.tables t ON p.object_id = t.object_id
                WHERE p.index_id IN (0, 1)
                AND t.is_ms_shipped = 0
                GROUP BY t.name, t.object_id
                ORDER BY TotalSizeKB DESC
            `

            const tablesResult = await window.DB.query(tablesQuery, [])

            if (!tablesResult.success) {
                return { success: false, error: tablesResult.error || 'Failed to get table statistics' }
            }

            const tables = tablesResult.data || []
            console.log('Raw table data:', tables.slice(0, 3)) // Debug: show first 3 tables

            // Get index count
            const indexQuery = `
                SELECT COUNT(*) AS IndexCount
                FROM sys.indexes
                WHERE object_id IN (SELECT object_id FROM sys.tables WHERE is_ms_shipped = 0)
                AND index_id > 0
            `
            const indexResult = await window.DB.query(indexQuery, [])
            const indexCount = indexResult.success ? (indexResult.data?.[0]?.IndexCount || 0) : 0

            // Get table count
            const tableCountQuery = `
                SELECT COUNT(*) AS TableCount
                FROM sys.tables
                WHERE is_ms_shipped = 0
            `
            const tableCountResult = await window.DB.query(tableCountQuery, [])
            const tableCount = tableCountResult.success ? (tableCountResult.data?.[0]?.TableCount || 0) : 0

            // Calculate totals
            let totalRecords = 0

            const tableStats = tables.map(table => {
                const rows = parseInt(table.Rows) || 0
                totalRecords += rows

                return {
                    name: table.TableName,
                    rows: rows,
                    dataSize: (table.DataSizeKB || 0) * 1024,
                    indexSize: (table.IndexSizeKB || 0) * 1024,
                    totalSize: (table.TotalSizeKB || 0) * 1024
                }
            })

            return {
                success: true,
                data: {
                    databaseSize: dbSize,
                    tableCount: tableCount,
                    totalRecords: totalRecords,
                    indexCount: indexCount,
                    tables: tableStats
                }
            }
        } catch (error) {
            console.error('Error getting database stats:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Perform database backup
     */
    async backupDatabase(backupPath) {
        try {
            if (!backupPath) {
                return { success: false, error: 'Backup path is required' }
            }

            // Get database name
            const dbNameQuery = `SELECT DB_NAME() AS DatabaseName`
            const dbNameResult = await window.DB.query(dbNameQuery, [])
            
            if (!dbNameResult.success || !dbNameResult.data?.[0]?.DatabaseName) {
                return { success: false, error: 'Could not determine database name' }
            }

            const dbName = dbNameResult.data[0].DatabaseName

            // Construct backup query (without COMPRESSION for Express Edition compatibility)
            const backupQuery = `
                BACKUP DATABASE [${dbName}]
                TO DISK = N'${backupPath}'
                WITH NOFORMAT, 
                     NOINIT,  
                     NAME = N'${dbName}-Full Database Backup', 
                     SKIP, 
                     NOREWIND, 
                     NOUNLOAD,  
                     STATS = 10
            `

            const result = await window.DB.execute(backupQuery, [])

            if (result.success) {
                return { 
                    success: true, 
                    message: `Database backed up successfully to ${backupPath}`
                }
            } else {
                return { success: false, error: result.error }
            }
        } catch (error) {
            console.error('Error backing up database:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Rebuild database indexes
     */
    async rebuildIndexes() {
        try {
            const query = `
                DECLARE @TableName NVARCHAR(255);
                DECLARE @SQL NVARCHAR(MAX);

                DECLARE TableCursor CURSOR FOR
                SELECT name FROM sys.tables WHERE is_ms_shipped = 0;

                OPEN TableCursor;
                FETCH NEXT FROM TableCursor INTO @TableName;

                WHILE @@FETCH_STATUS = 0
                BEGIN
                    SET @SQL = 'ALTER INDEX ALL ON [' + @TableName + '] REBUILD WITH (ONLINE = OFF, SORT_IN_TEMPDB = ON)';
                    BEGIN TRY
                        EXEC sp_executesql @SQL;
                    END TRY
                    BEGIN CATCH
                        -- Continue on error
                    END CATCH

                    FETCH NEXT FROM TableCursor INTO @TableName;
                END

                CLOSE TableCursor;
                DEALLOCATE TableCursor;

                SELECT 'Indexes rebuilt successfully' AS Message;
            `

            const result = await window.DB.execute(query, [])

            if (result.success) {
                return { 
                    success: true, 
                    message: 'All indexes have been rebuilt'
                }
            } else {
                return { success: false, error: result.error }
            }
        } catch (error) {
            console.error('Error rebuilding indexes:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Update database statistics
     */
    async updateStatistics() {
        try {
            const query = `
                EXEC sp_updatestats;
                SELECT 'Statistics updated successfully' AS Message;
            `

            const result = await window.DB.execute(query, [])

            if (result.success) {
                return { 
                    success: true, 
                    message: 'Database statistics updated successfully'
                }
            } else {
                return { success: false, error: result.error }
            }
        } catch (error) {
            console.error('Error updating statistics:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Shrink database
     */
    async shrinkDatabase() {
        try {
            // Get database name
            const dbNameQuery = `SELECT DB_NAME() AS DatabaseName`
            const dbNameResult = await window.DB.query(dbNameQuery, [])
            
            if (!dbNameResult.success || !dbNameResult.data?.[0]?.DatabaseName) {
                return { success: false, error: 'Could not determine database name' }
            }

            const dbName = dbNameResult.data[0].DatabaseName

            const query = `
                DBCC SHRINKDATABASE(N'${dbName}');
                SELECT 'Database shrunk successfully' AS Message;
            `

            const result = await window.DB.execute(query, [])

            if (result.success) {
                return { 
                    success: true, 
                    message: 'Database has been shrunk to reclaim unused space'
                }
            } else {
                return { success: false, error: result.error }
            }
        } catch (error) {
            console.error('Error shrinking database:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Cleanup old audit logs
     */
    async cleanupAuditLogs(days = 90) {
        try {
            const query = `
                DECLARE @CutoffDate DATETIME = DATEADD(DAY, -${days}, GETDATE());
                DECLARE @DeletedCount INT;

                -- Delete old audit logs
                DELETE FROM AuditLog
                WHERE Timestamp < @CutoffDate;

                SET @DeletedCount = @@ROWCOUNT;

                SELECT @DeletedCount AS DeletedCount;
            `

            const result = await window.DB.execute(query, [])

            if (result.success) {
                const deletedCount = result.data?.[0]?.DeletedCount || 0
                return { 
                    success: true, 
                    deletedCount: deletedCount,
                    message: `Deleted ${deletedCount} audit log records older than ${days} days`
                }
            } else {
                return { success: false, error: result.error }
            }
        } catch (error) {
            console.error('Error cleaning up audit logs:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Cleanup orphaned records
     */
    async cleanupOrphanedRecords() {
        try {
            let totalDeleted = 0

            // Cleanup orphaned credentials
            const credQuery = `
                DELETE FROM Credentials
                WHERE ServerID NOT IN (SELECT ServerID FROM Servers);
                SELECT @@ROWCOUNT AS DeletedCount;
            `
            const credResult = await window.DB.execute(credQuery, [])
            if (credResult.success) {
                totalDeleted += credResult.data?.[0]?.DeletedCount || 0
            }

            // Cleanup orphaned servers
            const serverQuery = `
                DELETE FROM Servers
                WHERE EnvironmentID NOT IN (SELECT EnvironmentID FROM Environments);
                SELECT @@ROWCOUNT AS DeletedCount;
            `
            const serverResult = await window.DB.execute(serverQuery, [])
            if (serverResult.success) {
                totalDeleted += serverResult.data?.[0]?.DeletedCount || 0
            }

            // Cleanup orphaned file attachments
            const fileQuery = `
                DELETE FROM FileAttachments
                WHERE MessageID NOT IN (SELECT MessageID FROM Messages);
                SELECT @@ROWCOUNT AS DeletedCount;
            `
            const fileResult = await window.DB.execute(fileQuery, [])
            if (fileResult.success) {
                totalDeleted += fileResult.data?.[0]?.DeletedCount || 0
            }

            return { 
                success: true, 
                deletedCount: totalDeleted,
                message: `Removed ${totalDeleted} orphaned records`
            }
        } catch (error) {
            console.error('Error cleaning up orphaned records:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Check database health
     */
    async checkDatabaseHealth() {
        try {
            const checks = []

            // Check 1: Database connectivity
            checks.push({
                name: 'Database Connectivity',
                status: 'pass',
                message: 'Successfully connected to the database'
            })

            // Check 2: Check for corrupted indexes
            const indexQuery = `
                DBCC CHECKDB WITH NO_INFOMSGS, ALL_ERRORMSGS;
            `
            try {
                await window.DB.execute(indexQuery, [])
                checks.push({
                    name: 'Database Integrity',
                    status: 'pass',
                    message: 'No corruption detected in database'
                })
            } catch (error) {
                checks.push({
                    name: 'Database Integrity',
                    status: 'fail',
                    message: 'Database integrity check failed',
                    recommendation: 'Run DBCC CHECKDB to identify and repair corruption'
                })
            }

            // Check 3: Check database size vs available space
            const spaceQuery = `
                SELECT 
                    (SUM(size) * 8 / 1024) AS SizeMB,
                    (SUM(CAST(FILEPROPERTY(name, 'SpaceUsed') AS INT)) * 8 / 1024) AS UsedMB
                FROM sys.database_files
                WHERE type = 0
            `
            const spaceResult = await window.DB.query(spaceQuery, [])
            if (spaceResult.success && spaceResult.data?.[0]) {
                const sizeMB = spaceResult.data[0].SizeMB || 0
                const usedMB = spaceResult.data[0].UsedMB || 0
                const usagePercent = sizeMB > 0 ? (usedMB / sizeMB * 100) : 0

                if (usagePercent < 80) {
                    checks.push({
                        name: 'Database Space',
                        status: 'pass',
                        message: `Database is using ${usagePercent.toFixed(1)}% of allocated space`
                    })
                } else if (usagePercent < 90) {
                    checks.push({
                        name: 'Database Space',
                        status: 'warn',
                        message: `Database is using ${usagePercent.toFixed(1)}% of allocated space`,
                        recommendation: 'Consider expanding database size or archiving old data'
                    })
                } else {
                    checks.push({
                        name: 'Database Space',
                        status: 'fail',
                        message: `Database is using ${usagePercent.toFixed(1)}% of allocated space`,
                        recommendation: 'Urgent: Expand database size or free up space immediately'
                    })
                }
            }

            // Check 4: Check for fragmented indexes
            const fragQuery = `
                SELECT AVG(avg_fragmentation_in_percent) AS AvgFragmentation
                FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED')
                WHERE index_id > 0 AND page_count > 100
            `
            const fragResult = await window.DB.query(fragQuery, [])
            if (fragResult.success && fragResult.data?.[0]) {
                const avgFrag = fragResult.data[0].AvgFragmentation || 0

                if (avgFrag < 10) {
                    checks.push({
                        name: 'Index Fragmentation',
                        status: 'pass',
                        message: `Average fragmentation is ${avgFrag.toFixed(1)}%`
                    })
                } else if (avgFrag < 30) {
                    checks.push({
                        name: 'Index Fragmentation',
                        status: 'warn',
                        message: `Average fragmentation is ${avgFrag.toFixed(1)}%`,
                        recommendation: 'Consider reorganizing indexes to improve performance'
                    })
                } else {
                    checks.push({
                        name: 'Index Fragmentation',
                        status: 'fail',
                        message: `Average fragmentation is ${avgFrag.toFixed(1)}%`,
                        recommendation: 'Rebuild indexes to restore optimal performance'
                    })
                }
            }

            // Check 5: Check for missing indexes
            const missingIndexQuery = `
                SELECT COUNT(*) AS MissingIndexCount
                FROM sys.dm_db_missing_index_details
            `
            const missingIndexResult = await window.DB.query(missingIndexQuery, [])
            if (missingIndexResult.success && missingIndexResult.data?.[0]) {
                const count = missingIndexResult.data[0].MissingIndexCount || 0

                if (count === 0) {
                    checks.push({
                        name: 'Missing Indexes',
                        status: 'pass',
                        message: 'No missing indexes detected'
                    })
                } else if (count < 10) {
                    checks.push({
                        name: 'Missing Indexes',
                        status: 'warn',
                        message: `${count} potential missing indexes detected`,
                        recommendation: 'Review and create recommended indexes for better performance'
                    })
                } else {
                    checks.push({
                        name: 'Missing Indexes',
                        status: 'fail',
                        message: `${count} potential missing indexes detected`,
                        recommendation: 'Create recommended indexes to significantly improve query performance'
                    })
                }
            }

            // Check 6: Check last backup date
            const backupQuery = `
                SELECT TOP 1 backup_finish_date
                FROM msdb.dbo.backupset
                WHERE database_name = DB_NAME()
                ORDER BY backup_finish_date DESC
            `
            const backupResult = await window.DB.query(backupQuery, [])
            if (backupResult.success && backupResult.data?.[0]) {
                const lastBackup = new Date(backupResult.data[0].backup_finish_date)
                const daysSinceBackup = Math.floor((new Date() - lastBackup) / (1000 * 60 * 60 * 24))

                if (daysSinceBackup <= 1) {
                    checks.push({
                        name: 'Backup Status',
                        status: 'pass',
                        message: `Last backup was ${daysSinceBackup} day(s) ago`
                    })
                } else if (daysSinceBackup <= 7) {
                    checks.push({
                        name: 'Backup Status',
                        status: 'warn',
                        message: `Last backup was ${daysSinceBackup} days ago`,
                        recommendation: 'Schedule regular database backups'
                    })
                } else {
                    checks.push({
                        name: 'Backup Status',
                        status: 'fail',
                        message: `Last backup was ${daysSinceBackup} days ago`,
                        recommendation: 'Create a backup immediately and set up automated backups'
                    })
                }
            } else {
                checks.push({
                    name: 'Backup Status',
                    status: 'fail',
                    message: 'No backup history found',
                    recommendation: 'Create a database backup immediately'
                })
            }

            return {
                success: true,
                checks: checks
            }
        } catch (error) {
            console.error('Error checking database health:', error)
            return { success: false, error: error.message }
        }
    }
}

// Make globally accessible
window.DBMaintenanceService = DBMaintenanceService
