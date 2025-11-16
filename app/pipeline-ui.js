// Pipeline UI Handlers
// Manages pipeline CRUD, rendering, and execution UI

// Load pipeline-manager.js
const pipelineManagerScript = document.createElement('script');
pipelineManagerScript.src = 'pipeline-manager.js';
document.head.appendChild(pipelineManagerScript);

// Custom confirm dialog
function customConfirm(message, title = 'Confirm Action') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const messageEl = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        titleEl.textContent = title;
        messageEl.textContent = message;

        const handleOk = () => {
            cleanup();
            modal.close();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            modal.close();
            resolve(false);
        };

        const cleanup = () => {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('close', handleCancel);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('close', handleCancel, { once: true });

        modal.showModal();
    });
}

// ==================== RENDER PIPELINES ====================
async function renderPipelines() {
    const container = document.getElementById('pipelinesList');
    if (!container) return;

    console.log('🔨 Loading pipelines from database...');

    try {
        const response = await fetch(`${API_BASE_URL}/api/load-data`);
        const result = await response.json();

        const pipelines = result.data?.pipelines || [];
        console.log('📋 Loaded pipelines:', pipelines.length);

        if (pipelines.length === 0) {
            container.innerHTML = '<p class="muted" style="text-align:center; padding:40px;">No pipelines configured yet. Create your first pipeline to get started.</p>';
            return;
        }

        container.innerHTML = '';
        pipelines.forEach(pipeline => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '20px';

            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:16px; margin-bottom:12px;">
                    <div style="flex:1;">
                        <strong style="font-size:16px;">${pipeline.name}</strong>
                        ${pipeline.description ? `<p style="margin:4px 0 0 0; color:var(--muted); font-size:13px;">${pipeline.description}</p>` : ''}
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn" data-pipeline-run="${pipeline.id}" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:white; border:none;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            Run
                        </button>
                        <button class="btn btn-ghost" data-pipeline-edit="${pipeline.id}">Edit</button>
                        <button class="btn btn-ghost" data-pipeline-delete="${pipeline.id}" style="color:#ef4444;">Delete</button>
                    </div>
                </div>
            `;

            // Event listeners
            const runBtn = card.querySelector(`[data-pipeline-run="${pipeline.id}"]`);
            if (runBtn) runBtn.addEventListener('click', () => runPipeline(pipeline));

            const editBtn = card.querySelector(`[data-pipeline-edit="${pipeline.id}"]`);
            if (editBtn) editBtn.addEventListener('click', () => openEditPipeline(pipeline));

            const deleteBtn = card.querySelector(`[data-pipeline-delete="${pipeline.id}"]`);
            if (deleteBtn) deleteBtn.addEventListener('click', () => deletePipeline(pipeline));

            container.appendChild(card);
        });

    } catch (error) {
        console.error('❌ Failed to load pipelines:', error);
        container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:40px;">Failed to load pipelines</p>';
    }
}

// ==================== RENDER PIPELINE RUNS ====================
async function renderPipelineRuns() {
    const container = document.getElementById('pipelineRunsList');
    if (!container) return;

    try {
        const runsResult = await window.electronAPI.dbQuery(
            `SELECT pr.*, p.name as pipeline_name 
             FROM PipelineRuns pr 
             LEFT JOIN Pipelines p ON pr.pipeline_id = p.id 
             ORDER BY pr.created_at DESC`,
            []
        );

        if (!runsResult.success || !runsResult.data || runsResult.data.length === 0) {
            container.innerHTML = '<p class="muted" style="text-align:center; padding:40px;">No pipeline runs yet</p>';
            return;
        }

        const runs = runsResult.data;
        container.innerHTML = '';

        runs.forEach(run => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '16px';

            const statusColor = run.status === 'succeeded' ? '#10b981' : run.status === 'failed' ? '#ef4444' : run.status === 'running' ? '#6366f1' : '#6b7280';
            const statusIcon = run.status === 'succeeded' ? '✓' : run.status === 'failed' ? '✗' : run.status === 'running' ? '⟳' : '○';

            const duration = run.started_at && run.ended_at ? 
                `${Math.round((new Date(run.ended_at) - new Date(run.started_at)) / 1000)}s` : 
                run.started_at ? 'Running...' : 'Not started';

            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="width:32px; height:32px; border-radius:50%; background:${statusColor}20; display:flex; align-items:center; justify-content:center; font-size:16px; color:${statusColor};">
                        ${statusIcon}
                    </div>
                    <div style="flex:1;">
                        <strong>${run.pipeline_name || 'Unknown Pipeline'}</strong>
                        <div style="display:flex; gap:16px; margin-top:4px; font-size:12px; color:var(--muted);">
                            <span>Run #${run.id.substr(0, 8)}</span>
                            <span>${new Date(run.created_at).toLocaleString()}</span>
                            <span>${duration}</span>
                            <span>by ${run.triggered_by}</span>
                        </div>
                    </div>
                    <button class="btn btn-ghost" data-view-run="${run.id}">View Details</button>
                </div>
            `;

            const viewBtn = card.querySelector(`[data-view-run="${run.id}"]`);
            if (viewBtn) viewBtn.addEventListener('click', () => viewRunDetails(run));

            container.appendChild(card);
        });

    } catch (error) {
        console.error('❌ Failed to load pipeline runs:', error);
    }
}

