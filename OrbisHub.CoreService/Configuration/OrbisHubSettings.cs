namespace OrbisHub.CoreService.Configuration;

public class OrbisHubSettings
{
    public string ServiceName { get; set; } = "OrbisHub Core Service";
    public string ServiceUrl { get; set; } = "http://0.0.0.0:5000";
    public string ConnectionString { get; set; } = string.Empty;
    public int HeartbeatTimeoutMinutes { get; set; } = 5;
    public int JobTimeoutMinutes { get; set; } = 30;
}
