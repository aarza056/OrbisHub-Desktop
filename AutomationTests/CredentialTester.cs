using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;

namespace AutomationTests
{
    public class CredentialTester
    {
        private readonly string connectionString;

        public CredentialTester(DatabaseConfig config)
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

        public async Task<string?> CreateCredential(string name, string username, string password,
            string? domain = null, string? description = null)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var id = Guid.NewGuid().ToString();

                    var query = @"
                        INSERT INTO Credentials (id, name, username, password, domain, description)
                        VALUES (@id, @name, @username, @password, @domain, @description)";

                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", id);
                        command.Parameters.AddWithValue("@name", name);
                        command.Parameters.AddWithValue("@username", username);
                        command.Parameters.AddWithValue("@password", password);
                        command.Parameters.AddWithValue("@domain", domain ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@description", description ?? (object)DBNull.Value);

                        await command.ExecuteNonQueryAsync();
                        return id;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Create Credential Error: {ex.Message}");
                return null;
            }
        }

        public async Task<bool> EditCredential(string credentialId, string? name = null, string? username = null,
            string? password = null, string? domain = null, string? description = null)
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
                    if (username != null)
                    {
                        updates.Add("username = @username");
                        command.Parameters.AddWithValue("@username", username);
                    }
                    if (password != null)
                    {
                        updates.Add("password = @password");
                        command.Parameters.AddWithValue("@password", password);
                    }
                    if (domain != null)
                    {
                        updates.Add("domain = @domain");
                        command.Parameters.AddWithValue("@domain", domain);
                    }
                    if (description != null)
                    {
                        updates.Add("description = @description");
                        command.Parameters.AddWithValue("@description", description);
                    }

                    if (updates.Count == 0)
                        return false;

                    command.CommandText = $"UPDATE Credentials SET {string.Join(", ", updates)} WHERE id = @id";
                    command.Parameters.AddWithValue("@id", credentialId);

                    var rows = await command.ExecuteNonQueryAsync();
                    return rows > 0;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Edit Credential Error: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> DeleteCredential(string credentialId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "DELETE FROM Credentials WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", credentialId);
                        var rows = await command.ExecuteNonQueryAsync();
                        return rows > 0;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Delete Credential Error: {ex.Message}");
                return false;
            }
        }

        public async Task<Dictionary<string, object>?> GetCredential(string credentialId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT * FROM Credentials WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", credentialId);

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                var cred = new Dictionary<string, object>();
                                for (int i = 0; i < reader.FieldCount; i++)
                                {
                                    cred[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                                }
                                return cred;
                            }
                        }
                    }
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get Credential Error: {ex.Message}");
                return null;
            }
        }

        public async Task<List<Dictionary<string, object>>?> GetAllCredentials()
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    // Don't return passwords in list view for security
                    var query = "SELECT id, name, username, domain, description, created_at FROM Credentials ORDER BY created_at DESC";
                    using (var command = new SqlCommand(query, connection))
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        var credentials = new List<Dictionary<string, object>>();
                        while (await reader.ReadAsync())
                        {
                            var cred = new Dictionary<string, object>();
                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                cred[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                            }
                            credentials.Add(cred);
                        }
                        return credentials;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get All Credentials Error: {ex.Message}");
                return null;
            }
        }

        public async Task<bool> VerifyCredentialPassword(string credentialId, string expectedPassword)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT password FROM Credentials WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", credentialId);
                        var storedPassword = await command.ExecuteScalarAsync() as string;

                        return storedPassword == expectedPassword;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Verify Credential Password Error: {ex.Message}");
                return false;
            }
        }
    }
}
