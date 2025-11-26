// OrbisAgent UI Module
// Handles all agent-related UI rendering and interactions
// Author: OrbisHub Team
// Created: 2025-11-25

/**
 * Agent UI Module
 * Provides UI components and rendering for agent management
 */

const AgentUI = {
    /**
     * Render agents dashboard
     */
    async renderAgentsDashboard() {
        const agentsList = document.getElementById('agentsList')
        if (!agentsList) return

        agentsList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted);">Loading agents...</div>'

        try {
            const agents = await window.AgentAPI.getAllAgents()

            if (agents.length === 0) {
                agentsList.innerHTML = `
                    <div class="agent-empty-state">
                        <svg class="agent-empty-state__icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <h3 class="agent-empty-state__title">No Agents Connected</h3>
                        <p class="agent-empty-state__description">
                            Deploy OrbisAgent to your remote machines to start monitoring system metrics,<br>
                            executing scripts, and managing your infrastructure.
                        </p>
                    </div>
                `
                return
            }

            // Render agents grid
            agentsList.innerHTML = ''
            
            // Update status counters
            this.updateStatusCounters(agents)
            
            agents.forEach(agent => {
                const agentCard = this.createAgentCard(agent)
                agentsList.appendChild(agentCard)
            })

        } catch (error) {
            console.error('Failed to render agents:', error)
            agentsList.innerHTML = `
                <div class="agent-empty-state">
                    <svg class="agent-empty-state__icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <h3 class="agent-empty-state__title" style="color:#ef4444;">Failed to Load Agents</h3>
                    <p class="agent-empty-state__description">${error.message}</p>
                </div>
            `
        }
    },

    /**
     * Create agent card element
     * @param {Object} agent - Agent data
     * @returns {HTMLElement} - Agent card element
     */
    createAgentCard(agent) {
        const card = document.createElement('div')
        card.className = 'agent-card'
        
        // Determine status based on last heartbeat (UTC timestamp)
        const now = new Date().getTime()
        const lastHeartbeat = new Date(agent.lastHeartbeat + 'Z').getTime() // Ensure UTC parsing
        const secondsSinceHeartbeat = (now - lastHeartbeat) / 1000
        
        let status = 'offline'
        let statusClass = 'offline'
        
        if (secondsSinceHeartbeat < 120) { // Less than 2 minutes
            status = 'online'
            statusClass = 'online'
        } else if (secondsSinceHeartbeat < 600) { // Less than 10 minutes
            status = 'idle'
            statusClass = 'idle'
        } else {
            status = 'offline'
            statusClass = 'offline'
        }

        // Format metadata
        const metadata = agent.metadata || {}
        const cpuPercent = metadata.cpuPercent || 0
        const memPercent = metadata.memoryPercent || 0
        const diskPercent = metadata.diskPercent || 0
        const uptime = metadata.uptime || '—'
        
        const cpuInfo = cpuPercent ? `${cpuPercent.toFixed(1)}%` : '—'
        const memInfo = memPercent ? `${memPercent.toFixed(1)}%` : '—'
        const diskInfo = diskPercent ? `${diskPercent.toFixed(1)}%` : '—'
        
        // Determine warning/danger states
        const cpuClass = cpuPercent > 80 ? 'agent-card__metric-value--danger' : cpuPercent > 60 ? 'agent-card__metric-value--warning' : ''
        const memClass = memPercent > 85 ? 'agent-card__metric-value--danger' : memPercent > 70 ? 'agent-card__metric-value--warning' : ''
        const diskClass = diskPercent > 90 ? 'agent-card__metric-value--danger' : diskPercent > 75 ? 'agent-card__metric-value--warning' : ''
        
        card.innerHTML = `
            <div class="agent-card__header">
                <div class="agent-card__info">
                    <div class="agent-card__status-indicator agent-card__status-indicator--${statusClass}"></div>
                    <div>
                        <div class="agent-card__name">${agent.machineName}</div>
                        <div class="agent-card__os">${agent.os || 'Unknown OS'}</div>
                    </div>
                </div>
                <span class="agent-card__status-badge agent-card__status-badge--${statusClass}">${status}</span>
            </div>
            
            <div class="agent-card__metrics">
                <div class="agent-card__metric">
                    <div class="agent-card__metric-label">CPU</div>
                    <div class="agent-card__metric-value ${cpuClass}">${cpuInfo}</div>
                </div>
                <div class="agent-card__metric">
                    <div class="agent-card__metric-label">Memory</div>
                    <div class="agent-card__metric-value ${memClass}">${memInfo}</div>
                </div>
                <div class="agent-card__metric">
                    <div class="agent-card__metric-label">Disk</div>
                    <div class="agent-card__metric-value ${diskClass}">${diskInfo}</div>
                </div>
                <div class="agent-card__metric">
                    <div class="agent-card__metric-label">Uptime</div>
                    <div class="agent-card__metric-value">${uptime}</div>
                </div>
            </div>
            
            <div class="agent-card__details">
                <div class="agent-card__detail-row">
                    <span class="agent-card__detail-label">IP Address:</span>
                    <span class="agent-card__detail-value">${this.getPrimaryIP(agent.ipAddress)}</span>
                </div>
                <div class="agent-card__detail-row">
                    <span class="agent-card__detail-label">Last Seen:</span>
                    <span class="agent-card__detail-value">${this.formatTimeAgo(agent.lastHeartbeat)}</span>
                </div>
                <div class="agent-card__detail-row">
                    <span class="agent-card__detail-label">Version:</span>
                    <span class="agent-card__detail-value">v${agent.version || '1.0.0'}</span>
                </div>
            </div>
            
            <div class="agent-card__actions">
                <button class="agent-card__action-btn agent-card__action-btn--primary" onclick="AgentUI.viewAgentDetails('${agent.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    Details
                </button>
                <button class="agent-card__action-btn agent-card__action-btn--success" onclick="AgentUI.runJobOnAgent('${agent.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Run Job
                </button>
                <button class="agent-card__action-btn agent-card__action-btn--danger" onclick="AgentUI.deleteAgent('${agent.id}', '${agent.machineName}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `
        
        return card
    },

    /**
     * Format timestamp to relative time
     * @param {string} timestamp - ISO timestamp
     * @returns {string} - Formatted time ago
     */
    formatTimeAgo(timestamp) {
        const now = new Date().getTime()
        const then = new Date(timestamp + 'Z').getTime() // Ensure UTC parsing
        const seconds = Math.floor((now - then) / 1000)

        if (seconds < 0) return 'just now' // Handle future timestamps
        if (seconds < 60) return `${seconds}s ago`
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
        return `${Math.floor(seconds / 86400)}d ago`
    },

    /**
     * Extract primary IP address from comma-separated list
     * Filters out link-local addresses (169.254.x.x) and returns the first valid IP
     * @param {string} ipAddresses - Comma-separated IP addresses
     * @returns {string} - Primary IP address
     */
    getPrimaryIP(ipAddresses) {
        if (!ipAddresses) return '—'
        
        const ips = ipAddresses.split(',').map(ip => ip.trim())
        
        // Filter out link-local addresses (169.254.x.x) and prefer private network IPs
        const validIPs = ips.filter(ip => !ip.startsWith('169.254.'))
        
        if (validIPs.length === 0) return ips[0] || '—' // Fallback to first IP if all are link-local
        
        // Prefer 192.168.x.x or 10.x.x.x addresses
        const privateIP = validIPs.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.'))
        return privateIP || validIPs[0]
    },

    /**
     * Switch between tabs in agent details modal
     * @param {string} tabName - Tab name ('jobs' or 'builds')
     */
    switchTab(tabName) {
        // Update tab buttons
        const tabs = document.querySelectorAll('.agent-tab')
        if (tabs.length === 0) return
        
        tabs.forEach(tab => tab.classList.remove('agent-tab--active'))
        
        const panels = document.querySelectorAll('.agent-tab-panel')
        panels.forEach(panel => panel.classList.remove('agent-tab-panel--active'))
        
        // Activate selected tab
        if (tabName === 'jobs') {
            if (tabs[0]) tabs[0].classList.add('agent-tab--active')
            const jobsPanel = document.getElementById('agentTabJobs')
            if (jobsPanel) jobsPanel.classList.add('agent-tab-panel--active')
        } else if (tabName === 'builds') {
            if (tabs[1]) tabs[1].classList.add('agent-tab--active')
            const buildsPanel = document.getElementById('agentTabBuilds')
            if (buildsPanel) buildsPanel.classList.add('agent-tab-panel--active')
        }
    },

    /**
     * Show agent details modal
     * @param {string} agentId - Agent ID
     */
    async viewAgentDetails(agentId) {
        const modal = document.getElementById('agentDetailsModal')
        if (!modal) return

        try {
            const agent = await window.AgentAPI.getAgentById(agentId)
            if (!agent) {
                alert('Agent not found')
                return
            }

            // Store agent ID for tab switching
            modal.dataset.agentId = agentId

            // Load recent jobs and build history
            const [jobs, buildHistory] = await Promise.all([
                window.AgentAPI.getAgentJobs(agentId, 10),
                window.AgentAPI.getAgentBuildHistory(agentId, 20)
            ])

            // Populate modal
            const nameEl = document.getElementById('agentDetailName')
            const osEl = document.getElementById('agentDetailOS')
            const ipEl = document.getElementById('agentDetailIP')
            const statusEl = document.getElementById('agentDetailStatus')
            const versionEl = document.getElementById('agentDetailVersion')
            const lastSeenEl = document.getElementById('agentDetailLastSeen')
            
            if (nameEl) nameEl.textContent = agent.machineName
            if (osEl) osEl.textContent = agent.os || 'Unknown'
            if (ipEl) ipEl.textContent = agent.ipAddress || '—'
            if (statusEl) statusEl.textContent = agent.status
            if (versionEl) versionEl.textContent = agent.version || '1.0.0'
            if (lastSeenEl) lastSeenEl.textContent = new Date(agent.lastHeartbeat).toLocaleString()

            // Render recent jobs
            this.renderJobsList(jobs)
            
            // Render build history
            this.renderBuildHistory(buildHistory, agent.version)

            // Reset to jobs tab
            this.switchTab('jobs')

            // Show modal
            modal.showModal()

        } catch (error) {
            console.error('Failed to load agent details:', error)
            alert('Failed to load agent details')
        }
    },

    /**
     * Render jobs list in modal
     * @param {Array} jobs - Array of jobs
     */
    renderJobsList(jobs) {
        const jobsList = document.getElementById('agentDetailJobs')
        if (!jobsList) return
        
        if (jobs.length === 0) {
            jobsList.innerHTML = '<p class="muted" style="text-align:center; padding:20px;">No jobs yet</p>'
        } else {
            jobsList.innerHTML = jobs.map((job, index) => {
                const statusColor = job.status === 'Completed' ? '#10b981' : 
                                  job.status === 'Failed' ? '#ef4444' : 
                                  job.status === 'Running' ? '#3b82f6' : '#f59e0b'
                
                // Parse payload to get script
                let script = ''
                let shell = 'PowerShell'
                try {
                    if (job.payloadJson) {
                        const payload = JSON.parse(job.payloadJson)
                        script = payload.script || ''
                        shell = payload.shell || 'PowerShell'
                    }
                } catch (e) {
                    // Ignore parse errors
                }
                
                // Parse result
                let result = ''
                let exitCode = null
                try {
                    if (job.resultJson) {
                        const resultData = JSON.parse(job.resultJson)
                        result = resultData.output || resultData.result || ''
                        exitCode = resultData.exitCode
                    }
                } catch (e) {
                    // Ignore parse errors
                }
                
                const hasScript = script && script.trim().length > 0
                const hasResult = result && result.trim().length > 0
                const hasError = job.errorMessage && job.errorMessage.trim().length > 0
                
                return `
                    <div class="agent-job-card">
                        <div class="agent-job-card__header">
                            <div class="agent-job-card__info">
                                <div class="agent-job-card__type">${job.type}</div>
                                <div class="agent-job-card__time">${new Date(job.createdUtc).toLocaleString()}</div>
                            </div>
                            <span class="agent-job-card__status" style="background:${statusColor}20; color:${statusColor};">
                                ${job.status}
                            </span>
                        </div>
                        
                        ${job.startedUtc ? `
                        <div class="agent-job-card__meta">
                            <div class="agent-job-card__meta-item">
                                <span class="agent-job-card__meta-label">Started:</span>
                                <span class="agent-job-card__meta-value">${new Date(job.startedUtc).toLocaleString()}</span>
                            </div>
                            ${job.completedUtc ? `
                            <div class="agent-job-card__meta-item">
                                <span class="agent-job-card__meta-label">Completed:</span>
                                <span class="agent-job-card__meta-value">${new Date(job.completedUtc).toLocaleString()}</span>
                            </div>
                            <div class="agent-job-card__meta-item">
                                <span class="agent-job-card__meta-label">Duration:</span>
                                <span class="agent-job-card__meta-value">${this.formatDuration(job.startedUtc, job.completedUtc)}</span>
                            </div>
                            ` : ''}
                            ${exitCode !== null ? `
                            <div class="agent-job-card__meta-item">
                                <span class="agent-job-card__meta-label">Exit Code:</span>
                                <span class="agent-job-card__meta-value" style="color:${exitCode === 0 ? '#10b981' : '#ef4444'};">${exitCode}</span>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                        
                        ${hasScript ? `
                        <div class="agent-job-card__section">
                            <button class="agent-job-card__toggle" onclick="AgentUI.toggleJobSection('script-${index}')">
                                <svg class="agent-job-card__toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                Script (${shell})
                            </button>
                            <div id="script-${index}" class="agent-job-card__content" style="display:none;">
                                <pre class="agent-job-card__code">${this.escapeHtml(script)}</pre>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${hasResult ? `
                        <div class="agent-job-card__section">
                            <button class="agent-job-card__toggle" onclick="AgentUI.toggleJobSection('result-${index}')">
                                <svg class="agent-job-card__toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                Output
                            </button>
                            <div id="result-${index}" class="agent-job-card__content" style="display:none;">
                                <pre class="agent-job-card__code">${this.escapeHtml(result)}</pre>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${hasError ? `
                        <div class="agent-job-card__section">
                            <button class="agent-job-card__toggle agent-job-card__toggle--error" onclick="AgentUI.toggleJobSection('error-${index}')">
                                <svg class="agent-job-card__toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                Error
                            </button>
                            <div id="error-${index}" class="agent-job-card__content" style="display:none;">
                                <pre class="agent-job-card__code agent-job-card__code--error">${this.escapeHtml(job.errorMessage)}</pre>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                `
            }).join('')
        }
    },

    /**
     * Toggle job section visibility
     * @param {string} sectionId - Section ID
     */
    toggleJobSection(sectionId) {
        const section = document.getElementById(sectionId)
        const toggle = section?.previousElementSibling
        
        if (section && toggle) {
            const isHidden = section.style.display === 'none'
            section.style.display = isHidden ? 'block' : 'none'
            
            const icon = toggle.querySelector('.agent-job-card__toggle-icon')
            if (icon) {
                icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)'
            }
        }
    },

    /**
     * Format duration between two dates
     * @param {string} start - Start timestamp
     * @param {string} end - End timestamp
     * @returns {string} - Formatted duration
     */
    formatDuration(start, end) {
        const ms = new Date(end) - new Date(start)
        const seconds = Math.floor(ms / 1000)
        
        if (seconds < 60) return `${seconds}s`
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    escapeHtml(text) {
        if (!text) return ''
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    },

    /**
     * Render build history in modal
     * @param {Array} builds - Array of build history entries
     * @param {string} currentVersion - Current agent version
     */
    renderBuildHistory(builds, currentVersion) {
        const buildsList = document.getElementById('agentDetailBuilds')
        if (!buildsList) return
        
        if (builds.length === 0) {
            buildsList.innerHTML = `
                <div class="agent-builds-empty">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                    </svg>
                    <h4>No Build History</h4>
                    <p>Build deployments and version changes will appear here</p>
                </div>
            `
            return
        }
        
        buildsList.innerHTML = builds.map((build, index) => {
            const isCurrent = build.version === currentVersion && index === 0
            const itemClass = isCurrent ? 'agent-build-item--current' : (build.status === 'failed' ? 'agent-build-item--failed' : '')
            const badgeText = isCurrent ? 'Current' : (build.status === 'failed' ? 'Failed' : build.status || 'Deployed')
            
            const icon = isCurrent ? 
                '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' :
                (build.status === 'failed' ? 
                    '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>' :
                    '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>')
            
            return `
                <div class="agent-build-item ${itemClass}">
                    <div class="agent-build-item__icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${icon}
                        </svg>
                    </div>
                    <div class="agent-build-item__content">
                        <div class="agent-build-item__header">
                            <div class="agent-build-item__version">v${build.version}</div>
                            <div class="agent-build-item__badge">${badgeText}</div>
                        </div>
                        <div class="agent-build-item__time">
                            ${this.formatTimeAgo(build.timestamp)} · ${new Date(build.timestamp).toLocaleString()}
                        </div>
                        ${build.osVersion ? `
                        <div class="agent-build-item__details">
                            <div class="agent-build-item__detail">
                                <div class="agent-build-item__detail-label">OS Version</div>
                                <div class="agent-build-item__detail-value">${build.osVersion}</div>
                            </div>
                            ${build.deployedBy ? `
                            <div class="agent-build-item__detail">
                                <div class="agent-build-item__detail-label">Deployed By</div>
                                <div class="agent-build-item__detail-value">${build.deployedBy}</div>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                        ${build.description ? `
                        <div class="agent-build-item__description">
                            ${build.description}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `
        }).join('')
    },

    /**
     * Show run job modal
     * @param {string} agentId - Agent ID
     */
    async runJobOnAgent(agentId) {
        const modal = document.getElementById('runJobModal')
        if (!modal) return

        // Store agent ID in modal for later use
        modal.dataset.agentId = agentId

        // Get agent name for display
        const agent = await window.AgentAPI.getAgentById(agentId)
        if (agent) {
            document.getElementById('runJobAgentName').textContent = agent.machineName
        }

        // Clear form
        document.getElementById('jobType').value = 'PowerShell'
        document.getElementById('jobScript').value = ''

        modal.showModal()
    },

    /**
     * Submit job to agent
     */
    async submitJob() {
        const modal = document.getElementById('runJobModal')
        const agentId = modal.dataset.agentId
        const type = document.getElementById('jobType').value
        const script = document.getElementById('jobScript').value.trim()

        if (!script) {
            alert('Please enter a script or command')
            return
        }

        const currentUser = getSession()
        
        try {
            const result = await window.AgentAPI.createJob({
                agentId,
                type,
                script,
                createdBy: currentUser?.name || 'Unknown'
            })

            if (result.success) {
                window.ToastManager?.success('Job Created', `Job queued for execution on agent`, 3000)
                modal.close()
                
                // Log audit
                if (window.logAudit) {
                    window.logAudit('create', 'agent-job', agentId, { type, jobId: result.jobId })
                }
            } else {
                throw new Error(result.error || 'Failed to create job')
            }
        } catch (error) {
            console.error('Failed to submit job:', error)
            alert(`Failed to submit job: ${error.message}`)
        }
    },

    /**
     * Delete agent
     * @param {string} agentId - Agent ID
     * @param {string} machineName - Machine name for confirmation
     */
    async deleteAgent(agentId, machineName) {
        if (!confirm(`Are you sure you want to delete agent "${machineName}"? This will remove all associated jobs and metrics.`)) {
            return
        }

        try {
            const result = await window.AgentAPI.deleteAgent(agentId)
            
            if (result.success) {
                window.ToastManager?.success('Agent Deleted', `Agent ${machineName} has been removed`, 3000)
                this.renderAgentsDashboard()
                
                // Log audit
                if (window.logAudit) {
                    window.logAudit('delete', 'agent', machineName, { agentId })
                }
            } else {
                throw new Error(result.error || 'Failed to delete agent')
            }
        } catch (error) {
            console.error('Failed to delete agent:', error)
            alert(`Failed to delete agent: ${error.message}`)
        }
    },

    /**
     * Show deployment guide modal
     */
    showDeploymentGuide() {
        const modal = document.getElementById('agentDeploymentModal')
        if (modal) {
            modal.showModal()
            // Attach copy handlers (idempotent)
            this.attachDeploymentCopyHandlers()
        }
    },

    /**
     * Attach copy button handlers in deployment modal
     */
    attachDeploymentCopyHandlers() {
        const buttons = document.querySelectorAll('#agentDeploymentModal .deployment-code-copy')
        buttons.forEach(btn => {
            // Avoid double-binding
            if (btn.dataset.bound) return
            btn.dataset.bound = '1'
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-copy-target')
                if (!target) return
                try {
                    navigator.clipboard.writeText(target)
                    btn.textContent = 'Copied!'
                    btn.classList.add('copied')
                    setTimeout(() => {
                        btn.classList.remove('copied')
                        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 1 21 6 8 19 3 19 3 14 16 1"></polyline></svg>Copy'
                    }, 1800)
                } catch (err) {
                    console.error('Clipboard copy failed:', err)
                    btn.textContent = 'Failed'
                    setTimeout(() => {
                        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 1 21 6 8 19 3 19 3 14 16 1"></polyline></svg>Copy'
                    }, 1800)
                }
            })
        })
    },

    /**
     * Update status counters in toolbar
     * @param {Array} agents - Array of agents
     */
    updateStatusCounters(agents) {
        const now = new Date().getTime()
        let onlineCount = 0
        let offlineCount = 0
        
        agents.forEach(agent => {
            const lastHeartbeat = new Date(agent.lastHeartbeat + 'Z').getTime()
            const secondsSinceHeartbeat = (now - lastHeartbeat) / 1000
            
            if (secondsSinceHeartbeat < 600) { // Less than 10 minutes
                onlineCount++
            } else {
                offlineCount++
            }
        })
        
        const onlineCountEl = document.getElementById('agentsOnlineCount')
        const offlineCountEl = document.getElementById('agentsOfflineCount')
        
        if (onlineCountEl) {
            onlineCountEl.textContent = `${onlineCount} Online`
        }
        
        if (offlineCountEl) {
            offlineCountEl.textContent = `${offlineCount} Offline`
        }
    },

    /**
     * Initialize agent UI module
     */
    init() {
        console.log('🤖 Agent UI module initialized')
        
        // Auto-refresh agents every 30 seconds
        setInterval(() => {
            const agentsList = document.getElementById('agentsList')
            if (agentsList && agentsList.offsetParent !== null) {
                this.renderAgentsDashboard()
            }
        }, 30000)
        // Pre-bind if modal already present
        this.attachDeploymentCopyHandlers()
    }
}

// Export for use globally
if (typeof window !== 'undefined') {
    window.AgentUI = AgentUI
}
