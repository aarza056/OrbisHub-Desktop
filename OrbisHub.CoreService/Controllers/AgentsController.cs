using Microsoft.AspNetCore.Mvc;
using OrbisHub.CoreService.Data;
using OrbisHub.CoreService.DTOs;
using OrbisHub.CoreService.Models;

namespace OrbisHub.CoreService.Controllers;

[ApiController]
[Route("api/agents")]
public class AgentsController : ControllerBase
{
    private readonly IAgentRepository _agentRepository;
    private readonly ILogger<AgentsController> _logger;

    public AgentsController(IAgentRepository agentRepository, ILogger<AgentsController> logger)
    {
        _agentRepository = agentRepository;
        _logger = logger;
    }

    /// <summary>
    /// Register a new agent
    /// POST /api/agents/register
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<AgentRegistrationResponse>> Register([FromBody] AgentRegistrationRequest request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            // Use client-provided AgentId or generate new one
            var agentId = request.AgentId ?? Guid.NewGuid();
            
            // Check if this specific agent already exists
            var existingAgent = await _agentRepository.GetByIdAsync(agentId);
            
            if (existingAgent != null)
            {
                // Update existing agent's information and heartbeat
                existingAgent.IPAddress = request.IpAddresses != null ? string.Join(", ", request.IpAddresses) : null;
                existingAgent.OSVersion = request.OsVersion;
                existingAgent.AgentVersion = request.AgentVersion;
                existingAgent.LastSeenUtc = DateTime.UtcNow;
                
                await _agentRepository.UpdateAsync(existingAgent);

                _logger.LogInformation("Agent re-registered: {MachineName} with ID {AgentId}", 
                    request.MachineName, agentId);

                return Ok(new AgentRegistrationResponse
                {
                    AgentId = agentId,
                    Status = "re-registered"
                });
            }

            // Create new agent with specified ID
            var agent = new Agent
            {
                AgentId = agentId,
                MachineName = request.MachineName,
                IPAddress = request.IpAddresses != null ? string.Join(", ", request.IpAddresses) : null,
                OSVersion = request.OsVersion,
                AgentVersion = request.AgentVersion
            };

            await _agentRepository.CreateAsync(agent);

            _logger.LogInformation("New agent registered: {MachineName} with ID {AgentId}", 
                request.MachineName, agentId);

            return Ok(new AgentRegistrationResponse
            {
                AgentId = agentId,
                Status = "registered"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error registering agent {MachineName}", request.MachineName);
            return StatusCode(500, new { error = "Internal server error during registration" });
        }
    }

    /// <summary>
    /// Agent heartbeat
    /// POST /api/agents/{agentId}/heartbeat
    /// </summary>
    [HttpPost("{agentId}/heartbeat")]
    public async Task<ActionResult<HeartbeatResponse>> Heartbeat(
        Guid agentId,
        [FromBody] HeartbeatRequest request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var success = await _agentRepository.UpdateHeartbeatAsync(
                agentId, 
                request.AgentVersion, 
                request.CurrentUser,
                request.Metadata);

            if (!success)
            {
                _logger.LogWarning("Heartbeat failed for unknown agent {AgentId}", agentId);
                return NotFound(new { error = "Agent not found" });
            }

            return Ok(new HeartbeatResponse { Status = "ok" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing heartbeat for agent {AgentId}", agentId);
            return StatusCode(500, new { error = "Internal server error during heartbeat" });
        }
    }

    /// <summary>
    /// Get all agents (for administrative purposes)
    /// GET /api/agents
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<Agent>>> GetAll()
    {
        try
        {
            var agents = await _agentRepository.GetAllAsync();
            return Ok(agents);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving all agents");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get specific agent by ID
    /// GET /api/agents/{agentId}
    /// </summary>
    [HttpGet("{agentId}")]
    public async Task<ActionResult<Agent>> GetById(Guid agentId)
    {
        try
        {
            var agent = await _agentRepository.GetByIdAsync(agentId);
            
            if (agent == null)
            {
                return NotFound(new { error = "Agent not found" });
            }

            return Ok(agent);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving agent {AgentId}", agentId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Delete an agent
    /// DELETE /api/agents/{agentId}
    /// </summary>
    [HttpDelete("{agentId}")]
    public async Task<ActionResult> Delete(Guid agentId)
    {
        try
        {
            var agent = await _agentRepository.GetByIdAsync(agentId);
            if (agent == null)
            {
                return NotFound(new { error = "Agent not found" });
            }

            var success = await _agentRepository.DeleteAsync(agentId);
            
            if (!success)
            {
                return StatusCode(500, new { error = "Failed to delete agent" });
            }

            _logger.LogInformation("Agent {AgentId} ({MachineName}) deleted", agentId, agent.MachineName);
            return Ok(new { message = "Agent deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting agent {AgentId}", agentId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
