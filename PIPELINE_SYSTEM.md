# CI/CD Pipeline System - Implementation Guide

## Overview
Complete CI/CD pipeline system similar to Azure DevOps/Jenkins, with multi-stage pipelines, step execution, run history, and variables.

## Architecture

### Database Schema (8 New Tables)
Located in `main.js` lines 730-878:

1. **Pipelines** - Pipeline definitions
   - Columns: id, name, description, enabled, created_by, created_at, updated_at

2. **PipelineStages** - Stages within pipelines (sequential execution)
   - Columns: id, pipeline_id, name, order, created_at
   - Foreign key: pipeline_id → Pipelines(id) CASCADE DELETE

3. **PipelineSteps** - Steps within stages
   - Columns: id, stage_id, name, order, script_id, inline_script, server_id, timeout_ms, continue_on_error, created_at
   - Foreign keys: stage_id → PipelineStages(id), script_id → Scripts(id), server_id → Servers(id)
   - All CASCADE DELETE

4. **PipelineRuns** - Execution history
   - Columns: id, pipeline_id, status, started_at, ended_at, triggered_by, trigger_source, created_at
   - Foreign key: pipeline_id → Pipelines(id) CASCADE DELETE

5. **RunSteps** - Individual step execution results
   - Columns: id, run_id, stage_id, step_id, stage_name, step_name, status, started_at, ended_at, error_message
   - Foreign key: run_id → PipelineRuns(id) CASCADE DELETE

6. **Artifacts** - Build artifacts storage (future)
   - Columns: id, run_id, name, path, size_bytes, created_at

7. **Variables** - Pipeline variables and secrets
   - Columns: id, name, value, scope, is_secret, pipeline_id, created_at, updated_at
   - Scope: 'global', 'pipeline', 'secret'

8. **PipelineSchedules** - CRON scheduling (future)
   - Columns: id, pipeline_id, cron_expression, enabled, last_run, next_run, created_at

### Execution Engine
Located in `app/pipeline-manager.js`:

**Class: PipelineManager**
- Singleton pattern via `window.pipelineManager`
- Queue-based execution system
- Methods:
  - `queueRun(pipelineId, triggeredBy, triggerSource, variables)` - Adds run to queue
  - `processQueue()` - Sequential execution of queued runs
  - `executeRun(runId)` - Loads pipeline, executes all stages/steps
  - `executeStep(step, variables)` - Executes single step remotely
  - `processVariables(text, variables)` - Replace {{VAR}} placeholders

**Variable Processing:**
- Built-in variables: `{{SERVER_NAME}}`, `{{SERVER_IP}}`, `{{SERVER_HOST}}`, `{{BUILD_NAME}}`, `{{USER}}`
- Custom variables from Variables table
- Regex-based replacement

**Status Tracking:**
- Run status: queued → running → succeeded/failed/cancelled
- Step status: pending → running → succeeded/failed/skipped
- Logs stored in RunSteps table

### UI Components
Located in `app/pipeline-ui.js` and `app/index.html`:

**Navigation:**
- Pipelines button in sidebar (after Builds)
- Icon: Grid/columns SVG

**Views (3 Tabs):**
1. **Pipelines List** - All pipelines with Run/Edit/Delete buttons
2. **Run History** - Timeline of executions with status/duration
3. **Variables** - Global and pipeline-scoped variables (not yet implemented)

**Modals (5):**
1. **pipelineModal** - Create pipeline (name + description)
2. **editPipelineModal** - Edit pipeline + manage stages
3. **addStageModal** - Add stage to pipeline
4. **addStepModal** - Add step to stage (inline or library script)
5. **runDetailsModal** - View run execution details

**Key Functions:**
- `renderPipelines()` - Load and display all pipelines
- `renderPipelineRuns()` - Load and display run history
- `runPipeline(pipeline)` - Queue pipeline execution
- `openEditPipeline(pipeline)` - Load stages/steps for editing
- `renderPipelineStages(pipelineId)` - Display stages with steps
- `viewRunDetails(run)` - Show execution timeline and logs

### Integration Points

**Backend API (app/app.js):**
- Line 149: Added pipelines query to `/api/load-data`
- Line 268: Added pipelines mapping in response
- Returns: id, name, description, enabled, created_by, created_at, updated_at

**Frontend Integration (app/app-main.js):**
- Line 5438: Added `case 'pipelines'` in `showView()` function
- Line 8369: Added Pipelines to command palette
- Line 394: Added `populateScriptDropdowns()` helper function

**Script Loading (app/index.html):**
- Line 3819: Import order: `app.js` → `pipeline-manager.js` → `pipeline-ui.js` → `app-main.js`

## Usage Guide

### Creating a Pipeline

1. Navigate to **Pipelines** view
2. Click **Create Pipeline** button
3. Enter name and description
4. Click **Save** (modal auto-opens for editing)

### Adding Stages and Steps