// ==================== RUN PIPELINE ====================
async function runPipeline(pipeline) {
    console.log('🚀 Running pipeline:', pipeline.name);

    const currentUser = window.currentUser || { name: 'System' };
    
    try {
        const runId = await window.pipelineManager.queueRun(
            pipeline.id,
            currentUser.name,
            'manual',
            {}
        );

        await logAudit('run', 'pipeline', pipeline.name, { runId });
        
        // Switch to runs tab
        document.querySelector('[data-tab="pipeline-runs"]').click();
        renderPipelineRuns();

        alert(`Pipeline "${pipeline.name}" started! Run ID: ${runId.substr(0, 8)}`);

    } catch (error) {
        console.error('❌ Failed to run pipeline:', error);
        alert('Failed to start pipeline: ' + error.message);
    }
}

// ==================== CREATE PIPELINE ====================
let createPipelineListenersInitialized = false;

function initCreatePipelineListeners() {
    if (createPipelineListenersInitialized) {
        console.log('⚠️ Create pipeline listeners already initialized, skipping');
        return;
    }

    const addPipelineBtn = document.getElementById('addPipelineBtn');
    const pipelineModal = document.getElementById('pipelineModal');
    const savePipelineBtn = document.getElementById('savePipelineBtn');

    console.log('🔧 Initializing create pipeline listeners', {
        addPipelineBtn: !!addPipelineBtn,
        pipelineModal: !!pipelineModal,
        savePipelineBtn: !!savePipelineBtn
    });

    if (addPipelineBtn && pipelineModal) {
        addPipelineBtn.addEventListener('click', () => {
            console.log('➕ Add Pipeline button clicked');
            document.getElementById('pipelineName').value = '';
            document.getElementById('pipelineDescription').value = '';
            pipelineModal.showModal();
        });
    }

    if (savePipelineBtn) {
        savePipelineBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const name = document.getElementById('pipelineName').value.trim();
            const description = document.getElementById('pipelineDescription').value.trim();

            console.log('💾 Saving pipeline:', { name, description });

            if (!name) {
                alert('Please enter a pipeline name');
                return;
            }

            const currentUser = window.currentUser || { name: 'System' };
            const id = uid();

            try {
                await window.electronAPI.dbExecute(
                    `INSERT INTO Pipelines (id, name, description, enabled, created_by, created_at, updated_at) 
                     VALUES (@param0, @param1, @param2, @param3, @param4, GETDATE(), GETDATE())`,
                    [
                        { value: id },
                        { value: name },
                        { value: description },
                        { value: true },
                        { value: currentUser.name }
                    ]
                );

                console.log('✅ Pipeline created successfully');
                await logAudit('create', 'pipeline', name, { description });
                pipelineModal.close();
                await renderPipelines();

                // Open edit modal to add stages
                const pipeline = { id, name, description };
                setTimeout(() => openEditPipeline(pipeline), 300);

            } catch (error) {
                console.error('❌ Failed to create pipeline:', error);
                alert('Failed to create pipeline: ' + error.message);
            }
        });
    }
    
    createPipelineListenersInitialized = true;
}

