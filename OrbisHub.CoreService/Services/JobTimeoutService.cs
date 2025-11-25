using OrbisHub.CoreService.Configuration;
using OrbisHub.CoreService.Data;
using Microsoft.Extensions.Options;

namespace OrbisHub.CoreService.Services;

public class JobTimeoutService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<JobTimeoutService> _logger;
    private readonly int _jobTimeoutMinutes;
    private readonly int _checkIntervalMinutes;

    public JobTimeoutService(
        IServiceProvider serviceProvider,
        IOptions<OrbisHubSettings> settings,
        ILogger<JobTimeoutService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _jobTimeoutMinutes = settings.Value.JobTimeoutMinutes;
        _checkIntervalMinutes = Math.Max(1, _jobTimeoutMinutes / 6); // Check every 1/6th of timeout period
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Job Timeout Service started. Will check for stalled jobs every {Minutes} minutes.", 
            _checkIntervalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(_checkIntervalMinutes), stoppingToken);

                // Create a scope to get scoped services
                using var scope = _serviceProvider.CreateScope();
                var jobRepository = scope.ServiceProvider.GetRequiredService<IJobRepository>();

                var timedOutCount = await jobRepository.TimeoutStalledJobsAsync(_jobTimeoutMinutes);

                if (timedOutCount > 0)
                {
                    _logger.LogWarning("Timed out {Count} stalled jobs", timedOutCount);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected when stopping
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in job timeout service");
                // Continue running despite errors
            }
        }

        _logger.LogInformation("Job Timeout Service stopped.");
    }
}
