using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;

namespace AutomationTests
{
    public class ServerTester
    {
        private readonly string connectionString;

        public ServerTester(DatabaseConfig config)
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

        public async Task<string?> CreateServer(string name, string host, int port = 3389,
            string? environmentId = null, string? credentialId = null, string? description = null,
            string status = "active")
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var id = Guid.NewGuid().ToString();

                    var query = @"
                        INSERT INTO Servers (id, name, host, port, environment_id, credential_id, description, status)
                        VALUES (@id, @name, @host, @port, @environmentId, @credentialId, @description, @status)";

                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", id);
                        command.Parameters.AddWithValue("@name", name);
                        command.Parameters.AddWithValue("@host", host);
                        command.Parameters.AddWithValue("@port", port);
                        command.Parameters.AddWithValue("@environmentId", environmentId ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@credentialId", credentialId ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@description", description ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@status", status);

                        await command.ExecuteNonQueryAsync();
                        return id;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Create Server Error: {ex.Message}");
                return null;
            }
        }

        public async Task<bool> EditServer(string serverId, string? name = null, string? host = null,
            int? port = null, string? environmentId = null, string? credentialId = null,
            string? description = null, string? status = null)
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
                    if (host != null)
                    {
                        updates.Add("host = @host");
                        command.Parameters.AddWithValue("@host", host);
                    }
                    if (port.HasValue)
                    {
                        updates.Add("port = @port");
                        command.Parameters.AddWithValue("@port", port.Value);
                    }
                    if (environmentId != null)
                    {
                        updates.Add("environment_id = @environmentId");
                        command.Parameters.AddWithValue("@environmentId", environmentId);
                    }
                    if (credentialId != null)
                    {
                        updates.Add("credential_id = @credentialId");
                        command.Parameters.AddWithValue("@credentialId", credentialId);
                    }
                    if (description != null)
                    {
                        updates.Add("description = @description");
                        command.Parameters.AddWithValue("@description", description);
                    }
                    if (status != null)
                    {
                        updates.Add("status = @status");
                        command.Parameters.AddWithValue("@status", status);
                    }

                    if (updates.Count == 0)
                        return false;

                    command.CommandText = $"UPDATE Servers SET {string.Join(", ", updates)} WHERE id = @id";
                    command.Parameters.AddWithValue("@id", serverId);

                    var rows = await command.ExecuteNonQueryAsync();
                    return rows > 0;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Edit Server Error: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> DeleteServer(string serverId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "DELETE FROM Servers WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", serverId);
                        var rows = await command.ExecuteNonQueryAsync();
                        return rows > 0;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Delete Server Error: {ex.Message}");
                return false;
            }
        }

        public async Task<Dictionary<string, object>?> GetServer(string serverId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT * FROM Servers WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", serverId);

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                var server = new Dictionary<string, object>();
                                for (int i = 0; i < reader.FieldCount; i++)
                                {
                                    server[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                                }
                                return server;
                            }
                        }
                    }
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get Server Error: {ex.Message}");
                return null;
            }
        }

        public async Task<List<Dictionary<string, object>>?> GetAllServers()
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT * FROM Servers ORDER BY created_at DESC";
                    using (var command = new SqlCommand(query, connection))
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        var servers = new List<Dictionary<string, object>>();
                        while (await reader.ReadAsync())
                        {
                            var server = new Dictionary<string, object>();
                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                server[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                            }
                            servers.Add(server);
                        }
                        return servers;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get All Servers Error: {ex.Message}");
                return null;
            }
        }

        public async Task<List<Dictionary<string, object>>?> GetServersByEnvironment(string environmentId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT * FROM Servers WHERE environment_id = @environmentId ORDER BY created_at DESC";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@environmentId", environmentId);
                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            var servers = new List<Dictionary<string, object>>();
                            while (await reader.ReadAsync())
                            {
                                var server = new Dictionary<string, object>();
                                for (int i = 0; i < reader.FieldCount; i++)
                                {
                                    server[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                                }
                                servers.Add(server);
                            }
                            return servers;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get Servers By Environment Error: {ex.Message}");
                return null;
            }
        }
    }
}