// ==================== EDIT PIPELINE ====================
let editPipelineListenersInitialized = false;

function initEditPipelineListeners() {
    if (editPipelineListenersInitialized) {
        console.log('⚠️ Edit pipeline listeners already initialized, skipping');
        return;
    }

    const saveEditPipelineBtn = document.getElementById('saveEditPipelineBtn');

    if (saveEditPipelineBtn) {
        saveEditPipelineBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const id = document.getElementById('editPipelineId').value;
            const name = document.getElementById('editPipelineName').value.trim();
            const description = document.getElementById('editPipelineDescription').value.trim();

            if (!name) {
                alert('Please enter a pipeline name');
                return;
            }

            try {
                await window.electronAPI.dbExecute(
                    `UPDATE Pipelines SET name = @param0, description = @param1, updated_at = GETDATE() 
                     WHERE id = @param2`,
                    [
                        { value: name },
                        { value: description },
                        { value: id }
                    ]
                );

                console.log('✅ Pipeline updated successfully');
                await logAudit('update', 'pipeline', name, { description });
                
                const editModal = document.getElementById('editPipelineModal');
                editModal.close();
                await renderPipelines();

            } catch (error) {
                console.error('❌ Failed to update pipeline:', error);
                alert('Failed to update pipeline: ' + error.message);
            }
        });
    }

    editPipelineListenersInitialized = true;
}

async function openEditPipeline(pipeline) {
    const modal = document.getElementById('editPipelineModal');
    document.getElementById('editPipelineId').value = pipeline.id;
    document.getElementById('editPipelineName').value = pipeline.name;
    document.getElementById('editPipelineDescription').value = pipeline.description || '';

    // Load stages
    await renderPipelineStages(pipeline.id);

    modal.showModal();
}

