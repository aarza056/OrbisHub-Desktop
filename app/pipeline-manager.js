// Pipeline Manager - Core CI/CD execution engine
// Handles pipeline runs, step execution, logging, and artifacts

class PipelineManager {
    constructor() {
        this.activeRuns = new Map(); // runId => { status, steps, logs }
        this.runQueue = [];
        this.isProcessing = false;
    }

    // Queue a pipeline run
    async queueRun(pipelineId, triggeredBy, triggerType = 'manual', variables = {}) {
        const runId = this.generateId();
        const run = {
            id: runId,
            pipelineId,
            status: 'queued',
            triggeredBy,
            triggerType,
            variables: JSON.stringify(variables),
            createdAt: new Date().toISOString()
        };

        // Save to database
        await window.electronAPI.dbExecute(
            `INSERT INTO PipelineRuns (id, pipeline_id, status, triggered_by, trigger_type, variables, created_at) 
             VALUES (@param0, @param1, @param2, @param3, @param4, @param5, GETDATE())`,
            [
                { value: runId },
                { value: pipelineId },
                { value: 'queued' },
                { value: triggeredBy },
                { value: triggerType },
                { value: JSON.stringify(variables) }
            ]
        );

        this.runQueue.push(run);
        this.activeRuns.set(runId, { status: 'queued', steps: [], logs: [] });

        // Start processing if not already running
        if (!this.isProcessing) {
            this.processQueue();
        }

        return runId;
    }

    // Process the run queue
    async processQueue() {
        if (this.isProcessing || this.runQueue.length === 0) return;

        this.isProcessing = true;

        while (this.runQueue.length > 0) {
            const run = this.runQueue.shift();
            await this.executeRun(run);
        }

        this.isProcessing = false;
    }

    // Execute a pipeline run
    async executeRun(run) {
        console.log(`🚀 Starting pipeline run ${run.id}`);
        const runData = this.activeRuns.get(run.id);
        runData.status = 'running';

        // Update run status to running
        await window.electronAPI.dbExecute(
            `UPDATE PipelineRuns SET status = @param1, started_at = GETDATE() WHERE id = @param0`,
            [{ value: run.id }, { value: 'running' }]
        );

        try {
            // Load pipeline stages and steps
            const stagesResult = await window.electronAPI.dbQuery(
                `SELECT * FROM PipelineStages WHERE pipeline_id = @param0 ORDER BY [order]`,
                [{ value: run.pipelineId }]
            );

            if (!stagesResult.success || !stagesResult.data) {
                throw new Error('Failed to load pipeline stages');
            }

            const stages = stagesResult.data;
            let overallSuccess = true;

            // Execute each stage sequentially
            for (const stage of stages) {
                console.log(`📂 Executing stage: ${stage.name}`);
                
                const stepsResult = await window.electronAPI.dbQuery(
                    `SELECT * FROM PipelineSteps WHERE stage_id = @param0 ORDER BY [order]`,
                    [{ value: stage.id }]
                );

                if (!stepsResult.success || !stepsResult.data) {
                    throw new Error(`Failed to load steps for stage ${stage.name}`);
                }

                const steps = stepsResult.data;

                // Execute each step in the stage
                for (const step of steps) {
                    const stepSuccess = await this.executeStep(run.id, step, stage.name, run.variables);
                    
                    if (!stepSuccess) {
                        overallSuccess = false;
                        if (!step.continue_on_error) {
                            console.log(`❌ Step failed and continue_on_error is false. Stopping pipeline.`);
                            throw new Error(`Step ${step.name} failed`);
                        }
                    }
                }
            }

            // Mark run as succeeded
            runData.status = 'succeeded';
            await window.electronAPI.dbExecute(
                `UPDATE PipelineRuns SET status = @param1, ended_at = GETDATE() WHERE id = @param0`,
                [{ value: run.id }, { value: overallSuccess ? 'succeeded' : 'failed' }]
            );

            console.log(`✅ Pipeline run ${run.id} completed successfully`);

        } catch (error) {
            console.error(`❌ Pipeline run ${run.id} failed:`, error);
            runData.status = 'failed';
            await window.electronAPI.dbExecute(
                `UPDATE PipelineRuns SET status = @param1, ended_at = GETDATE() WHERE id = @param0`,
                [{ value: run.id }, { value: 'failed' }]
            );
        }
    }

