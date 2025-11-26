// OrbisAgent API Module
// Handles all agent-related backend communication with Core Service
// Author: OrbisHub Team
// Updated: 2025-11-25 - Migrated to Core Service API

/**
 * Agent API Module
 * Provides API operations for agent management via OrbisHub Core Service
 */

const AgentAPI = {
    // Core Service URL - can be configured
    coreServiceUrl: 'http://127.0.0.1:5000',

    /**
     * Set Core Service URL
     * @param {string} url - Core Service URL
     */
    setCoreServiceUrl(url) {
        this.coreServiceUrl = url;
    },

    /**
     * Helper method for API calls
     */
    async apiCall(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);

        try {
            // Use Electron's IPC for HTTP requests if available, otherwise use fetch
            if (window.electronAPI && window.electronAPI.httpRequest) {
                const response = await window.electronAPI.httpRequest(
                    `${this.coreServiceUrl}${endpoint}`,
                    options
                );
                
                if (!response.ok) {
                    const errorMsg = response.data?.error || response.data?.message || `HTTP ${response.status}`;
                    throw new Error(errorMsg);
                }
                return response.data;
            } else {
                // Fallback to fetch for non-Electron environments
                const response = await fetch(`${this.coreServiceUrl}${endpoint}`, options);
                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(error.error || `HTTP ${response.status}`);
                }
                return await response.json();
            }
        } catch (error) {
            console.error(`API call failed: ${endpoint}`, error);
            throw error;
        }
    },

    /**
     * Register or update an agent (NOT USED - agents register themselves)
     * This is kept for compatibility but agents self-register via Core Service
     * @param {Object} agentData - Agent information
     * @returns {Promise<Object>} - Success status
     */
    async registerAgent(agentData) {
        // Agents register themselves via OrbisAgent.ps1
        // This method is kept for API compatibility
        return { success: false, error: 'Agents self-register via Core Service' };
    },

    /**
     * Get all agents from Core Service
     * @returns {Promise<Array>} - List of agents
     */
    async getAllAgents() {
        try {
            const response = await this.apiCall('/api/agents');
            // Transform API response to match UI expectations
            const agents = Array.isArray(response) ? response : (response.value || []);
            return agents.map(agent => ({
                id: agent.agentId,
                machineName: agent.machineName,
                ipAddress: agent.ipAddress,
                os: agent.osVersion,
                version: agent.agentVersion,
                status: agent.status,
                metadata: agent.metadata ? JSON.parse(agent.metadata) : {},
                lastHeartbeat: agent.lastSeenUtc,
                createdAt: agent.createdUtc
            }));
        } catch (error) {
            console.error('Failed to get agents:', error);
            return [];
        }
    },

    /**
     * Get agent by ID from Core Service
     * @param {string} agentId - Agent ID
     * @returns {Promise<Object|null>} - Agent data or null
     */
    async getAgentById(agentId) {
        try {
            const agents = await this.getAllAgents();
            return agents.find(a => a.id === agentId) || null;
        } catch (error) {
            console.error('Failed to get agent:', error);
            return null;
        }
    },

    /**
     * Update agent status
     * NOTE: Status updates happen automatically via heartbeats
     * This method is kept for compatibility
     * @param {string} agentId - Agent ID
     * @param {string} status - New status (online, offline, error)
     * @returns {Promise<Object>} - Success status
     */
    async updateAgentStatus(agentId, status) {
        // Status is managed by Core Service via heartbeats
        console.log(`Agent status managed by Core Service heartbeats`);
        return { success: true };
    },

    /**
     * Delete an agent
     * @param {string} agentId - Agent ID
     * @returns {Promise<Object>} - Success status
     */
    async deleteAgent(agentId) {
        try {
            await this.apiCall(`/api/agents/${agentId}`, 'DELETE');
            return { success: true };
        } catch (error) {
            console.error('Failed to delete agent:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Create a new job for an agent via Core Service
     * @param {Object} jobData - Job information { agentId, type, script, createdBy }
     * @returns {Promise<Object>} - Created job
     */
    async createJob(jobData) {
        try {
            // Transform UI format to API format
            const apiPayload = {
                agentId: jobData.agentId,
                type: jobData.type || 'PowerShell',
                payload: {
                    script: jobData.script
                }
            };
            
            // For RunScript type, add shell parameter (default to powershell)
            if (jobData.type === 'RunScript') {
                apiPayload.payload.shell = jobData.shell || 'powershell';
            }
            
            const result = await this.apiCall('/api/jobs/create', 'POST', apiPayload);
            return { success: true, jobId: result.jobId, status: result.status };
        } catch (error) {
            console.error('Failed to create job:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get pending jobs for an agent (NOT USED)
     * Agents poll Core Service directly for jobs
     * @param {string} agentId - Agent ID
     * @returns {Promise<Array>} - List of pending jobs
     */
    async getPendingJobs(agentId) {
        console.log('Agents poll Core Service directly. Use getAgentJobs() instead.');
        return [];
    },

    /**
     * Get all jobs for an agent from Core Service
     * @param {string} agentId - Agent ID
     * @param {number} limit - Maximum number of jobs to return
     * @returns {Promise<Array>} - List of jobs
     */
    async getAgentJobs(agentId, limit = 50) {
        try {
            return await this.apiCall(`/api/agents/${agentId}/jobs`);
        } catch (error) {
            console.error('Failed to get agent jobs:', error);
            return [];
        }
    },

    /**
     * Get job status by ID
     * @param {string} jobId - Job ID
     * @returns {Promise<Object|null>} - Job status or null
     */
    async getJobStatus(jobId) {
        try {
            return await this.apiCall(`/api/jobs/${jobId}`);
        } catch (error) {
            console.error('Failed to get job status:', error);
            return null;
        }
    },

    /**
     * Update job status (NOT USED)
     * Agents report job results directly to Core Service
     * @param {string} jobId - Job ID
     * @param {string} status - New status
     * @param {string} result - Job result/output
     * @returns {Promise<Object>} - Success status
     */
    async updateJobStatus(jobId, status, result = null) {
        console.log('Agents report job results directly to Core Service');
        return { success: false, error: 'Job status managed by Core Service' };
    },

    /**
     * Save agent metrics (NOT IMPLEMENTED YET)
     * Future feature for agent monitoring
     * @param {Object} metricsData - Metrics data
     * @returns {Promise<Object>} - Success status
     */
    async saveMetrics(metricsData) {
        console.log('Metrics feature not yet implemented in Core Service');
        return { success: false, error: 'Metrics not yet implemented' };
    },

    /**
     * Get recent metrics for an agent (NOT IMPLEMENTED YET)
     * Future feature for agent monitoring
     * @param {string} agentId - Agent ID
     * @param {number} limit - Number of metrics to return
     * @returns {Promise<Array>} - List of metrics
     */
    async getAgentMetrics(agentId, limit = 100) {
        console.log('Metrics feature not yet implemented in Core Service');
        return [];
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AgentAPI = AgentAPI
}
