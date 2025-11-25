using Microsoft.AspNetCore.Mvc;
using OrbisHub.CoreService.Data;
using OrbisHub.CoreService.DTOs;
using OrbisHub.CoreService.Models;
using System.Text.Json;

namespace OrbisHub.CoreService.Controllers;

[ApiController]
[Route("api/jobs")]
public class JobsController : ControllerBase
{
    private readonly IJobRepository _jobRepository;
    private readonly IAgentRepository _agentRepository;
    private readonly ILogger<JobsController> _logger;

    public JobsController(
        IJobRepository jobRepository,
        IAgentRepository agentRepository,
        ILogger<JobsController> logger)
    {
        _jobRepository = jobRepository;
        _agentRepository = agentRepository;
        _logger = logger;
    }

    /// <summary>
    /// Create a new job (called by desktop client)
    /// POST /api/jobs/create
    /// </summary>
    [HttpPost("create")]
    public async Task<ActionResult<CreateJobResponse>> Create([FromBody] CreateJobRequest request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            // Verify agent exists
            var agent = await _agentRepository.GetByIdAsync(request.AgentId);
            if (agent == null)
            {
                return NotFound(new { error = "Agent not found" });
            }

            // Create job
            var job = new AgentJob
            {
                AgentId = request.AgentId,
                Type = request.Type,
                PayloadJson = request.Payload.RootElement.GetRawText()
            };

            var jobId = await _jobRepository.CreateAsync(job);

            _logger.LogInformation("Created job {JobId} for agent {AgentId}", jobId, request.AgentId);

            return Ok(new CreateJobResponse
            {
                JobId = jobId,
                Status = "created"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating job for agent {AgentId}", request.AgentId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get job status (called by desktop client)
    /// GET /api/jobs/{jobId}
    /// </summary>
    [HttpGet("{jobId}")]
    public async Task<ActionResult<JobStatusResponse>> GetStatus(Guid jobId)
    {
        try
        {
            var job = await _jobRepository.GetByIdAsync(jobId);

            if (job == null)
            {
                return NotFound(new { error = "Job not found" });
            }

            // Parse result JSON to extract output and error message
            string? output = null;
            string? errorMessage = job.ErrorMessage;

            if (!string.IsNullOrEmpty(job.ResultJson))
            {
                try
                {
                    using var jsonDoc = JsonDocument.Parse(job.ResultJson);
                    if (jsonDoc.RootElement.TryGetProperty("output", out var outputProp))
                    {
                        output = outputProp.GetString();
                    }
                    if (jsonDoc.RootElement.TryGetProperty("errorMessage", out var errorProp))
                    {
                        errorMessage = errorProp.GetString();
                    }
                }
                catch
                {
                    // If JSON parsing fails, use raw result
                    output = job.ResultJson;
                }
            }

            return Ok(new JobStatusResponse
            {
                JobId = job.JobId,
                AgentId = job.AgentId,
                Status = job.Status,
                Output = output,
                ErrorMessage = errorMessage
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving job status for {JobId}", jobId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
