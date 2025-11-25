using Dapper;
using Microsoft.Data.SqlClient;
using OrbisHub.CoreService.Configuration;
using OrbisHub.CoreService.Models;
using Microsoft.Extensions.Options;

namespace OrbisHub.CoreService.Data;

public interface IJobRepository
{
    Task<AgentJob?> GetByIdAsync(Guid jobId);
    Task<AgentJob?> GetNextPendingJobAsync(Guid agentId);
    Task<List<AgentJob>> GetJobsByAgentAsync(Guid agentId, int limit = 100);
    Task<Guid> CreateAsync(AgentJob job);
    Task<bool> UpdateStatusAsync(Guid jobId, string status, string? resultJson = null, string? errorMessage = null);
    Task<bool> MarkAsStartedAsync(Guid jobId);
    Task<int> TimeoutStalledJobsAsync(int timeoutMinutes);
}

public class JobRepository : IJobRepository
{
    private readonly string _connectionString;
    private readonly ILogger<JobRepository> _logger;

    public JobRepository(IOptions<OrbisHubSettings> settings, ILogger<JobRepository> logger)
    {
        _connectionString = settings.Value.ConnectionString;
        _logger = logger;
    }

    public async Task<AgentJob?> GetByIdAsync(Guid jobId)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "SELECT * FROM AgentJobs WHERE JobId = @JobId";
            return await connection.QuerySingleOrDefaultAsync<AgentJob>(sql, new { JobId = jobId });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving job {JobId}", jobId);
            throw;
        }
    }

    public async Task<AgentJob?> GetNextPendingJobAsync(Guid agentId)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            
            // Use WITH (UPDLOCK, READPAST) to prevent race conditions when multiple agents poll
            var sql = @"
                SELECT TOP 1 * 
                FROM AgentJobs WITH (UPDLOCK, READPAST)
                WHERE AgentId = @AgentId 
                  AND Status = @Status
                ORDER BY CreatedUtc ASC";

            return await connection.QuerySingleOrDefaultAsync<AgentJob>(sql, new
            {
                AgentId = agentId,
                Status = JobStatus.Pending
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving next pending job for agent {AgentId}", agentId);
            throw;
        }
    }

    public async Task<List<AgentJob>> GetJobsByAgentAsync(Guid agentId, int limit = 100)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                SELECT TOP (@Limit) * 
                FROM AgentJobs 
                WHERE AgentId = @AgentId 
                ORDER BY CreatedUtc DESC";

            var result = await connection.QueryAsync<AgentJob>(sql, new { AgentId = agentId, Limit = limit });
            return result.ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving jobs for agent {AgentId}", agentId);
            throw;
        }
    }

    public async Task<Guid> CreateAsync(AgentJob job)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                INSERT INTO AgentJobs (JobId, AgentId, Type, PayloadJson, Status, CreatedUtc)
                VALUES (@JobId, @AgentId, @Type, @PayloadJson, @Status, @CreatedUtc)";

            job.JobId = Guid.NewGuid();
            job.CreatedUtc = DateTime.UtcNow;
            job.Status = JobStatus.Pending;

            await connection.ExecuteAsync(sql, job);
            _logger.LogInformation("Created job {JobId} of type {Type} for agent {AgentId}", 
                job.JobId, job.Type, job.AgentId);
            
            return job.JobId;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating job for agent {AgentId}", job.AgentId);
            throw;
        }
    }

    public async Task<bool> UpdateStatusAsync(Guid jobId, string status, string? resultJson = null, string? errorMessage = null)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE AgentJobs 
                SET Status = @Status,
                    CompletedUtc = @CompletedUtc,
                    ResultJson = @ResultJson,
                    ErrorMessage = @ErrorMessage
                WHERE JobId = @JobId";

            var rowsAffected = await connection.ExecuteAsync(sql, new
            {
                JobId = jobId,
                Status = status,
                CompletedUtc = DateTime.UtcNow,
                ResultJson = resultJson,
                ErrorMessage = errorMessage
            });

            if (rowsAffected > 0)
            {
                _logger.LogInformation("Updated job {JobId} to status {Status}", jobId, status);
            }

            return rowsAffected > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating status for job {JobId}", jobId);
            throw;
        }
    }

    public async Task<bool> MarkAsStartedAsync(Guid jobId)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE AgentJobs 
                SET Status = @Status,
                    StartedUtc = @StartedUtc
                WHERE JobId = @JobId AND Status = @PendingStatus";

            var rowsAffected = await connection.ExecuteAsync(sql, new
            {
                JobId = jobId,
                Status = JobStatus.InProgress,
                StartedUtc = DateTime.UtcNow,
                PendingStatus = JobStatus.Pending
            });

            return rowsAffected > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error marking job {JobId} as started", jobId);
            throw;
        }
    }

    public async Task<int> TimeoutStalledJobsAsync(int timeoutMinutes)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE AgentJobs 
                SET Status = @TimeoutStatus,
                    CompletedUtc = @CompletedUtc,
                    ErrorMessage = 'Job timed out after ' + CAST(@TimeoutMinutes AS NVARCHAR) + ' minutes'
                WHERE Status = @InProgressStatus
                  AND StartedUtc < @CutoffTime";

            var cutoffTime = DateTime.UtcNow.AddMinutes(-timeoutMinutes);
            var rowsAffected = await connection.ExecuteAsync(sql, new
            {
                TimeoutStatus = JobStatus.Timeout,
                InProgressStatus = JobStatus.InProgress,
                CompletedUtc = DateTime.UtcNow,
                TimeoutMinutes = timeoutMinutes,
                CutoffTime = cutoffTime
            });

            if (rowsAffected > 0)
            {
                _logger.LogWarning("Timed out {Count} stalled jobs", rowsAffected);
            }

            return rowsAffected;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error timing out stalled jobs");
            throw;
        }
    }
}
