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
        return DownloadAgentFile("OrbisAgent.ps1");
    }

    /// <summary>
    /// Download the agent installer script
    /// GET /api/agent/download/installer
    /// </summary>
    [HttpGet("download/installer")]
    public IActionResult DownloadInstaller()
    {
        return DownloadAgentFile("Install-OrbisAgent.ps1");
    }

    /// <summary>
    /// Download the agent bootstrap script (one-liner installer)
    /// GET /api/agent/download/bootstrap
    /// </summary>
    [HttpGet("download/bootstrap")]
    public IActionResult DownloadBootstrap()
    {
        return DownloadAgentFile("OrbisAgent-Bootstrap.ps1");
    }

    /// <summary>
    /// Download the uninstaller script
    /// GET /api/agent/download/uninstaller
    /// </summary>
    [HttpGet("download/uninstaller")]
    public IActionResult DownloadUninstaller()
    {
        return DownloadAgentFile("Uninstall-OrbisAgent.ps1");
    }

    /// <summary>
    /// Get installation instructions and commands
    /// GET /api/agent/install-guide
    /// </summary>
    [HttpGet("install-guide")]
    public IActionResult GetInstallGuide()
    {
        try
        {
            var serverUrl = $"{Request.Scheme}://{Request.Host}";
            
            var guide = new
            {
                quickInstall = new
                {
                    title = "Quick Install (One Command)",
                    description = "Run this command on the target PC as Administrator",
                    command = $"irm {serverUrl}/api/agent/download/bootstrap | iex"
                },
                manualInstall = new
                {
                    title = "Manual Install",
                    steps = new[]
                    {
                        new { step = 1, description = "Download the installer", command = $"Invoke-WebRequest -Uri '{serverUrl}/api/agent/download/installer' -OutFile 'Install-OrbisAgent.ps1'" },
                        new { step = 2, description = "Run the installer as Administrator", command = $".\\Install-OrbisAgent.ps1 -CoreServiceUrl '{serverUrl}'" }
                    }
                },
                uninstall = new
                {
                    title = "Uninstall Agent",
                    command = $"irm {serverUrl}/api/agent/download/uninstaller | iex"
                }
            };

            return Ok(guide);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating install guide");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    private IActionResult DownloadAgentFile(string fileName)
    {
        try
        {
            var filePath = Path.Combine(
                _environment.ContentRootPath,
                "..",
                "OrbisAgent",
                fileName
            );

            if (!System.IO.File.Exists(filePath))
            {
                _logger.LogError("Agent file not found at: {Path}", filePath);
                return NotFound(new { error = $"{fileName} not found" });
            }

            var fileContent = System.IO.File.ReadAllBytes(filePath);
            
            _logger.LogInformation("Agent file downloaded: {FileName}", fileName);
            
            return File(fileContent, "text/plain", fileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading agent file: {FileName}", fileName);
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
