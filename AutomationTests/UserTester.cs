using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using BCrypt.Net;

namespace AutomationTests
{
    public class UserTester
    {
        private readonly string connectionString;

        public UserTester(DatabaseConfig config)
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

        public async Task<string?> CreateUser(string username, string password, string? email = null, 
            string? name = null, string role = "viewer", string? position = null, string? squad = null)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var id = Guid.NewGuid().ToString();
                    var hashedPassword = BCrypt.Net.BCrypt.HashPassword(password);

                    var query = @"
                        INSERT INTO Users (id, username, password, email, name, role, position, squad, isActive, changePasswordOnLogin)
                        VALUES (@id, @username, @password, @email, @name, @role, @position, @squad, 1, 0)";

                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", id);
                        command.Parameters.AddWithValue("@username", username);
                        command.Parameters.AddWithValue("@password", hashedPassword);
                        command.Parameters.AddWithValue("@email", email ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@name", name ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@role", role);
                        command.Parameters.AddWithValue("@position", position ?? (object)DBNull.Value);
                        command.Parameters.AddWithValue("@squad", squad ?? (object)DBNull.Value);

                        await command.ExecuteNonQueryAsync();
                        return id;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Create User Error: {ex.Message}");
                return null;
            }
        }

        public async Task<bool> EditUser(string userId, string? username = null, string? password = null, 
            string? email = null, string? name = null, string? role = null, string? position = null, 
            string? squad = null, bool? isActive = null)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var updates = new List<string>();
                    var command = new SqlCommand();
                    command.Connection = connection;

                    if (username != null)
                    {
                        updates.Add("username = @username");
                        command.Parameters.AddWithValue("@username", username);
                    }
                    if (password != null)
                    {
                        updates.Add("password = @password");
                        command.Parameters.AddWithValue("@password", BCrypt.Net.BCrypt.HashPassword(password));
                    }
                    if (email != null)
                    {
                        updates.Add("email = @email");
                        command.Parameters.AddWithValue("@email", email);
                    }
                    if (name != null)
                    {
                        updates.Add("name = @name");
                        command.Parameters.AddWithValue("@name", name);
                    }
                    if (role != null)
                    {
                        updates.Add("role = @role");
                        command.Parameters.AddWithValue("@role", role);
                    }
                    if (position != null)
                    {
                        updates.Add("position = @position");
                        command.Parameters.AddWithValue("@position", position);
                    }
                    if (squad != null)
                    {
                        updates.Add("squad = @squad");
                        command.Parameters.AddWithValue("@squad", squad);
                    }
                    if (isActive.HasValue)
                    {
                        updates.Add("isActive = @isActive");
                        command.Parameters.AddWithValue("@isActive", isActive.Value);
                    }

                    if (updates.Count == 0)
                        return false;

                    command.CommandText = $"UPDATE Users SET {string.Join(", ", updates)} WHERE id = @id";
                    command.Parameters.AddWithValue("@id", userId);

                    var rows = await command.ExecuteNonQueryAsync();
                    return rows > 0;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Edit User Error: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> DeleteUser(string userId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "DELETE FROM Users WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", userId);
                        var rows = await command.ExecuteNonQueryAsync();
                        return rows > 0;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Delete User Error: {ex.Message}");
                return false;
            }
        }

        public async Task<Dictionary<string, object>?> GetUser(string userId)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT * FROM Users WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", userId);

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                var user = new Dictionary<string, object>();
                                for (int i = 0; i < reader.FieldCount; i++)
                                {
                                    user[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                                }
                                return user;
                            }
                        }
                    }
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get User Error: {ex.Message}");
                return null;
            }
        }

        public async Task<List<Dictionary<string, object>>?> GetAllUsers()
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT id, username, email, name, role, position, squad, isActive, created_at FROM Users";
                    using (var command = new SqlCommand(query, connection))
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        var users = new List<Dictionary<string, object>>();
                        while (await reader.ReadAsync())
                        {
                            var user = new Dictionary<string, object>();
                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                user[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                            }
                            users.Add(user);
                        }
                        return users;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Get All Users Error: {ex.Message}");
                return null;
            }
        }

        public async Task<bool> VerifyPassword(string userId, string password)
        {
            try
            {
                using (var connection = new SqlConnection(connectionString))
                {
                    await connection.OpenAsync();

                    var query = "SELECT password FROM Users WHERE id = @id";
                    using (var command = new SqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@id", userId);
                        var hashedPassword = await command.ExecuteScalarAsync() as string;

                        if (hashedPassword != null)
                        {
                            return BCrypt.Net.BCrypt.Verify(password, hashedPassword);
                        }
                    }
                }
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Verify Password Error: {ex.Message}");
                return false;
            }
        }
    }
}
