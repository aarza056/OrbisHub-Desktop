using System.ComponentModel.DataAnnotations;

namespace OrbisHub.CoreService.DTOs;

public class HeartbeatRequest
{
    [StringLength(50)]
    public string? AgentVersion { get; set; }

    [StringLength(255)]
    public string? CurrentUser { get; set; }

    public string? Metadata { get; set; }
}

public class HeartbeatResponse
{
    public string Status { get; set; } = "ok";
}
