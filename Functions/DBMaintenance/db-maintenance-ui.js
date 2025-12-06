/**
 * DB Maintenance UI Module
 * Provides database maintenance tools and utilities
 */

const DBMaintenanceUI = {
    /**
     * Show custom confirmation dialog
     */
    async showConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('customConfirmModal')
            const titleEl = document.getElementById('confirmTitle')
            const messageEl = document.getElementById('confirmMessage')
            const okBtn = document.getElementById('confirmOkBtn')
            const cancelBtn = document.getElementById('confirmCancelBtn')

            if (!modal || !titleEl || !messageEl || !okBtn) {
                resolve(false)
                return
            }

            titleEl.textContent = title
            messageEl.textContent = message

            const handleOk = () => {
                cleanup()
                resolve(true)
            }

            const handleCancel = () => {
                cleanup()
                resolve(false)
            }

            const cleanup = () => {
                okBtn.removeEventListener('click', handleOk)
                cancelBtn.removeEventListener('click', handleCancel)
                modal.removeEventListener('close', handleCancel)
                modal.close()
            }

            okBtn.addEventListener('click', handleOk)
            cancelBtn.addEventListener('click', handleCancel)
            modal.addEventListener('close', handleCancel, { once: true })

            if (modal.showModal) {
                modal.showModal()
            } else {
                modal.setAttribute('open', '')
            }
        })
    },

    /**
     * Initialize the DB Maintenance UI
     */
    async init() {
        console.log('DB Maintenance UI initialized')
        this.attachEventListeners()
        await this.loadDatabaseStats()
    },

    /**
     * Attach event listeners to DB Maintenance UI elements
     */
    attachEventListeners() {
        // Database Statistics
        const refreshStatsBtn = document.getElementById('refreshDbStatsBtn')
        if (refreshStatsBtn) {
            refreshStatsBtn.addEventListener('click', () => this.loadDatabaseStats())
        }

        // Database Backup
        const backupBtn = document.getElementById('backupDatabaseBtn')
        if (backupBtn) {
            backupBtn.addEventListener('click', () => this.performBackup())
        }

        // Index Optimization
        const rebuildIndexBtn = document.getElementById('rebuildIndexesBtn')
        if (rebuildIndexBtn) {
            rebuildIndexBtn.addEventListener('click', () => this.rebuildIndexes())
        }

        // Statistics Update
        const updateStatsBtn = document.getElementById('updateStatisticsBtn')
        if (updateStatsBtn) {
            updateStatsBtn.addEventListener('click', () => this.updateStatistics())
        }

        // Database Shrink
        const shrinkDbBtn = document.getElementById('shrinkDatabaseBtn')
        if (shrinkDbBtn) {
            shrinkDbBtn.addEventListener('click', () => this.shrinkDatabase())
        }

        // Audit Log Cleanup
        const cleanupAuditBtn = document.getElementById('cleanupAuditBtn')
        if (cleanupAuditBtn) {
            cleanupAuditBtn.addEventListener('click', () => this.cleanupAuditLogs())
        }

        // Orphaned Records Cleanup
        const cleanupOrphansBtn = document.getElementById('cleanupOrphansBtn')
        if (cleanupOrphansBtn) {
            cleanupOrphansBtn.addEventListener('click', () => this.cleanupOrphanedRecords())
        }

        // Check Database Health
        const checkHealthBtn = document.getElementById('checkDbHealthBtn')
        if (checkHealthBtn) {
            checkHealthBtn.addEventListener('click', () => this.checkDatabaseHealth())
        }
    },

    /**
     * Load database statistics
     */
    async loadDatabaseStats() {
        const statsContainer = document.getElementById('dbStatsContainer')
        if (!statsContainer) return

        try {
            statsContainer.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div class="spinner-ring" style="margin: 0 auto;"></div>
                    <p class="muted" style="margin-top: 12px;">Loading database statistics...</p>
                </div>
            `

            const stats = await DBMaintenanceService.getDatabaseStats()

            if (stats.success) {
                this.renderDatabaseStats(stats.data)
            } else {
                statsContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">⚠️</div>
                        <h3>Failed to load statistics</h3>
                        <p class="muted">${stats.error || 'Unknown error occurred'}</p>
                    </div>
                `
            }
        } catch (error) {
            console.error('Error loading database stats:', error)
            statsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">❌</div>
                    <h3>Error loading statistics</h3>
                    <p class="muted">${error.message}</p>
                </div>
            `
        }
    },

    /**
     * Render database statistics
     */
    renderDatabaseStats(stats) {
        const statsContainer = document.getElementById('dbStatsContainer')
        if (!statsContainer) return

        statsContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                <div class="stat-card">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Database Size</div>
                        <div class="stat-value">${this.formatBytes(stats.databaseSize || 0)}</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7"/>
                            <rect x="14" y="3" width="7" height="7"/>
                            <rect x="14" y="14" width="7" height="7"/>
                            <rect x="3" y="14" width="7" height="7"/>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Total Tables</div>
                        <div class="stat-value">${stats.tableCount || 0}</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <line x1="12" y1="1" x2="12" y2="23"/>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Total Records</div>
                        <div class="stat-value">${this.formatNumber(stats.totalRecords || 0)}</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                        </svg>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Index Count</div>
                        <div class="stat-value">${stats.indexCount || 0}</div>
                    </div>
                </div>
            </div>

            ${stats.tables && stats.tables.length > 0 ? `
                <div style="margin-top: 24px;">
                    <h3 style="margin-bottom: 16px;">Table Details</h3>
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Table Name</th>
                                    <th>Rows</th>
                                    <th>Data Size</th>
                                    <th>Index Size</th>
                                    <th>Total Size</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stats.tables.map(table => `
                                    <tr>
                                        <td><strong>${table.name}</strong></td>
                                        <td>${this.formatNumber(table.rows || 0)}</td>
                                        <td>${this.formatBytes(table.dataSize || 0)}</td>
                                        <td>${this.formatBytes(table.indexSize || 0)}</td>
                                        <td><strong>${this.formatBytes((table.dataSize || 0) + (table.indexSize || 0))}</strong></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
        `
    },

    /**
     * Perform database backup
     */
    async performBackup() {
        const backupPath = document.getElementById('backupPathInput')?.value || ''
        
        if (!backupPath) {
            if (window.Toast) {
                window.Toast.show('Please specify a backup path', 'warning')
            }
            return
        }

        // Validate backup path format
        if (!backupPath.match(/\.(bak|trn|dif)$/i)) {
            if (window.Toast) {
                window.Toast.show('Backup path must end with .bak, .trn, or .dif extension', 'warning')
            }
            return
        }

        const confirmed = await this.showConfirm(
            'Backup Database',
            `Are you sure you want to backup the database to:\n${backupPath}?\n\nNote: The directory must exist on the SQL Server machine and the SQL Server service account must have write permissions.`
        )
        if (!confirmed) return

        const button = document.getElementById('backupDatabaseBtn')
        const originalText = button?.innerHTML

        try {
            if (button) {
                button.disabled = true
                button.innerHTML = '<div class="spinner-ring" style="width:14px;height:14px;border-width:2px;"></div> Backing up...'
            }

            const result = await DBMaintenanceService.backupDatabase(backupPath)

            if (result.success) {
                if (window.Toast) {
                    window.Toast.show('Database backup completed successfully', 'success')
                }
                await this.loadDatabaseStats()
            } else {
                throw new Error(result.error || 'Backup failed')
            }
        } catch (error) {
            console.error('Backup error:', error)
            
            // Extract meaningful error message
            let errorMsg = error.message
            if (error.message.includes('Cannot open backup device')) {
                errorMsg = 'Cannot create backup file. Please ensure:\n\n' +
                          '1. The directory exists on the SQL Server machine\n' +
                          '2. The SQL Server service account has write permissions\n' +
                          '3. The path is accessible from the SQL Server\n\n' +
                          'Try using a simple path like: C:\\Temp\\OrbisHub.bak'
            }
            
            if (window.Toast) {
                window.Toast.show(`Backup failed: ${errorMsg}`, 'error')
            }
        } finally {
            if (button) {
                button.disabled = false
                button.innerHTML = originalText
            }
        }
    },

    /**
     * Rebuild database indexes
     */
    async rebuildIndexes() {
        const confirmed = await this.showConfirm(
            'Rebuild Indexes',
            'Rebuilding indexes may take some time and could affect database performance.\n\nDo you want to continue?'
        )
        if (!confirmed) return

        const button = document.getElementById('rebuildIndexesBtn')
        const originalText = button?.innerHTML

        try {
            if (button) {
                button.disabled = true
                button.innerHTML = '<div class="spinner-ring" style="width:14px;height:14px;border-width:2px;"></div> Rebuilding...'
            }

            const result = await DBMaintenanceService.rebuildIndexes()

            if (result.success) {
                if (window.Toast) {
                    window.Toast.show(`Indexes rebuilt successfully. ${result.message || ''}`, 'success')
                }
                await this.loadDatabaseStats()
            } else {
                throw new Error(result.error || 'Index rebuild failed')
            }
        } catch (error) {
            console.error('Index rebuild error:', error)
            if (window.Toast) {
                window.Toast.show(`Index rebuild failed: ${error.message}`, 'error')
            }
        } finally {
            if (button) {
                button.disabled = false
                button.innerHTML = originalText
            }
        }
    },

    /**
     * Update database statistics
     */
    async updateStatistics() {
        const button = document.getElementById('updateStatisticsBtn')
        const originalText = button?.innerHTML

        try {
            if (button) {
                button.disabled = true
                button.innerHTML = '<div class="spinner-ring" style="width:14px;height:14px;border-width:2px;"></div> Updating...'
            }

            const result = await DBMaintenanceService.updateStatistics()

            if (result.success) {
                if (window.Toast) {
                    window.Toast.show('Database statistics updated successfully', 'success')
                }
                await this.loadDatabaseStats()
            } else {
                throw new Error(result.error || 'Statistics update failed')
            }
        } catch (error) {
            console.error('Statistics update error:', error)
            if (window.Toast) {
                window.Toast.show(`Statistics update failed: ${error.message}`, 'error')
            }
        } finally {
            if (button) {
                button.disabled = false
                button.innerHTML = originalText
            }
        }
    },

    /**
     * Shrink database
     */
    async shrinkDatabase() {
        const confirmed = await this.showConfirm(
            'Shrink Database',
            'Shrinking the database can be time-consuming and may affect performance.\n\nThis operation will reclaim unused space.\n\nDo you want to continue?'
        )
        if (!confirmed) return

        const button = document.getElementById('shrinkDatabaseBtn')
        const originalText = button?.innerHTML

        try {
            if (button) {
                button.disabled = true
                button.innerHTML = '<div class="spinner-ring" style="width:14px;height:14px;border-width:2px;"></div> Shrinking...'
            }

            const result = await DBMaintenanceService.shrinkDatabase()

            if (result.success) {
                if (window.Toast) {
                    window.Toast.show(`Database shrunk successfully. ${result.message || ''}`, 'success')
                }
                await this.loadDatabaseStats()
            } else {
                throw new Error(result.error || 'Shrink operation failed')
            }
        } catch (error) {
            console.error('Database shrink error:', error)
            if (window.Toast) {
                window.Toast.show(`Shrink operation failed: ${error.message}`, 'error')
            }
        } finally {
            if (button) {
                button.disabled = false
                button.innerHTML = originalText
            }
        }
    },

    /**
     * Cleanup old audit logs
     */
    async cleanupAuditLogs() {
        const daysInput = document.getElementById('auditRetentionDays')
        const days = parseInt(daysInput?.value || '90')

        const confirmed = await this.showConfirm(
            'Cleanup Audit Logs',
            `This will delete audit logs older than ${days} days.\n\nThis action cannot be undone.\n\nDo you want to continue?`
        )
        if (!confirmed) return

        const button = document.getElementById('cleanupAuditBtn')
        const originalText = button?.innerHTML

        try {
            if (button) {
                button.disabled = true
                button.innerHTML = '<div class="spinner-ring" style="width:14px;height:14px;border-width:2px;"></div> Cleaning...'
            }

            const result = await DBMaintenanceService.cleanupAuditLogs(days)

            if (result.success) {
                if (window.Toast) {
                    window.Toast.show(`Cleanup completed. ${result.deletedCount || 0} records removed.`, 'success')
                }
                await this.loadDatabaseStats()
            } else {
                throw new Error(result.error || 'Cleanup failed')
            }
        } catch (error) {
            console.error('Audit cleanup error:', error)
            if (window.Toast) {
                window.Toast.show(`Cleanup failed: ${error.message}`, 'error')
            }
        } finally {
            if (button) {
                button.disabled = false
                button.innerHTML = originalText
            }
        }
    },

    /**
     * Cleanup orphaned records
     */
    async cleanupOrphanedRecords() {
        const confirmed = await this.showConfirm(
            'Cleanup Orphaned Records',
            'This will identify and remove orphaned records from the database.\n\nThis action cannot be undone.\n\nDo you want to continue?'
        )
        if (!confirmed) return

        const button = document.getElementById('cleanupOrphansBtn')
        const originalText = button?.innerHTML

        try {
            if (button) {
                button.disabled = true
                button.innerHTML = '<div class="spinner-ring" style="width:14px;height:14px;border-width:2px;"></div> Cleaning...'
            }

            const result = await DBMaintenanceService.cleanupOrphanedRecords()

            if (result.success) {
                if (window.Toast) {
                    window.Toast.show(`Cleanup completed. ${result.deletedCount || 0} orphaned records removed.`, 'success')
                }
                await this.loadDatabaseStats()
            } else {
                throw new Error(result.error || 'Cleanup failed')
            }
        } catch (error) {
            console.error('Orphan cleanup error:', error)
            if (window.Toast) {
                window.Toast.show(`Cleanup failed: ${error.message}`, 'error')
            }
        } finally {
            if (button) {
                button.disabled = false
                button.innerHTML = originalText
            }
        }
    },

    /**
     * Check database health
     */
    async checkDatabaseHealth() {
        const resultsContainer = document.getElementById('healthCheckResults')
        if (!resultsContainer) return

        const button = document.getElementById('checkDbHealthBtn')
        const originalText = button?.innerHTML

        try {
            if (button) {
                button.disabled = true
                button.innerHTML = '<div class="spinner-ring" style="width:14px;height:14px;border-width:2px;"></div> Checking...'
            }

            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div class="spinner-ring" style="margin: 0 auto;"></div>
                    <p class="muted" style="margin-top: 12px;">Running database health checks...</p>
                </div>
            `

            const result = await DBMaintenanceService.checkDatabaseHealth()

            if (result.success) {
                this.renderHealthCheckResults(result.checks)
            } else {
                throw new Error(result.error || 'Health check failed')
            }
        } catch (error) {
            console.error('Health check error:', error)
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">❌</div>
                    <h3>Health check failed</h3>
                    <p class="muted">${error.message}</p>
                </div>
            `
        } finally {
            if (button) {
                button.disabled = false
                button.innerHTML = originalText
            }
        }
    },

    /**
     * Render health check results
     */
    renderHealthCheckResults(checks) {
        const resultsContainer = document.getElementById('healthCheckResults')
        if (!resultsContainer || !checks) return

        const allPassed = checks.every(check => check.status === 'pass')
        const totalChecks = checks.length
        const passedChecks = checks.filter(check => check.status === 'pass').length

        resultsContainer.innerHTML = `
            <div style="margin-bottom: 20px; padding: 16px; background: ${allPassed ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'}; border-radius: 8px; border-left: 4px solid ${allPassed ? '#10b981' : '#ef4444'};">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 32px;">${allPassed ? '✅' : '⚠️'}</div>
                    <div>
                        <h3 style="margin: 0; color: ${allPassed ? '#065f46' : '#991b1b'};">
                            ${allPassed ? 'Database Health: Good' : 'Database Health: Issues Detected'}
                        </h3>
                        <p style="margin: 4px 0 0 0; color: ${allPassed ? '#047857' : '#b91c1c'};">
                            ${passedChecks} of ${totalChecks} checks passed
                        </p>
                    </div>
                </div>
            </div>

            <div class="health-checks-list">
                ${checks.map(check => `
                    <div class="health-check-item ${check.status}">
                        <div class="health-check-icon">
                            ${check.status === 'pass' ? '✓' : '✗'}
                        </div>
                        <div class="health-check-content">
                            <h4>${check.name}</h4>
                            <p class="muted">${check.message || ''}</p>
                            ${check.recommendation ? `
                                <p style="margin-top: 8px; font-size: 12px; color: #f59e0b;">
                                    <strong>💡 Recommendation:</strong> ${check.recommendation}
                                </p>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `
    },

    /**
     * Format bytes to human-readable size
     */
    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes'
        if (isNaN(bytes) || !isFinite(bytes)) return 'N/A'
        
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        
        // Ensure index is within bounds
        const index = Math.min(i, sizes.length - 1)
        
        return Math.round((bytes / Math.pow(k, index)) * 100) / 100 + ' ' + sizes[index]
    },

    /**
     * Format number with thousand separators
     */
    formatNumber(num) {
        if (!num || isNaN(num) || !isFinite(num)) return '0'
        // Ensure we're working with an integer
        const n = Math.floor(Math.abs(num))
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }
}

// Make globally accessible
window.DBMaintenanceUI = DBMaintenanceUI
