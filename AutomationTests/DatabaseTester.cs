using System;
using System.Data.SqlClient;
using BCrypt.Net;

namespace AutomationTests;

public class DatabaseTester
{
    private readonly DatabaseConfig _config;
    private readonly List<string> _createdUserIds = new();
    private readonly List<string> _createdMessageIds = new();

    public DatabaseTester(DatabaseConfig config)
    {
        _config = config;
    }

    public async Task<bool> TestConnection()
    {
        try
        {
            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Connection error: {ex.Message}");
            return false;
        }
    }

    public async Task<string?> CreateTestUser(string username, string password, string email)
    {
        try
        {
            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();

            var userId = $"user_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{GenerateRandomString(6)}";
            var hashedPassword = BCrypt.Net.BCrypt.HashPassword(password);

            var query = @"
                INSERT INTO [dbo].[Users] (Id, Username, Password, Email, Created_At)
                VALUES (@Id, @Username, @Password, @Email, GETDATE())";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@Id", userId);
            command.Parameters.AddWithValue("@Username", username);
            command.Parameters.AddWithValue("@Password", hashedPassword);
            command.Parameters.AddWithValue("@Email", email);

            await command.ExecuteNonQueryAsync();
            _createdUserIds.Add(userId);
            return userId;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Create user error: {ex.Message}");
            return null;
        }
    }

    public async Task<bool> TestAuthentication(string username, string password)
    {
        try
        {
            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();

            var query = "SELECT Password FROM [dbo].[Users] WHERE Username = @Username";
            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@Username", username);

            var result = await command.ExecuteScalarAsync();
            if (result == null) return false;

            var hashedPassword = result.ToString()!;
            return BCrypt.Net.BCrypt.Verify(password, hashedPassword);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Authentication error: {ex.Message}");
            return false;
        }
    }

    public async Task<List<Dictionary<string, object>>?> GetAllUsers()
    {
        try
        {
            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();

            var query = "SELECT Id, Username, Email, Created_At FROM [dbo].[Users]";
            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            var users = new List<Dictionary<string, object>>();
            while (await reader.ReadAsync())
            {
                var user = new Dictionary<string, object>
                {
                    ["Id"] = reader["Id"],
                    ["Username"] = reader["Username"],
                    ["Email"] = reader["Email"],
                    ["Created_At"] = reader["Created_At"]
                };
                users.Add(user);
            }

            return users;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Get users error: {ex.Message}");
            return null;
        }
    }

    public async Task<bool> CleanupTestData()
    {
        try
        {
            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();

            // Delete messages first (foreign key constraint)
            if (_createdMessageIds.Count > 0)
            {
                var msgIds = string.Join(",", _createdMessageIds.Select(id => $"'{id}'"));
                var deleteMessages = $"DELETE FROM [dbo].[Messages] WHERE Id IN ({msgIds})";
                using var msgCommand = new SqlCommand(deleteMessages, connection);
                await msgCommand.ExecuteNonQueryAsync();
            }

            // Delete test users
            if (_createdUserIds.Count > 0)
            {
                var userIds = string.Join(",", _createdUserIds.Select(id => $"'{id}'"));
                
                // First delete messages sent by or to test users
                var deleteUserMessages = $"DELETE FROM [dbo].[Messages] WHERE SenderId IN ({userIds}) OR RecipientId IN ({userIds})";
                using var delMsgCmd = new SqlCommand(deleteUserMessages, connection);
                await delMsgCmd.ExecuteNonQueryAsync();

                // Then delete users
                var deleteUsers = $"DELETE FROM [dbo].[Users] WHERE Id IN ({userIds})";
                using var userCommand = new SqlCommand(deleteUsers, connection);
                await userCommand.ExecuteNonQueryAsync();
            }

            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Cleanup error: {ex.Message}");
            return false;
        }
    }

    public void TrackMessageId(string messageId)
    {
        _createdMessageIds.Add(messageId);
    }

    private string GenerateRandomString(int length)
    {
        const string chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        var random = new Random();
        return new string(Enumerable.Repeat(chars, length)
            .Select(s => s[random.Next(s.Length)]).ToArray());
    }
}
