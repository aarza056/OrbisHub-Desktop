using Microsoft.AspNetCore.Mvc;

namespace OrbisHub.CoreService.Controllers;

[ApiController]
[Route("api/agent")]
public class AgentDownloadController : ControllerBase
{
    private readonly ILogger<AgentDownloadController> _logger;
    private readonly IWebHostEnvironment _environment;

    public AgentDownloadController(
        ILogger<AgentDownloadController> logger,
        IWebHostEnvironment environment)
    {
        _logger = logger;
        _environment = environment;
    }

    /// <summary>
    /// Download the latest agent script
    /// GET /api/agent/download
    /// </summary>
    [HttpGet("download")]
    public IActionResult DownloadAgent()
    {
        try
        {
            // Path to the agent script in the project
            var agentScriptPath = Path.Combine(
                _environment.ContentRootPath,
                "..",
                "OrbisAgent",
                "OrbisAgent.ps1"
            );

            if (!System.IO.File.Exists(agentScriptPath))
            {
                _logger.LogError("Agent script not found at: {Path}", agentScriptPath);
                return NotFound(new { error = "Agent script not found" });
            }

            var scriptContent = System.IO.File.ReadAllBytes(agentScriptPath);
            
            _logger.LogInformation("Agent script downloaded");
            
            return File(scriptContent, "text/plain", "OrbisAgent.ps1");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading agent script");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get agent version information
    /// GET /api/agent/version
    /// </summary>
    [HttpGet("version")]
    public IActionResult GetVersion()
    {
        try
        {
            return Ok(new
            {
                version = "1.0.0",
                lastUpdated = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting agent version");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
