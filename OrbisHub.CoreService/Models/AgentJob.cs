namespace OrbisHub.CoreService.Models;

public class AgentJob
{
    public Guid JobId { get; set; }
    public Guid AgentId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string? PayloadJson { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime CreatedUtc { get; set; }
    public DateTime? StartedUtc { get; set; }
    public DateTime? CompletedUtc { get; set; }
    public string? ResultJson { get; set; }
    public string? ErrorMessage { get; set; }
}

public static class JobStatus
{
    public const string Pending = "Pending";
    public const string InProgress = "InProgress";
    public const string Succeeded = "Succeeded";
    public const string Failed = "Failed";
    public const string Timeout = "Timeout";
}
