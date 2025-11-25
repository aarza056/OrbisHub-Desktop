using Microsoft.AspNetCore.Mvc;
using OrbisHub.CoreService.Data;
using OrbisHub.CoreService.DTOs;
using OrbisHub.CoreService.Models;
using System.Text.Json;

namespace OrbisHub.CoreService.Controllers;

[ApiController]
[Route("api/agents/{agentId}/jobs")]
public class AgentJobsController : ControllerBase
{
    private readonly IJobRepository _jobRepository;
    private readonly IAgentRepository _agentRepository;
    private readonly ILogger<AgentJobsController> _logger;

    public AgentJobsController(
        IJobRepository jobRepository,
        IAgentRepository agentRepository,
        ILogger<AgentJobsController> logger)
    {
        _jobRepository = jobRepository;
        _agentRepository = agentRepository;
        _logger = logger;
    }

    /// <summary>
    /// Get next pending job for agent
    /// GET /api/agents/{agentId}/jobs/next
    /// </summary>
    [HttpGet("next")]
    public async Task<ActionResult<JobResponse>> GetNext(Guid agentId)
    {
        try
        {
            // Verify agent exists
            var agent = await _agentRepository.GetByIdAsync(agentId);
            if (agent == null)
            {
                return NotFound(new { error = "Agent not found" });
            }

            var job = await _jobRepository.GetNextPendingJobAsync(agentId);

            if (job == null)
            {
                return Ok(new { job = (JobResponse?)null });
            }

            // Mark job as started
            await _jobRepository.MarkAsStartedAsync(job.JobId);

            _logger.LogInformation("Agent {AgentId} retrieved job {JobId}", agentId, job.JobId);

            return Ok(new JobResponse
            {
                JobId = job.JobId,
                Type = job.Type,
                Payload = job.PayloadJson != null ? JsonDocument.Parse(job.PayloadJson) : null
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving next job for agent {AgentId}", agentId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Report job result
    /// POST /api/agents/{agentId}/jobs/{jobId}/result
    /// </summary>
    [HttpPost("{jobId}/result")]
    public async Task<ActionResult<JobResultResponse>> ReportResult(
        Guid agentId,
        Guid jobId,
        [FromBody] JobResultRequest request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            // Verify job exists and belongs to this agent
            var job = await _jobRepository.GetByIdAsync(jobId);
            if (job == null)
            {
                return NotFound(new { error = "Job not found" });
            }

            if (job.AgentId != agentId)
            {
                return BadRequest(new { error = "Job does not belong to this agent" });
            }

            // Create result JSON
            var resultJson = JsonSerializer.Serialize(new
            {
                output = request.Output,
                errorMessage = request.ErrorMessage
            });

            // Update job status
            await _jobRepository.UpdateStatusAsync(
                jobId,
                request.Status,
                resultJson,
                request.ErrorMessage);

            _logger.LogInformation("Job {JobId} completed with status {Status}", jobId, request.Status);

            return Ok(new JobResultResponse { Received = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reporting result for job {JobId}", jobId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get all jobs for an agent
    /// GET /api/agents/{agentId}/jobs
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<AgentJob>>> GetJobs(Guid agentId, [FromQuery] int limit = 100)
    {
        try
        {
            var jobs = await _jobRepository.GetJobsByAgentAsync(agentId, limit);
            return Ok(jobs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving jobs for agent {AgentId}", agentId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
