using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace OrbisHub.CoreService.DTOs;

public class JobResponse
{
    public Guid? JobId { get; set; }
    public string? Type { get; set; }
    public JsonDocument? Payload { get; set; }
}

public class CreateJobRequest
{
    [Required]
    public Guid AgentId { get; set; }

    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string Type { get; set; } = string.Empty;

    [Required]
    public JsonDocument Payload { get; set; } = null!;
}

public class CreateJobResponse
{
    public Guid JobId { get; set; }
    public string Status { get; set; } = "created";
}

public class JobResultRequest
{
    [Required]
    [StringLength(50)]
    public string Status { get; set; } = string.Empty;

    public string? Output { get; set; }
    public string? ErrorMessage { get; set; }
}

public class JobResultResponse
{
    public bool Received { get; set; } = true;
}

public class JobStatusResponse
{
    public Guid JobId { get; set; }
    public Guid AgentId { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Output { get; set; }
    public string? ErrorMessage { get; set; }
}
