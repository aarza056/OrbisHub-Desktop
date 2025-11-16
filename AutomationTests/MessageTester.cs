using System;
using System.Data.SqlClient;

namespace AutomationTests;

public class MessageTester
{
    private readonly DatabaseConfig _config;

    public MessageTester(DatabaseConfig config)
    {
        _config = config;
    }

    public async Task<string?> SendMessage(string senderId, string? recipientId, string content)
    {
        try
        {
            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();

            var messageId = $"msg_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{GenerateRandomString(6)}";

            var query = @"
                INSERT INTO [dbo].[Messages] 
                (Id, SenderId, RecipientId, Content, SentAt, [Read], HasAttachment)
                VALUES (@Id, @SenderId, @RecipientId, @Content, GETDATE(), 0, 0)";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@Id", messageId);
            command.Parameters.AddWithValue("@SenderId", senderId);
            command.Parameters.AddWithValue("@RecipientId", (object?)recipientId ?? DBNull.Value);
            command.Parameters.AddWithValue("@Content", content);

            await command.ExecuteNonQueryAsync();
            return messageId;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Send message error: {ex.Message}");
            return null;
        }
    }

    public async Task<List<Dictionary<string, object>>?> LoadConversation(string userId, string? otherUserId)
    {
        try
        {
            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();

            string query;
            if (otherUserId == null)
            {
                // Self-notes
                query = @"
                    SELECT m.Id, m.SenderId, u.Username as SenderName, m.RecipientId, 
                           m.Content, m.SentAt, m.[Read],
                           ISNULL(m.HasAttachment, 0) as HasAttachment,
                           ISNULL(m.AttachmentName, '') as AttachmentName,
                           ISNULL(m.AttachmentSize, 0) as AttachmentSize,
                           ISNULL(m.AttachmentType, '') as AttachmentType
                    FROM [dbo].[Messages] m
                    LEFT JOIN [dbo].[Users] u ON m.SenderId = u.Id
                    WHERE m.SenderId = @UserId AND m.RecipientId IS NULL
                    ORDER BY m.SentAt ASC";
            }
            else
            {
                // Conversation between two users
                query = @"
                    SELECT m.Id, m.SenderId, u.Username as SenderName, m.RecipientId, 
                           m.Content, m.SentAt, m.[Read],
                           ISNULL(m.HasAttachment, 0) as HasAttachment,
                           ISNULL(m.AttachmentName, '') as AttachmentName,
                           ISNULL(m.AttachmentSize, 0) as AttachmentSize,
                           ISNULL(m.AttachmentType, '') as AttachmentType
                    FROM [dbo].[Messages] m
                    LEFT JOIN [dbo].[Users] u ON m.SenderId = u.Id
                    WHERE (m.SenderId = @UserId AND m.RecipientId = @OtherUserId)
                       OR (m.SenderId = @OtherUserId AND m.RecipientId = @UserId)
                    ORDER BY m.SentAt ASC";
            }

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            if (otherUserId != null)
                command.Parameters.AddWithValue("@OtherUserId", otherUserId);

            using var reader = await command.ExecuteReaderAsync();

            var messages = new List<Dictionary<string, object>>();
            while (await reader.ReadAsync())
            {
                var message = new Dictionary<string, object>
                {
                    ["Id"] = reader["Id"],
                    ["SenderId"] = reader["SenderId"],
                    ["SenderName"] = reader["SenderName"],
                    ["RecipientId"] = reader["RecipientId"] == DBNull.Value ? null! : reader["RecipientId"],
                    ["Content"] = reader["Content"],
                    ["SentAt"] = reader["SentAt"],
                    ["Read"] = reader["Read"],
                    ["HasAttachment"] = reader["HasAttachment"],
                    ["AttachmentName"] = reader["AttachmentName"],
                    ["AttachmentSize"] = reader["AttachmentSize"],
                    ["AttachmentType"] = reader["AttachmentType"]
                };
                messages.Add(message);
            }

            return messages;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Load conversation error: {ex.Message}");
            return null;
        }
    }

    private string GenerateRandomString(int length)
    {
        const string chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        var random = new Random();
        return new string(Enumerable.Repeat(chars, length)
            .Select(s => s[random.Next(s.Length)]).ToArray());
    }
}