1. In Edit Pipeline modal, click **Add Stage**
2. Enter stage name (e.g., "Build", "Test", "Deploy")
3. Click **Add Step** for the stage
4. Configure step:
   - **Name**: Descriptive step name
   - **Script Source**: Inline or Library
   - **Script**: PowerShell commands or select from library
   - **Server**: Target server for execution
   - **Timeout**: Maximum execution time (seconds)
   - **Continue on Error**: Don't stop pipeline if this step fails

### Running a Pipeline

1. Click **Run** button on pipeline card
2. Pipeline queued and executes sequentially:
   - Stage 1 → Step 1 → Step 2 → ...
   - Stage 2 → Step 1 → Step 2 → ...
   - Stages run in order, steps within stages run in order
3. View progress in **Run History** tab
4. Click **View Details** to see step-by-step logs

### Variable Usage

In scripts, use `{{VARIABLE_NAME}}` placeholders:

```powershell
Write-Host "Deploying to {{SERVER_NAME}}"
Write-Host "IP: {{SERVER_IP}}"
Write-Host "User: {{USER}}"
```

Built-in variables:
- `{{SERVER_NAME}}` - Target server display name
- `{{SERVER_IP}}` - Target server IP address
- `{{SERVER_HOST}}` - Target server hostname
- `{{BUILD_NAME}}` - Current pipeline name
- `{{USER}}` - User who triggered the run

## Remote Execution

All pipeline steps execute via PowerShell remoting:
- Uses `Invoke-Command` with credential management
- Automatically wraps scripts in remote session
- Captures output and errors
- 2-minute timeout per step (configurable)
- Uses existing Servers and Credentials tables

## Testing Checklist

✅ **Basic Functionality:**
- [ ] Create pipeline
- [ ] Add stage to pipeline
- [ ] Add step to stage (inline script)
- [ ] Add step to stage (library script)
- [ ] Run pipeline
- [ ] View run history
- [ ] View run details with logs
- [ ] Edit pipeline (modify stages/steps)
- [ ] Delete step
- [ ] Delete stage
- [ ] Delete pipeline

✅ **Advanced Features:**
- [ ] Multiple stages execute sequentially
- [ ] Steps execute in order within stage
- [ ] Variables replaced in scripts
- [ ] Remote execution on target server
- [ ] Timeout handling
- [ ] Continue-on-error flag works
- [ ] Failed steps show error messages
- [ ] Run status updates correctly

## Future Enhancements

### Phase 2: Variables & Secrets (Next)
- [ ] Implement Variables tab UI
- [ ] CRUD operations for variables
- [ ] DPAPI encryption for secrets
- [ ] Variable precedence (global < pipeline < run)
- [ ] Secret masking in logs

### Phase 3: Scheduling & Triggers
- [ ] CRON scheduling UI
- [ ] node-cron integration
- [ ] GitHub webhook receiver
- [ ] Repository polling

### Phase 4: Logs & Artifacts
- [ ] Real-time log streaming (WebSocket)
- [ ] Artifact upload/download
- [ ] Log search and filtering
- [ ] Artifact retention policy

### Phase 5: RBAC & Security
- [ ] Pipeline permissions table
- [ ] Role-based access control
- [ ] Approval gates
- [ ] Audit trail for pipeline changes

### Phases 6-9: Polish
- [ ] Sample pipeline templates
- [ ] In-app documentation modal
- [ ] Pipeline visualization (DAG view)
- [ ] Performance optimization
- [ ] Comprehensive testing

## Technical Notes

**Database Migrations:**
- Tables auto-create on next app start via `main.js` migrations
- All foreign keys use CASCADE DELETE
- Indexes on frequently-queried columns

**Error Handling:**
- Try-catch blocks in all async operations
- User-friendly error messages
- Console logging for debugging
- Database rollback on failure

**Performance:**
- Sequential execution (one run at a time)
- Database-first architecture (no file-based cache)
- Efficient queries with proper indexes
- Pagination for large result sets

**Security:**
- Credentials encrypted in database
- PowerShell remoting uses secure channels
- Audit logging for all operations
- Variable secrets support (future)

## File Summary

| File | Lines | Purpose |
|------|-------|---------|
| `main.js` | 730-878 | Database schema migrations |
| `main.js` | 362-435 | PowerShell remote execution IPC |
| `app/pipeline-manager.js` | 300+ | Pipeline execution engine |
| `app/pipeline-ui.js` | 568 | UI handlers and rendering |
| `app/index.html` | 310-327 | Navigation button |
| `app/index.html` | 680-738 | Pipelines view with tabs |
| `app/index.html` | 3040-3185 | 5 pipeline modals |
| `app/app.js` | 149, 268 | API endpoint integration |
| `app/app-main.js` | 5438 | View routing |
| `app/app-main.js` | 8369 | Command palette |
| `app/app-main.js` | 394 | Script dropdown helper |

## Support

For issues or questions:
1. Check browser console for errors
2. Verify database migrations ran successfully
3. Check SQL Server connection
4. Review audit logs for operation history
5. Enable debug logging in pipeline-manager.js

---

**Status:** Phase 1 Complete ✅  
**Next:** Test system, then implement Variables & Secrets (Phase 2)