async function renderPipelineStages(pipelineId) {
    const container = document.getElementById('pipelineStagesList');
    if (!container) return;

    try {
        const stagesResult = await window.electronAPI.dbQuery(
            `SELECT * FROM PipelineStages WHERE pipeline_id = @param0 ORDER BY [order]`,
            [{ value: pipelineId }]
        );

        if (!stagesResult.success || !stagesResult.data || stagesResult.data.length === 0) {
            container.innerHTML = '<p class="muted">No stages yet. Click "Add Stage" to create one.</p>';
            return;
        }

        container.innerHTML = '';
        const stages = stagesResult.data;

        for (const stage of stages) {
            const stageCard = document.createElement('div');
            stageCard.className = 'card';
            stageCard.style.cssText = 'margin-bottom:0; padding:16px; background:var(--surface); border:1px solid var(--border);';

            // Load steps for this stage
            const stepsResult = await window.electronAPI.dbQuery(
                `SELECT * FROM PipelineSteps WHERE stage_id = @param0 ORDER BY [order]`,
                [{ value: stage.id }]
            );

            const steps = stepsResult.success && stepsResult.data ? stepsResult.data : [];

            stageCard.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:${steps.length > 0 ? '16px' : '0'};">
                    <div style="flex:1;">
                        <strong style="font-size:15px;">${stage.name}</strong>
                        <span style="color:var(--muted); font-size:13px; margin-left:12px;">${steps.length} step${steps.length !== 1 ? 's' : ''}</span>
                    </div>
                    <button class="btn btn-ghost btn-sm" data-add-step="${stage.id}">+ Add Step</button>
                    <button class="btn btn-ghost btn-sm" data-delete-stage="${stage.id}" style="color:#ef4444;">Delete Stage</button>
                </div>
                ${steps.length > 0 ? `
                <div class="stack" style="gap:8px;">
                    ${steps.map(step => `
                        <div style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--panel); border-radius:6px; border:1px solid var(--border);">
                            <div style="width:4px; height:24px; background:var(--primary); border-radius:2px;"></div>
                            <span style="flex:1; font-size:14px;">${step.name}</span>
                            <span style="font-size:12px; color:var(--muted); padding:4px 8px; background:var(--surface); border-radius:4px;">${step.timeout_ms/1000}s</span>
                            <button class="btn btn-ghost btn-sm" data-delete-step="${step.id}" style="color:#ef4444;">Delete</button>
                        </div>
                    `).join('')}
                </div>
                ` : '<div style="color:var(--muted); font-size:13px; text-align:center; padding:16px; background:var(--panel); border-radius:6px; border:1px dashed var(--border);">No steps yet. Click "Add Step" to create one.</div>'}
            `;

            // Event listeners
            const addStepBtn = stageCard.querySelector(`[data-add-step="${stage.id}"]`);
            if (addStepBtn) addStepBtn.addEventListener('click', () => openAddStepModal(stage));

            const deleteStageBtn = stageCard.querySelector(`[data-delete-stage="${stage.id}"]`);
            if (deleteStageBtn) deleteStageBtn.addEventListener('click', async () => {
                const confirmed = await customConfirm(
                    `Delete stage "${stage.name}" and all its steps?`,
                    'Delete Stage'
                );
                if (confirmed) {
                    await window.electronAPI.dbExecute(
                        `DELETE FROM PipelineStages WHERE id = @param0`,
                        [{ value: stage.id }]
                    );
                    await renderPipelineStages(pipelineId);
                    // Keep edit modal open after refresh
                    const editModal = document.getElementById('editPipelineModal');
                    if (editModal && !editModal.open) {
                        editModal.showModal();
                    }
                }
            });

            steps.forEach(step => {
                const deleteStepBtn = stageCard.querySelector(`[data-delete-step="${step.id}"]`);
                if (deleteStepBtn) deleteStepBtn.addEventListener('click', async () => {
                    const confirmed = await customConfirm(
                        `Delete step "${step.name}"?`,
                        'Delete Step'
                    );
                    if (confirmed) {
                        await window.electronAPI.dbExecute(
                            `DELETE FROM PipelineSteps WHERE id = @param0`,
                            [{ value: step.id }]
                        );
                        await renderPipelineStages(pipelineId);
                        // Keep edit modal open after refresh
                        const editModal = document.getElementById('editPipelineModal');
                        if (editModal && !editModal.open) {
                            editModal.showModal();
                        }
                    }
                });
            });

            container.appendChild(stageCard);
        }

    } catch (error) {
        console.error('❌ Failed to load stages:', error);
    }
}

// Add Stage - Initialize event listeners
let stageListenersInitialized = false;

function initStageEventListeners() {
    if (stageListenersInitialized) {
        console.log('⚠️ Stage listeners already initialized, skipping');
        return;
    }

    const addStageBtn = document.getElementById('addStageBtn');
    const saveStageBtn = document.getElementById('saveStageBtn');
    const addStageModal = document.getElementById('addStageModal');

    console.log('🔧 Initializing stage event listeners', {
        addStageBtn: !!addStageBtn,
        saveStageBtn: !!saveStageBtn,
        addStageModal: !!addStageModal
    });

    if (addStageBtn) {
        addStageBtn.addEventListener('click', () => {
            console.log('➕ Add Stage button clicked');
            document.getElementById('stageName').value = '';
            addStageModal.showModal();
        });
    } else {
        console.warn('⚠️ addStageBtn not found');
    }

    if (saveStageBtn) {
        saveStageBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const name = document.getElementById('stageName').value.trim();
            const pipelineId = document.getElementById('editPipelineId').value;

            console.log('💾 Saving stage:', { name, pipelineId });

            if (!name) {
                alert('Please enter a stage name');
                return;
            }

            if (!pipelineId) {
                alert('Pipeline ID not found');
                console.error('❌ No pipelineId in editPipelineId field');
                return;
            }

            try {
                // Get max order
                const orderResult = await window.electronAPI.dbQuery(
                    `SELECT ISNULL(MAX([order]), 0) as max_order FROM PipelineStages WHERE pipeline_id = @param0`,
                    [{ value: pipelineId }]
                );
                const order = (orderResult.data && orderResult.data[0] ? orderResult.data[0].max_order : 0) + 1;

                console.log('📊 Max order:', order);

                const stageId = uid();
                console.log('🆔 Generated stage ID:', stageId);

                await window.electronAPI.dbExecute(
                    `INSERT INTO PipelineStages (id, pipeline_id, name, [order], created_at) 
                     VALUES (@param0, @param1, @param2, @param3, GETDATE())`,
                    [
                        { value: stageId },
                        { value: pipelineId },
                        { value: name },
                        { value: order }
                    ]
                );

                console.log('✅ Stage saved successfully');
                addStageModal.close();
                await renderPipelineStages(pipelineId);

            } catch (error) {
                console.error('❌ Failed to create stage:', error);
                alert('Failed to create stage: ' + error.message);
            }
        });
    } else {
        console.warn('⚠️ saveStageBtn not found');
    }

    stageListenersInitialized = true;
}

// Call initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStageEventListeners);
} else {
    initStageEventListeners();
}

// ==================== HELPER FUNCTIONS ====================
async function populatePipelineServerDropdown() {
    try {
        console.log('🔄 [PIPELINE] Fetching servers for pipeline step dropdown...');
        const result = await window.electronAPI.dbQuery('SELECT id, name, host FROM Servers ORDER BY name', []);
        console.log('📊 [PIPELINE] Server query result:', result);
        
        const servers = result.success && result.data ? result.data : [];
        console.log(`📋 [PIPELINE] Found ${servers.length} servers:`, servers);
        
        const dropdown = document.getElementById('stepServerId');
        console.log('🎯 [PIPELINE] stepServerId element:', dropdown);
        
        if (!dropdown) {
            console.error('❌ [PIPELINE] stepServerId dropdown not found in DOM');
            return;
        }

        // Keep the default option and add servers
        dropdown.innerHTML = '<option value="">-- Select Server --</option>';
        servers.forEach(server => {
            const option = document.createElement('option');
            option.value = server.id;
            option.textContent = `${server.name} (${server.host})`;
            dropdown.appendChild(option);
            console.log('✅ [PIPELINE] Added server option:', server.name, server.host);
        });

        console.log(`✅ [PIPELINE] Populated server dropdown with ${servers.length} servers`);
    } catch (error) {
        console.error('❌ [PIPELINE] Failed to populate server dropdown:', error);
    }
}

async function populateScriptDropdowns() {
    try {
        const result = await window.electronAPI.dbQuery('SELECT id, name FROM Scripts ORDER BY name', []);
        const scripts = result.success && result.data ? result.data : [];
        
        const dropdown = document.getElementById('stepScriptId');
        if (!dropdown) return;

        // Keep the default option and add scripts
        dropdown.innerHTML = '<option value="">-- Select Script --</option>';
        scripts.forEach(script => {
            const option = document.createElement('option');
            option.value = script.id;
            option.textContent = script.name;
            dropdown.appendChild(option);
        });

        console.log(`✅ Populated script dropdown with ${scripts.length} scripts`);
    } catch (error) {
        console.error('❌ Failed to populate script dropdown:', error);
    }
}

// ==================== ADD STEP ====================
async function openAddStepModal(stage) {
    console.log('➕ Opening add step modal for stage:', stage);
    const modal = document.getElementById('addStepModal');
    
    // Show modal first to ensure DOM elements are visible
    modal.showModal();
    
    // Then populate form fields
    document.getElementById('stepStageId').value = stage.id;
    document.getElementById('stepName').value = '';
    document.getElementById('stepInlineScript').value = '';
    document.getElementById('stepTimeout').value = 300;
    document.getElementById('stepContinueOnError').checked = false;

    // Populate servers and scripts after modal is shown
    await populatePipelineServerDropdown();
    await populateScriptDropdowns();
}

let stepListenersInitialized = false;

function initStepEventListeners() {
    if (stepListenersInitialized) {
        console.log('⚠️ Step listeners already initialized, skipping');
        return;
    }

    console.log('🔧 Initializing step event listeners');
    
    const stepScriptSource = document.getElementById('stepScriptSource');
    if (stepScriptSource) {
        stepScriptSource.addEventListener('change', () => {
            const inline = document.getElementById('inlineScriptContainer');
            const library = document.getElementById('libraryScriptContainer');
            if (stepScriptSource.value === 'inline') {
                inline.style.display = 'block';
                library.style.display = 'none';
            } else {
                inline.style.display = 'none';
                library.style.display = 'block';
            }
        });
    }

    const saveStepBtn = document.getElementById('saveStepBtn');
    if (saveStepBtn) {
        saveStepBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const stageId = document.getElementById('stepStageId').value;
            const name = document.getElementById('stepName').value.trim();
            const source = document.getElementById('stepScriptSource').value;
            const inlineScript = document.getElementById('stepInlineScript').value;
            const scriptId = document.getElementById('stepScriptId').value;
            const serverId = document.getElementById('stepServerId').value;
            const timeout = parseInt(document.getElementById('stepTimeout').value) * 1000;
            const continueOnError = document.getElementById('stepContinueOnError').checked;

            console.log('💾 Saving step:', { stageId, name, source, serverId, timeout });

            if (!name || !serverId) {
                alert('Please fill in all required fields');
                return;
            }

            if (source === 'inline' && !inlineScript) {
                alert('Please enter a script');
                return;
            }

            if (source === 'library' && !scriptId) {
                alert('Please select a script');
                return;
            }

            try {
                const orderResult = await window.electronAPI.dbQuery(
                    `SELECT ISNULL(MAX([order]), 0) as max_order FROM PipelineSteps WHERE stage_id = @param0`,
                    [{ value: stageId }]
                );
                const order = (orderResult.data && orderResult.data[0] ? orderResult.data[0].max_order : 0) + 1;

                const stepId = uid();
                console.log('🆔 Generated step ID:', stepId);

                await window.electronAPI.dbExecute(
                    `INSERT INTO PipelineSteps (id, stage_id, name, [order], script_id, inline_script, server_id, timeout_ms, continue_on_error, created_at) 
                     VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8, GETDATE())`,
                    [
                        { value: stepId },
                        { value: stageId },
                        { value: name },
                        { value: order },
                        { value: source === 'library' ? scriptId : null },
                        { value: source === 'inline' ? inlineScript : null },
                        { value: serverId },
                        { value: timeout },
                        { value: continueOnError }
                    ]
                );

                console.log('✅ Step saved successfully');
                const addStepModal = document.getElementById('addStepModal');
                addStepModal.close();
                
                const pipelineId = document.getElementById('editPipelineId').value;
                await renderPipelineStages(pipelineId);

            } catch (error) {
                console.error('❌ Failed to create step:', error);
                alert('Failed to create step: ' + error.message);
            }
        });
    } else {
        console.warn('⚠️ saveStepBtn not found');
    }

    stepListenersInitialized = true;
}

// Delete Pipeline
async function deletePipeline(pipeline) {
    const confirmed = await customConfirm(
        `Delete pipeline "${pipeline.name}"? This will also delete all stages, steps, and run history.`,
        'Delete Pipeline'
    );
    if (!confirmed) {
        return;
    }

    try {
        await window.electronAPI.dbExecute(
            `DELETE FROM Pipelines WHERE id = @param0`,
            [{ value: pipeline.id }]
        );

        await logAudit('delete', 'pipeline', pipeline.name, {});
        renderPipelines();

    } catch (error) {
        console.error('❌ Failed to delete pipeline:', error);
        alert('Failed to delete pipeline: ' + error.message);
    }
}

// View Run Details
async function viewRunDetails(run) {
    const modal = document.getElementById('runDetailsModal');
    const title = document.getElementById('runDetailsTitle');
    const content = document.getElementById('runDetailsContent');

    title.textContent = `Pipeline Run #${run.id.substr(0, 8)}`;

    try {
        const stepsResult = await window.electronAPI.dbQuery(
            `SELECT * FROM RunSteps WHERE run_id = @param0 ORDER BY started_at`,
            [{ value: run.id }]
        );

        const steps = stepsResult.success && stepsResult.data ? stepsResult.data : [];
        console.log('📊 Run steps data:', steps);

        // Build a combined full log (stdout/stderr) with simple headers per step
        const fullLog = steps.map((s, idx) => {
            const header = `#${idx + 1} [${(s.status || '').toUpperCase()}] ${s.stage_name || ''} > ${s.step_name || ''}`.trim();
            const tStart = s.started_at ? new Date(s.started_at).toLocaleString() : '';
            const tEnd = s.ended_at ? new Date(s.ended_at).toLocaleString() : '';
            const meta = `Started: ${tStart}${tEnd ? ` | Ended: ${tEnd}` : ''}${Number.isInteger(s.exit_code) ? ` | ExitCode: ${s.exit_code}` : ''}`;
            const body = [s.output || '', s.error_message || ''].filter(Boolean).join('\n');
            return `${header}\n${meta}\n${body}`.trim();
        }).join('\n\n---\n\n');

        // Handlers for copy/download full log
        const buildActionsHtml = `
            <div class="row end" style="gap:8px;">
                <button id="copyFullLogBtn" class="btn btn-ghost btn-sm">Copy Full Log</button>
                <button id="downloadFullLogBtn" class="btn btn-sm">Download Full Log</button>
            </div>
        `;

        content.innerHTML = `
            <div class="card">
                <h3>Run Information</h3>
                <div style="display:grid; grid-template-columns:150px 1fr; gap:12px; font-size:14px;">
                    <span style="color:var(--muted);">Status:</span><span style="font-weight:600;">${run.status}</span>
                    <span style="color:var(--muted);">Started:</span><span>${run.started_at ? new Date(run.started_at).toLocaleString() : 'Not started'}</span>
                    <span style="color:var(--muted);">Ended:</span><span>${run.ended_at ? new Date(run.ended_at).toLocaleString() : 'Running'}</span>
                    <span style="color:var(--muted);">Triggered by:</span><span>${run.triggered_by}</span>
                </div>
            </div>
            ${run.status === 'failed' ? `
            <div class="card">
                <h3>Failure Summary</h3>
                <div style="font-size:13px; color:var(--muted); margin-bottom:8px;">Showing all step outputs and errors below.</div>
                ${buildActionsHtml}
                <pre id="fullLogText" style="margin-top:12px; font-size:12px; font-family:monospace; white-space:pre-wrap; word-wrap:break-word; max-height:320px; overflow:auto; background:var(--surface); padding:12px; border-radius:6px;">${fullLog || 'No logs captured for this run.'}</pre>
            </div>
            ` : ''}
            <div class="card">
                <h3>Steps</h3>
                ${steps.map(step => {
                    const statusColor = step.status === 'succeeded' ? '#10b981' : step.status === 'failed' ? '#ef4444' : step.status === 'running' ? '#6366f1' : '#6b7280';
                    const hasOutput = step.output && String(step.output).trim();
                    const hasError = step.error_message && step.error_message.trim();
                    return `
                        <div style="padding:16px; background:var(--surface); border-radius:6px; margin-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:12px; margin-bottom:${hasOutput || hasError ? '12px' : '0'};">
                                <div style="width:24px; height:24px; border-radius:50%; background:${statusColor}20; display:flex; align-items:center; justify-content:center; font-size:12px; color:${statusColor};">
                                    ${step.status === 'succeeded' ? '✓' : step.status === 'failed' ? '✗' : '○'}
                                </div>
                                <div style="flex:1;">
                                    <strong>${step.step_name}</strong>
                                    <div style="font-size:12px; color:var(--muted);">${step.stage_name}</div>
                                </div>
                                <span style="font-size:12px; color:var(--muted);">
                                    ${step.started_at && step.ended_at ? `${Math.round((new Date(step.ended_at) - new Date(step.started_at)) / 1000)}s` : ''}
                                </span>
                            </div>
                            ${hasError ? `
                                <div style="margin-top:8px; padding:12px; background:#ef444420; border-radius:4px; border-left:3px solid #ef4444;">
                                    <div style="font-size:11px; font-weight:600; color:#ef4444; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">Error</div>
                                    <pre style="margin:0; font-size:12px; color:#ef4444; font-family:monospace; white-space:pre-wrap; word-wrap:break-word;">${step.error_message}</pre>
                                </div>
                            ` : ''}
                            ${hasOutput ? `
                                <div style="margin-top:8px; padding:12px; background:var(--bg); border-radius:4px; border-left:3px solid ${statusColor};">
                                    <div style="font-size:11px; font-weight:600; color:var(--muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">Output</div>
                                    <pre style="margin:0; font-size:12px; color:var(--text); font-family:monospace; white-space:pre-wrap; word-wrap:break-word; max-height:300px; overflow-y:auto;">${step.output}</pre>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        modal.showModal();

        // Wire copy/download actions if failure card rendered
        const copyBtn = document.getElementById('copyFullLogBtn');
        const dlBtn = document.getElementById('downloadFullLogBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(fullLog);
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => (copyBtn.textContent = 'Copy Full Log'), 1500);
                } catch (e) {
                    console.error('Copy failed:', e);
                }
            });
        }
        if (dlBtn) {
            dlBtn.addEventListener('click', () => {
                const blob = new Blob([fullLog], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pipeline_run_${run.id.substring(0,8)}.log`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            });
        }

    } catch (error) {
        console.error('❌ Failed to load run details:', error);
    }
}

