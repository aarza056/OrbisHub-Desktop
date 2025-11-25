using Microsoft.Data.SqlClient;
using OrbisHub.CoreService.Configuration;
using Microsoft.Extensions.Options;

namespace OrbisHub.CoreService.Services;

public class DatabaseHealthService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DatabaseHealthService> _logger;
    private readonly string _connectionString;
    private readonly int _retryIntervalSeconds = 30;

    public DatabaseHealthService(
        IServiceProvider serviceProvider,
        IOptions<OrbisHubSettings> settings,
        ILogger<DatabaseHealthService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _connectionString = settings.Value.ConnectionString;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Database Health Service started.");

        // Wait for database to be available on startup
        await WaitForDatabaseAsync(stoppingToken);

        // Periodic health checks
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                await CheckDatabaseHealthAsync();
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during database health check");
            }
        }

        _logger.LogInformation("Database Health Service stopped.");
    }

    private async Task WaitForDatabaseAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync(stoppingToken);
                _logger.LogInformation("Database connection established successfully.");
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, 
                    "Database connection failed. Retrying in {Seconds} seconds...", 
                    _retryIntervalSeconds);
                
                await Task.Delay(TimeSpan.FromSeconds(_retryIntervalSeconds), stoppingToken);
            }
        }
    }

    private async Task CheckDatabaseHealthAsync()
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1";
        await command.ExecuteScalarAsync();
    }
}
