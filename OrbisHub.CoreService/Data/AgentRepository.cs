using Dapper;
using Microsoft.Data.SqlClient;
using OrbisHub.CoreService.Configuration;
using OrbisHub.CoreService.Models;
using Microsoft.Extensions.Options;

namespace OrbisHub.CoreService.Data;

public interface IAgentRepository
{
    Task<Agent?> GetByIdAsync(Guid agentId);
    Task<Agent?> GetByMachineNameAsync(string machineName);
    Task<List<Agent>> GetAllAsync();
    Task<Guid> CreateAsync(Agent agent);
    Task<bool> UpdateAsync(Agent agent);
    Task<bool> UpdateHeartbeatAsync(Guid agentId, string? agentVersion, string? currentUser, string? metadata);
    Task<bool> DeleteAsync(Guid agentId);
}

public class AgentRepository : IAgentRepository
{
    private readonly string _connectionString;
    private readonly ILogger<AgentRepository> _logger;

    public AgentRepository(IOptions<OrbisHubSettings> settings, ILogger<AgentRepository> logger)
    {
        _connectionString = settings.Value.ConnectionString;
        _logger = logger;
    }

    public async Task<Agent?> GetByIdAsync(Guid agentId)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "SELECT * FROM Agents WHERE AgentId = @AgentId";
            return await connection.QuerySingleOrDefaultAsync<Agent>(sql, new { AgentId = agentId });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving agent {AgentId}", agentId);
            throw;
        }
    }

    public async Task<Agent?> GetByMachineNameAsync(string machineName)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "SELECT TOP 1 * FROM Agents WHERE MachineName = @MachineName ORDER BY CreatedUtc DESC";
            return await connection.QuerySingleOrDefaultAsync<Agent>(sql, new { MachineName = machineName });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving agent by machine name {MachineName}", machineName);
            throw;
        }
    }

    public async Task<List<Agent>> GetAllAsync()
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "SELECT * FROM Agents ORDER BY MachineName";
            var result = await connection.QueryAsync<Agent>(sql);
            return result.ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving all agents");
            throw;
        }
    }

    public async Task<Guid> CreateAsync(Agent agent)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                INSERT INTO Agents (AgentId, MachineName, IPAddress, OSVersion, AgentVersion, LastSeenUtc, CreatedUtc)
                VALUES (@AgentId, @MachineName, @IPAddress, @OSVersion, @AgentVersion, @LastSeenUtc, @CreatedUtc)";

            // Use provided AgentId or generate new one
            if (agent.AgentId == Guid.Empty)
            {
                agent.AgentId = Guid.NewGuid();
            }
            agent.CreatedUtc = DateTime.UtcNow;
            agent.LastSeenUtc = DateTime.UtcNow;

            await connection.ExecuteAsync(sql, agent);
            _logger.LogInformation("Created agent {AgentId} for machine {MachineName}", agent.AgentId, agent.MachineName);
            return agent.AgentId;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating agent for machine {MachineName}", agent.MachineName);
            throw;
        }
    }

    public async Task<bool> UpdateAsync(Agent agent)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE Agents 
                SET MachineName = @MachineName,
                    IPAddress = @IPAddress,
                    OSVersion = @OSVersion,
                    AgentVersion = @AgentVersion,
                    Status = @Status,
                    Metadata = @Metadata,
                    LastSeenUtc = @LastSeenUtc
                WHERE AgentId = @AgentId";

            var rowsAffected = await connection.ExecuteAsync(sql, agent);
            
            _logger.LogInformation("Updated agent {AgentId}", agent.AgentId);
            return rowsAffected > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating agent {AgentId}", agent.AgentId);
            throw;
        }
    }

    public async Task<bool> UpdateHeartbeatAsync(Guid agentId, string? agentVersion, string? currentUser, string? metadata)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = @"
                UPDATE Agents 
                SET LastSeenUtc = @LastSeenUtc,
                    Status = 'Online',
                    AgentVersion = COALESCE(@AgentVersion, AgentVersion),
                    Metadata = CASE WHEN @Metadata IS NOT NULL THEN @Metadata ELSE Metadata END
                WHERE AgentId = @AgentId";

            var rowsAffected = await connection.ExecuteAsync(sql, new
            {
                AgentId = agentId,
                LastSeenUtc = DateTime.UtcNow,
                AgentVersion = agentVersion,
                Metadata = metadata
            });

            return rowsAffected > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating heartbeat for agent {AgentId}", agentId);
            throw;
        }
    }

    public async Task<bool> DeleteAsync(Guid agentId)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            var sql = "DELETE FROM Agents WHERE AgentId = @AgentId";
            var rowsAffected = await connection.ExecuteAsync(sql, new { AgentId = agentId });
            return rowsAffected > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting agent {AgentId}", agentId);
            throw;
        }
    }
}
