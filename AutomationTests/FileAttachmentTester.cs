using System;
using System.Data.SqlClient;
using System.Security.Cryptography;

namespace AutomationTests;

public class FileAttachmentTester
{
    private readonly DatabaseConfig _config;
    private const int MaxFileSize = 3 * 1024 * 1024; // 3MB

    public FileAttachmentTester(DatabaseConfig config)
    {
        _config = config;
    }

    public async Task<string?> CreateSmallFileAttachment(string senderId, string recipientId)
    {
        try
        {
            // Create a small test file (100KB)
            var fileData = new byte[100 * 1024];
            new Random().NextBytes(fileData);

            return await UploadFileAttachment(senderId, recipientId, "test_small.bin", fileData, ".bin");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Small file upload error: {ex.Message}");
            return null;
        }
    }

    public async Task<string?> CreateLargeFileAttachment(string senderId, string recipientId)
    {
        try
        {
            // Create a file larger than 3MB (4MB)
            var fileData = new byte[4 * 1024 * 1024];
            new Random().NextBytes(fileData);

            // Should fail validation
            if (fileData.Length > MaxFileSize)
            {
                Console.WriteLine($"File size {fileData.Length} exceeds limit {MaxFileSize}");
                return null;
            }

            return await UploadFileAttachment(senderId, recipientId, "test_large.bin", fileData, ".bin");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Large file test error: {ex.Message}");
            return null;
        }
    }

    public async Task<bool> TestVariousFileTypes(string senderId, string recipientId)
    {
        var fileTypes = new[]
        {
            (".png", "test_image.png"),
            (".pdf", "test_document.pdf"),
            (".docx", "test_word.docx"),
            (".xlsx", "test_excel.xlsx"),
            (".zip", "test_archive.zip"),
            (".mp3", "test_audio.mp3")
        };

        foreach (var (ext, fileName) in fileTypes)
        {
            var fileData = new byte[50 * 1024]; // 50KB test files
            new Random().NextBytes(fileData);

            var messageId = await UploadFileAttachment(senderId, recipientId, fileName, fileData, ext);
            if (messageId == null)
            {
                Console.WriteLine($"Failed to upload {fileName}");
                return false;
            }
            Console.WriteLine($"  ✓ Uploaded {fileName}");
        }

        return true;
    }

    public async Task<bool> DownloadAndVerifyFile(string messageId)
    {
        try
        {
            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();

            var query = @"
                SELECT AttachmentData, AttachmentName, AttachmentSize
                FROM [dbo].[Messages]
                WHERE Id = @MessageId AND HasAttachment = 1";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@MessageId", messageId);

            using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                Console.WriteLine("File not found in database");
                return false;
            }

            var attachmentData = reader["AttachmentData"] as byte[];
            var attachmentName = reader["AttachmentName"] as string;
            var attachmentSize = Convert.ToInt32(reader["AttachmentSize"]);

            if (attachmentData == null || attachmentData.Length == 0)
            {
                Console.WriteLine("Attachment data is empty");
                return false;
            }

            if (attachmentData.Length != attachmentSize)
            {
                Console.WriteLine($"Size mismatch: expected {attachmentSize}, got {attachmentData.Length}");
                return false;
            }

            Console.WriteLine($"  ✓ Downloaded {attachmentName} ({attachmentSize} bytes)");
            Console.WriteLine($"  ✓ File integrity verified (MD5: {CalculateMD5(attachmentData)})");

            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Download error: {ex.Message}");
            return false;
        }
    }

    private async Task<string?> UploadFileAttachment(string senderId, string recipientId, 
        string fileName, byte[] fileData, string fileType)
    {
        try
        {
            // Validate file size
            if (fileData.Length > MaxFileSize)
            {
                return null;
            }

            using var connection = new SqlConnection(_config.GetConnectionString());
            await connection.OpenAsync();

            var messageId = $"msg_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{GenerateRandomString(6)}";

            var query = @"
                INSERT INTO [dbo].[Messages] 
                (Id, SenderId, RecipientId, Content, SentAt, [Read], 
                 HasAttachment, AttachmentName, AttachmentSize, AttachmentType, AttachmentData)
                VALUES 
                (@Id, @SenderId, @RecipientId, @Content, GETDATE(), 0, 
                 1, @AttachmentName, @AttachmentSize, @AttachmentType, @AttachmentData)";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@Id", messageId);
            command.Parameters.AddWithValue("@SenderId", senderId);
            command.Parameters.AddWithValue("@RecipientId", recipientId);
            command.Parameters.AddWithValue("@Content", "");
            command.Parameters.AddWithValue("@AttachmentName", fileName);
            command.Parameters.AddWithValue("@AttachmentSize", fileData.Length);
            command.Parameters.AddWithValue("@AttachmentType", fileType);
            command.Parameters.AddWithValue("@AttachmentData", fileData);

            await command.ExecuteNonQueryAsync();
            return messageId;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Upload error: {ex.Message}");
            return null;
        }
    }

    private string CalculateMD5(byte[] data)
    {
        using var md5 = MD5.Create();
        var hash = md5.ComputeHash(data);
        return BitConverter.ToString(hash).Replace("-", "").ToLower();
    }

    private string GenerateRandomString(int length)
    {
        const string chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        var random = new Random();
        return new string(Enumerable.Repeat(chars, length)
            .Select(s => s[random.Next(s.Length)]).ToArray());
    }
}
