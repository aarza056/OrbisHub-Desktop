using System.ComponentModel.DataAnnotations;

namespace OrbisHub.CoreService.DTOs;

public class AgentRegistrationRequest
{
    public Guid? AgentId { get; set; }
    
    [Required]
    [StringLength(255, MinimumLength = 1)]
    public string MachineName { get; set; } = string.Empty;

    public List<string>? IpAddresses { get; set; }

    [StringLength(255)]
    public string? OsVersion { get; set; }

    [StringLength(50)]
    public string? AgentVersion { get; set; }
}

public class AgentRegistrationResponse
{
    public Guid AgentId { get; set; }
    public string Status { get; set; } = "registered";
}
