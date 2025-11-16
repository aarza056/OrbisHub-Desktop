using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using Newtonsoft.Json;

namespace AutomationTests
{
    public class EnvironmentTester
    {
        private readonly string connectionString;

        public EnvironmentTester(DatabaseConfig config)
        {
            if (config.UseWindowsAuth)
            {
                connectionString = $"Server={config.Server};Database={config.Database};Integrated Security=True;";
            }
            else
            {
                connectionString = $"Server={config.Server};Database={config.Database};User Id={config.Username};Password={config.Password};";
            }
        }

        public async Task<string?> CreateEnvironment(string name, string? type = null, string? url = null,
            string? health = null, string? deployerCredentialId = null, List<string>? mappedServers = null,
            string? description = null, string? color = null)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var id = Guid.NewGuid().ToString();
                    var mappedServersJson = mappedServers != null ? JsonConvert.SerializeObject(mappedServers) : null;

                    var query = @"
                        INSERT INTO Environments (id, name, type, url, health, deployerCredentialId, mappedServers, description, color)
                        VALUES (@id, @name, @type, @url, @health, @deployerCredentialId, @mappedServers, @description, @color)";

                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", id);
                        command.Parameters.AddWithValue("@name", name);
                        command.Parameters.AddWithValue("@type", type ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@url", url ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@health", health ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@deployerCredentialId", deployerCredentialId ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@mappedServers", mappedServersJson ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@description", description ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@color", color ?? (object)DBNull.Value);

                        await command.ExecuteNonQueryAsync();
                        return id;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Create Environment Error: {ex.Message}");
                return null;
            }
        }

        public async Task<bool> EditEnvironment(string environmentId, string? name = null, string? type = null,
            string? url = null, string? health = null, string? deployerCredentialId = null,
            List<string>? mappedServers = null, string? description = null, string? color = null)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var updates = new List<string>();
                    var command = new SqlCommand();
                    command.Connection = connection;

                    if (name != null)
                    {
                        updates.Add("name = @name");
                        command.Parameters.AddWithValue("@name", name);
                    }
                    if (type != null)
                    {
                        updates.Add("type = @type");
                        command.Parameters.AddWithValue("@type", type);
                    }
                    if (url != null)
                    {
                        updates.Add("url = @url");
                        command.Parameters.AddWithValue("@url", url);
                    }
                    if (health != null)
                    {
                        updates.Add("health = @health");
                        command.Parameters.AddWithValue("@health", health);
                    }
                    if (deployerCredentialId != null)
                    {
                        updates.Add("deployerCredentialId = @deployerCredentialId");
                        command.Parameters.AddWithValue("@deployerCredentialId", deployerCredentialId);
                    }
                    if (mappedServers != null)
                    {
                        updates.Add("mappedServers = @mappedServers");
                        command.Parameters.AddWithValue("@mappedServers", JsonConvert.SerializeObject(mappedServers));
                    }
                    if (description != null)
                    {
                        updates.Add("description = @description");
                        command.Parameters.AddWithValue("@description", description);
                    }
                    if (color != null)
                    {
                        updates.Add("color = @color");
                        command.Parameters.AddWithValue("@color", color);
                    }

                    if (updates.Count == 0)
                        return false;

                    command.CommandText = $"UPDATE Environments SET {string.Join(", ", updates)} WHERE id = @id";
                    command.Parameters.AddWithValue("@id", environmentId);

                    var rows = await command.ExecuteNonQueryAsync();
                    return rows > 0;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Edit Environment Error: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> DeleteEnvironment(string environmentId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "DELETE FROM Environments WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", environmentId);
                        var rows = await command.ExecuteNonQueryAsync();
                        return rows > 0;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Delete Environment Error: {ex.Message}");
                return false;
            }
        }

        public async Task<Dictionary<string, object>?> GetEnvironment(string environmentId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT * FROM Environments WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", environmentId);

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                var env = new Dictionary<string, object>();
                                for (int i = 0; i < reader.FieldCount; i++)
                                {
                                    env[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                                }
                                return env;
                            }
                        }
                    }
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get Environment Error: {ex.Message}");
                return null;
            }
        }

        public async Task<List<Dictionary<string, object>>?> GetAllEnvironments()
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT * FROM Environments ORDER BY created_at DESC";
                    using (var command = new SqlCommand(query, connection))
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        var environments = new List<Dictionary<string, object>>();
                        while (await reader.ReadAsync())
                        {
                            var env = new Dictionary<string, object>();
                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                env[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                            }
                            environments.Add(env);
                        }
                        return environments;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get All Environments Error: {ex.Message}");
                return null;
            }
        }
    }
}