    // Execute a single step
    async executeStep(runId, step, stageName, variablesJson) {
        const stepRunId = this.generateId();
        const runData = this.activeRuns.get(runId);

        console.log(`  ⚙️ Executing step: ${step.name}`);

        // Create run step record
        await window.electronAPI.dbExecute(
            `INSERT INTO RunSteps (id, run_id, step_id, stage_name, step_name, status, created_at) 
             VALUES (@param0, @param1, @param2, @param3, @param4, @param5, GETDATE())`,
            [
                { value: stepRunId },
                { value: runId },
                { value: step.id },
                { value: stageName },
                { value: step.name },
                { value: 'running' }
            ]
        );

        // Update status to running
        await window.electronAPI.dbExecute(
            `UPDATE RunSteps SET status = @param1, started_at = GETDATE() WHERE id = @param0`,
            [{ value: stepRunId }, { value: 'running' }]
        );

        try {
            // Get script content
            let scriptContent = step.inline_script;
            if (step.script_id) {
                const scriptResult = await window.electronAPI.dbQuery(
                    `SELECT content FROM Scripts WHERE id = @param0`,
                    [{ value: step.script_id }]
                );
                if (scriptResult.success && scriptResult.data && scriptResult.data.length > 0) {
                    scriptContent = scriptResult.data[0].content;
                }
            }

            if (!scriptContent) {
                throw new Error('No script content found for step');
            }

            // Load server details
            if (!step.server_id) {
                throw new Error('No server configured for step');
            }

            const serverResult = await window.electronAPI.dbQuery(
                `SELECT * FROM Servers WHERE id = @param0`,
                [{ value: step.server_id }]
            );

            if (!serverResult.success || !serverResult.data || serverResult.data.length === 0) {
                throw new Error('Server not found');
            }

            const server = serverResult.data[0];

            // Load credentials
            if (!server.credential_id) {
                throw new Error('No credentials configured for server');
            }

            const credResult = await window.electronAPI.dbQuery(
                `SELECT * FROM Credentials WHERE id = @param0`,
                [{ value: server.credential_id }]
            );

            if (!credResult.success || !credResult.data || credResult.data.length === 0) {
                throw new Error('Credentials not found');
            }

            const credential = credResult.data[0];

            // Process variables in script
            let variables = {};
            try {
                variables = JSON.parse(variablesJson || '{}');
            } catch (e) {}

            const processedScript = this.processVariables(scriptContent, {
                ...variables,
                PIPELINE_RUN_ID: runId,
                STEP_NAME: step.name,
                STAGE_NAME: stageName,
                SERVER_NAME: server.name,
                SERVER_IP: server.host
            });

            // Execute script on remote server
            const targetHost = server.host;
            const executionResult = await window.electronAPI.executePowerShellRemote(
                targetHost,
                processedScript,
                credential.username,
                credential.password,
                credential.domain || null
            );

            // Save log
            const logPath = `logs/run_${runId}/step_${stepRunId}.log`;
            // In a real implementation, save executionResult.output to file system

            // Update step status
            const status = executionResult.success ? 'succeeded' : 'failed';
            await window.electronAPI.dbExecute(
                `UPDATE RunSteps SET status = @param1, ended_at = GETDATE(), exit_code = @param2, output = @param3, log_path = @param4, error_message = @param5 WHERE id = @param0`,
                [
                    { value: stepRunId },
                    { value: status },
                    { value: executionResult.exitCode || 0 },
                    { value: executionResult.output || '' },
                    { value: logPath },
                    { value: executionResult.error || null }
                ]
            );

            runData.steps.push({
                id: stepRunId,
                name: step.name,
                status,
                output: executionResult.output
            });

            console.log(`  ${executionResult.success ? '✅' : '❌'} Step ${step.name} ${status}`);

            return executionResult.success;

        } catch (error) {
            console.error(`  ❌ Step ${step.name} failed:`, error);
            
            // Update step status to failed
            await window.electronAPI.dbExecute(
                `UPDATE RunSteps SET status = @param1, ended_at = GETDATE(), error_message = @param2 WHERE id = @param0`,
                [
                    { value: stepRunId },
                    { value: 'failed' },
                    { value: error.message }
                ]
            );

            return false;
        }
    }

    // Process variables in script (replace {{VAR}} placeholders)
    processVariables(script, variables) {
        let processed = script;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            processed = processed.replace(regex, value);
        }
        return processed;
    }

    // Stop a running pipeline
    async stopRun(runId) {
        const runData = this.activeRuns.get(runId);
        if (runData) {
            runData.status = 'cancelled';
            await window.electronAPI.dbExecute(
                `UPDATE PipelineRuns SET status = @param1, ended_at = GETDATE() WHERE id = @param0`,
                [{ value: runId }, { value: 'cancelled' }]
            );
            console.log(`🛑 Pipeline run ${runId} cancelled`);
        }
    }

    // Get run status
    getRunStatus(runId) {
        return this.activeRuns.get(runId);
    }

    // Generate unique ID
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Export singleton instance
if (typeof window !== 'undefined') {
    window.pipelineManager = new PipelineManager();
}
