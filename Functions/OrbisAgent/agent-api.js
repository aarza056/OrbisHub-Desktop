// OrbisAgent API Module
// Handles all agent-related backend communication with SQL Server
// Author: OrbisHub Team
// Created: 2025-11-25

/**
 * Agent API Module
 * Provides database operations for agent management, jobs, and metrics
 */

const AgentAPI = {
    /**
     * Register or update an agent in the database
     * @param {Object} agentData - Agent information
     * @returns {Promise<Object>} - Success status
     */
    async registerAgent(agentData) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const result = await window.electronAPI.dbExecute(
                `MERGE Agents AS target
                USING (SELECT @param0 AS id) AS source
                ON target.id = source.id
                WHEN MATCHED THEN
                    UPDATE SET 
                        lastHeartbeat = @param5, 
                        status = @param4, 
                        ipAddress = @param3,
                        os = @param2,
                        version = @param6,
                        metadata = @param7
                WHEN NOT MATCHED THEN
                    INSERT (id, machineName, os, ipAddress, status, lastHeartbeat, version, metadata)
                    VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7);`,
                [
                    { value: agentData.id },
                    { value: agentData.machineName },
                    { value: agentData.os },
                    { value: agentData.ipAddress },
                    { value: agentData.status || 'online' },
                    { value: new Date().toISOString() },
                    { value: agentData.version || '1.0.0' },
                    { value: JSON.stringify(agentData.metadata || {}) }
                ]
            )

            return { success: true, data: result }
        } catch (error) {
            console.error('Failed to register agent:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Get all agents from database
     * @returns {Promise<Array>} - List of agents
     */
    async getAllAgents() {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const result = await window.electronAPI.dbQuery(
                'SELECT * FROM Agents ORDER BY lastHeartbeat DESC',
                []
            )

            if (result.success && result.data) {
                return result.data.map(agent => ({
                    ...agent,
                    metadata: agent.metadata ? JSON.parse(agent.metadata) : {}
                }))
            }

            return []
        } catch (error) {
            console.error('Failed to get agents:', error)
            return []
        }
    },

    /**
     * Get agent by ID
     * @param {string} agentId - Agent ID
     * @returns {Promise<Object|null>} - Agent data or null
     */
    async getAgentById(agentId) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const result = await window.electronAPI.dbQuery(
                'SELECT * FROM Agents WHERE id = @param0',
                [{ value: agentId }]
            )

            if (result.success && result.data && result.data.length > 0) {
                const agent = result.data[0]
                agent.metadata = agent.metadata ? JSON.parse(agent.metadata) : {}
                return agent
            }

            return null
        } catch (error) {
            console.error('Failed to get agent:', error)
            return null
        }
    },

    /**
     * Update agent status
     * @param {string} agentId - Agent ID
     * @param {string} status - New status (online, offline, error)
     * @returns {Promise<Object>} - Success status
     */
    async updateAgentStatus(agentId, status) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            await window.electronAPI.dbExecute(
                'UPDATE Agents SET status = @param0, lastHeartbeat = @param1 WHERE id = @param2',
                [
                    { value: status },
                    { value: new Date().toISOString() },
                    { value: agentId }
                ]
            )

            return { success: true }
        } catch (error) {
            console.error('Failed to update agent status:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Delete an agent
     * @param {string} agentId - Agent ID
     * @returns {Promise<Object>} - Success status
     */
    async deleteAgent(agentId) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            // Delete related data first
            await window.electronAPI.dbExecute(
                'DELETE FROM AgentMetrics WHERE agentId = @param0',
                [{ value: agentId }]
            )

            await window.electronAPI.dbExecute(
                'DELETE FROM AgentJobs WHERE agentId = @param0',
                [{ value: agentId }]
            )

            await window.electronAPI.dbExecute(
                'DELETE FROM Agents WHERE id = @param0',
                [{ value: agentId }]
            )

            return { success: true }
        } catch (error) {
            console.error('Failed to delete agent:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Create a new job for an agent
     * @param {Object} jobData - Job information
     * @returns {Promise<Object>} - Created job
     */
    async createJob(jobData) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const jobId = uid('job')
            
            await window.electronAPI.dbExecute(
                `INSERT INTO AgentJobs (id, agentId, type, script, status, createdBy, createdAt)
                VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6)`,
                [
                    { value: jobId },
                    { value: jobData.agentId },
                    { value: jobData.type },
                    { value: jobData.script },
                    { value: 'pending' },
                    { value: jobData.createdBy || 'System' },
                    { value: new Date().toISOString() }
                ]
            )

            return { success: true, jobId }
        } catch (error) {
            console.error('Failed to create job:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Get pending jobs for an agent
     * @param {string} agentId - Agent ID
     * @returns {Promise<Array>} - List of pending jobs
     */
    async getPendingJobs(agentId) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const result = await window.electronAPI.dbQuery(
                `SELECT * FROM AgentJobs 
                WHERE agentId = @param0 AND status = 'pending'
                ORDER BY createdAt`,
                [{ value: agentId }]
            )

            return result.success && result.data ? result.data : []
        } catch (error) {
            console.error('Failed to get pending jobs:', error)
            return []
        }
    },

    /**
     * Get all jobs for an agent
     * @param {string} agentId - Agent ID
     * @param {number} limit - Maximum number of jobs to return
     * @returns {Promise<Array>} - List of jobs
     */
    async getAgentJobs(agentId, limit = 50) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const result = await window.electronAPI.dbQuery(
                `SELECT TOP (@param1) * FROM AgentJobs 
                WHERE agentId = @param0
                ORDER BY createdAt DESC`,
                [
                    { value: agentId },
                    { value: limit }
                ]
            )

            return result.success && result.data ? result.data : []
        } catch (error) {
            console.error('Failed to get agent jobs:', error)
            return []
        }
    },

    /**
     * Update job status
     * @param {string} jobId - Job ID
     * @param {string} status - New status
     * @param {string} result - Job result/output
     * @returns {Promise<Object>} - Success status
     */
    async updateJobStatus(jobId, status, result = null) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const now = new Date().toISOString()
            
            if (status === 'running') {
                await window.electronAPI.dbExecute(
                    'UPDATE AgentJobs SET status = @param0, startedAt = @param1 WHERE id = @param2',
                    [
                        { value: status },
                        { value: now },
                        { value: jobId }
                    ]
                )
            } else if (status === 'completed' || status === 'failed') {
                await window.electronAPI.dbExecute(
                    'UPDATE AgentJobs SET status = @param0, result = @param1, completedAt = @param2 WHERE id = @param3',
                    [
                        { value: status },
                        { value: result },
                        { value: now },
                        { value: jobId }
                    ]
                )
            }

            return { success: true }
        } catch (error) {
            console.error('Failed to update job status:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Save agent metrics
     * @param {Object} metricsData - Metrics data
     * @returns {Promise<Object>} - Success status
     */
    async saveMetrics(metricsData) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const metricId = uid('metric')
            
            await window.electronAPI.dbExecute(
                `INSERT INTO AgentMetrics (id, agentId, timestamp, cpuPercent, memoryPercent, diskPercent, networkIn, networkOut, customMetrics)
                VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8)`,
                [
                    { value: metricId },
                    { value: metricsData.agentId },
                    { value: new Date().toISOString() },
                    { value: metricsData.cpuPercent || 0 },
                    { value: metricsData.memoryPercent || 0 },
                    { value: metricsData.diskPercent || 0 },
                    { value: metricsData.networkIn || 0 },
                    { value: metricsData.networkOut || 0 },
                    { value: JSON.stringify(metricsData.customMetrics || {}) }
                ]
            )

            return { success: true }
        } catch (error) {
            console.error('Failed to save metrics:', error)
            return { success: false, error: error.message }
        }
    },

    /**
     * Get recent metrics for an agent
     * @param {string} agentId - Agent ID
     * @param {number} limit - Number of metrics to return
     * @returns {Promise<Array>} - List of metrics
     */
    async getAgentMetrics(agentId, limit = 100) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available')
        }

        try {
            const result = await window.electronAPI.dbQuery(
                `SELECT TOP (@param1) * FROM AgentMetrics 
                WHERE agentId = @param0
                ORDER BY timestamp DESC`,
                [
                    { value: agentId },
                    { value: limit }
                ]
            )

            if (result.success && result.data) {
                return result.data.map(metric => ({
                    ...metric,
                    customMetrics: metric.customMetrics ? JSON.parse(metric.customMetrics) : {}
                }))
            }

            return []
        } catch (error) {
            console.error('Failed to get agent metrics:', error)
            return []
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AgentAPI = AgentAPI
}
