namespace AutomationTests;

public class DatabaseConfig
{
    public string Server { get; set; } = "localhost";
    public string Database { get; set; } = "OrbisHubDB";
    public bool UseWindowsAuth { get; set; } = true;
    public string? Username { get; set; }
    public string? Password { get; set; }

    public string GetConnectionString()
    {
        if (UseWindowsAuth)
        {
            return $"Server={Server};Database={Database};Integrated Security=true;TrustServerCertificate=true;";
        }
        else
        {
            return $"Server={Server};Database={Database};User Id={Username};Password={Password};TrustServerCertificate=true;";
        }
    }
}
