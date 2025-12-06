namespace OrbisHub.CoreService.Models;

public class Agent
{
    public Guid AgentId { get; set; }
    public string MachineName { get; set; } = string.Empty;
    public string? IPAddress { get; set; }
    public string? OSVersion { get; set; }
    public string? AgentVersion { get; set; }
    public string? LoggedInUser { get; set; }
    public string? Status { get; set; }
    public string? Metadata { get; set; }
    public DateTime LastSeenUtc { get; set; }
    public DateTime CreatedUtc { get; set; }
}