// ==================== INITIALIZATION ====================
function initTabNavigation() {
    console.log('🔧 Initializing tab navigation');
    document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            console.log('📑 Switching to tab:', target);
            
            // Update tab buttons
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(target)?.classList.add('active');

            // Load data for the tab
            if (target === 'pipelines-list') renderPipelines();
            if (target === 'pipeline-runs') renderPipelineRuns();
        });
    });
}

function initRefreshButton() {
    console.log('🔧 Initializing refresh button');
    const refreshPipelinesBtn = document.getElementById('refreshPipelinesBtn');
    if (refreshPipelinesBtn) {
        refreshPipelinesBtn.addEventListener('click', () => {
            console.log('🔄 Refresh button clicked');
            const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
            if (activeTab === 'pipelines-list') renderPipelines();
            if (activeTab === 'pipeline-runs') renderPipelineRuns();
        });
    }
}

// Master initialization function
function initPipelineUI() {
    console.log('🚀 Initializing Pipeline UI');
    initCreatePipelineListeners();
    initEditPipelineListeners();
    initStageEventListeners();
    initStepEventListeners();
    initTabNavigation();
    initRefreshButton();
    console.log('✅ Pipeline UI initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPipelineUI);
} else {
    initPipelineUI();
}

console.log('✅ Pipeline UI handlers loaded');
