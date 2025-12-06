# Database Maintenance Module

A comprehensive database maintenance toolset for OrbisHub Desktop that provides essential database management, optimization, and monitoring capabilities.

## Features

### 📊 Database Statistics
- **Real-time Database Metrics**: View comprehensive statistics about your database
  - Total database size
  - Number of tables
  - Total record count
  - Index count
- **Per-Table Details**: Detailed breakdown showing:
  - Row counts
  - Data size
  - Index size
  - Total size per table

### ⚡ Database Optimization
- **Index Rebuild**: Rebuild all database indexes to improve query performance and reduce fragmentation
- **Update Statistics**: Update database statistics to help the query optimizer make better decisions
- **Shrink Database**: Reclaim unused space (use sparingly to avoid fragmentation)

### 💾 Database Backup
- **Full Database Backup**: Create complete backups of your database
- **Custom Backup Location**: Specify any path for backup files
- **Compressed Backups**: Automatic compression to save storage space

### 🧹 Data Cleanup
- **Audit Log Cleanup**: Remove old audit log entries based on retention period (default 90 days)
- **Orphaned Records Cleanup**: Identify and remove orphaned records:
  - Credentials without servers
  - Servers without environments
  - File attachments without messages

### 🏥 Database Health Check
Comprehensive health monitoring that checks:
- **Database Connectivity**: Verify connection to the database
- **Database Integrity**: Run DBCC CHECKDB to detect corruption
- **Database Space Usage**: Monitor allocated vs. used space
- **Index Fragmentation**: Identify fragmented indexes
- **Missing Indexes**: Detect opportunities for performance improvement
- **Backup Status**: Track last backup date and alert on outdated backups

## Usage

### Accessing DB Maintenance
1. Open OrbisHub Desktop
2. Navigate to **System Configuration** (⚙️ gear icon in the sidebar)
3. Click on the **DB Maintenance** tab

### Database Statistics
- Statistics load automatically when you open the tab
- Click **Refresh** to reload the latest data
- View the detailed table breakdown below the summary cards

### Running Maintenance Tasks

#### Rebuild Indexes
1. Click **Rebuild All Indexes**
2. Confirm the operation
3. Wait for the process to complete (may take several minutes)

**When to use:**
- Query performance has degraded
- Index fragmentation is above 30%
- After bulk data operations

#### Update Statistics
1. Click **Update Statistics**
2. The process runs automatically

**When to use:**
- After significant data changes
- Monthly maintenance
- Before important reporting periods

#### Shrink Database
1. Click **Shrink Database**
2. Confirm the operation
3. Wait for completion

**⚠️ Warning:** Use sparingly as it can cause index fragmentation. Only use when:
- Database has grown significantly and then data was deleted
- Reclaiming space is critical
- Followed by index rebuild

### Creating Backups
1. Enter the full backup path (e.g., `C:\Backups\OrbisHub.bak`)
2. Click **Create Backup**
3. Wait for the backup to complete

**Best Practices:**
- Include date in filename: `OrbisHub_2025-12-06.bak`
- Store backups on a different drive
- Set up automated backups via SQL Server Agent
- Test restore procedures regularly

### Cleaning Up Data

#### Audit Logs
1. Set the retention period in days (default: 90)
2. Click **Cleanup Old Logs**
3. Confirm deletion
4. Review the number of deleted records

#### Orphaned Records
1. Click **Cleanup Orphaned Data**
2. Confirm the operation
3. Review the cleanup summary

**Note:** This operation cannot be undone. Ensure you have a recent backup.

### Health Checks
1. Click **Run Health Check**
2. Review the results:
   - ✅ **Pass**: No issues detected
   - ⚠️ **Warning**: Minor issues or recommendations
   - ❌ **Fail**: Critical issues requiring attention
3. Follow recommendations for any failed checks

## Maintenance Schedule Recommendations

### Daily
- Monitor database statistics
- Check available disk space

### Weekly
- Run health check
- Review index fragmentation

### Monthly
- Update statistics
- Clean up audit logs (if retention > 30 days)
- Verify backup strategy

### Quarterly
- Rebuild indexes
- Review and optimize queries
- Archive old data if applicable

### As Needed
- Shrink database (only after major data deletions)
- Cleanup orphaned records
- Create ad-hoc backups before major changes

## Performance Considerations

### Index Rebuild
- **Impact**: High - blocks database access during operation
- **Duration**: Depends on database size (5-60 minutes typical)
- **Best Time**: After hours or during maintenance windows

### Update Statistics
- **Impact**: Low - minimal performance impact
- **Duration**: Fast (1-5 minutes typical)
- **Best Time**: Anytime

### Database Backup
- **Impact**: Medium - slows down database slightly
- **Duration**: Depends on database size (2-30 minutes typical)
- **Best Time**: During low-usage periods

### Shrink Database
- **Impact**: High - can significantly degrade performance
- **Duration**: Variable (10-60+ minutes)
- **Best Time**: After hours, followed by index rebuild

## Troubleshooting

### "Backup failed: Access Denied"
- Ensure the SQL Server service account has write permissions to the backup path
- Try using a local path on the SQL Server machine
- Check that the directory exists

### "Index rebuild failed"
- Check if database is in use by other processes
- Verify sufficient disk space (needs 1.5-2x database size)
- Review SQL Server error logs

### "Health check shows missing indexes"
- Review the recommended indexes in SQL Server Management Studio
- Create indexes during low-usage periods
- Test performance impact before creating all recommendations

### "Cleanup operations had no effect"
- Verify data exists in the target tables
- Check retention periods are appropriate
- Review foreign key relationships

## Security Notes

- All operations require appropriate database permissions
- Backup operations write files to the SQL Server machine's file system
- Cleanup operations are irreversible - always maintain recent backups
- Health checks run read-only operations and are safe to execute anytime

## Technical Details

### Database Compatibility
- SQL Server 2016 or later
- Azure SQL Database (some features limited)

### Permissions Required
- `db_owner` role recommended for full functionality
- Minimum: `db_datareader`, `db_datawriter`, and `BACKUP DATABASE` permission

### Files
- `db-maintenance-ui.js` - User interface logic
- `db-maintenance-service.js` - Database operations
- `db-maintenance-ui.css` - Styling

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review SQL Server error logs
3. Ensure you have recent backups before performing maintenance
4. Contact your database administrator for permissions issues
