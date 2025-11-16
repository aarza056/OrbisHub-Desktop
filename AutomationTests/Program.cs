using System;
using System.Data.SqlClient;
using System.Text;
using AutomationTests;

class Program
{
    static async Task Main(string[] args)
    {
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("═══════════════════════════════════════════════════════");
        Console.WriteLine("     OrbisHub Desktop - Automation Test Suite");
        Console.WriteLine("═══════════════════════════════════════════════════════");
        Console.ResetColor();
        Console.WriteLine();

        // Get database configuration
        var config = GetDatabaseConfig();
        var tester = new DatabaseTester(config);
        var messageTester = new MessageTester(config);
        var fileTester = new FileAttachmentTester(config);
        var userTester = new UserTester(config);
        var environmentTester = new EnvironmentTester(config);
        var serverTester = new ServerTester(config);
        var credentialTester = new CredentialTester(config);

        int totalTests = 0;
        int passedTests = 0;
        int failedTests = 0;

        try
        {
            // Test Database Connection
            Console.WriteLine("\n[1] Testing Database Connection...");
            if (await tester.TestConnection())
            {
                passedTests++;
                PrintSuccess("✓ Database connection successful");
            }
            else
            {
                failedTests++;
                PrintError("✗ Database connection failed");
                return;
            }
            totalTests++;

            // Test User Operations
            Console.WriteLine("\n[2] Testing User Operations...");
            
            // Create test users
            var user1Id = await tester.CreateTestUser("testuser_auto1", "password123", "test1@example.com");
            var user2Id = await tester.CreateTestUser("testuser_auto2", "password456", "test2@example.com");
            
            if (user1Id != null && user2Id != null)
            {
                passedTests++;
                PrintSuccess($"✓ Created test users: {user1Id}, {user2Id}");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to create test users");
            }
            totalTests++;

            // Test duplicate user registration
            Console.WriteLine("\n[3] Testing Duplicate User Registration...");
            var duplicateId = await tester.CreateTestUser("testuser_auto1", "password123", "dup@example.com");
            if (duplicateId == null)
            {
                passedTests++;
                PrintSuccess("✓ Correctly rejected duplicate username");
            }
            else
            {
                failedTests++;
                PrintError("✗ Should have rejected duplicate username");
            }
            totalTests++;

            // Test user authentication
            Console.WriteLine("\n[4] Testing User Authentication...");
            if (await tester.TestAuthentication("testuser_auto1", "password123"))
            {
                passedTests++;
                PrintSuccess("✓ Valid login successful");
            }
            else
            {
                failedTests++;
                PrintError("✗ Valid login failed");
            }
            totalTests++;

            Console.WriteLine("\n[5] Testing Invalid Authentication...");
            if (!await tester.TestAuthentication("testuser_auto1", "wrongpassword"))
            {
                passedTests++;
                PrintSuccess("✓ Correctly rejected invalid password");
            }
            else
            {
                failedTests++;
                PrintError("✗ Should have rejected invalid password");
            }
            totalTests++;

            // Test Message Operations
            Console.WriteLine("\n[6] Testing Message Send (User to User)...");
            var msg1Id = await messageTester.SendMessage(user1Id!, user2Id!, "Hello from automation test!");
            if (msg1Id != null)
            {
                passedTests++;
                PrintSuccess($"✓ Message sent: {msg1Id}");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to send message");
            }
            totalTests++;

            Console.WriteLine("\n[7] Testing Self-Note...");
            var noteId = await messageTester.SendMessage(user1Id!, null, "This is a self-note");
            if (noteId != null)
            {
                passedTests++;
                PrintSuccess($"✓ Self-note created: {noteId}");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to create self-note");
            }
            totalTests++;

            Console.WriteLine("\n[8] Testing Load Conversation...");
            var messages = await messageTester.LoadConversation(user1Id!, user2Id!);
            if (messages != null && messages.Count > 0)
            {
                passedTests++;
                PrintSuccess($"✓ Loaded {messages.Count} message(s)");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to load conversation");
            }
            totalTests++;

            Console.WriteLine("\n[9] Testing Load Self-Notes...");
            var notes = await messageTester.LoadConversation(user1Id!, null);
            if (notes != null && notes.Count > 0)
            {
                passedTests++;
                PrintSuccess($"✓ Loaded {notes.Count} self-note(s)");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to load self-notes");
            }
            totalTests++;

            // Test File Attachments
            Console.WriteLine("\n[10] Testing Small File Attachment (< 3MB)...");
            var smallFileId = await fileTester.CreateSmallFileAttachment(user1Id!, user2Id!);
            if (smallFileId != null)
            {
                passedTests++;
                PrintSuccess($"✓ Small file attachment uploaded: {smallFileId}");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to upload small file");
            }
            totalTests++;

            Console.WriteLine("\n[11] Testing File Download...");
            if (await fileTester.DownloadAndVerifyFile(smallFileId!))
            {
                passedTests++;
                PrintSuccess("✓ File downloaded and verified successfully");
            }
            else
            {
                failedTests++;
                PrintError("✗ File download/verification failed");
            }
            totalTests++;

            Console.WriteLine("\n[12] Testing Large File Rejection (> 3MB)...");
            var largeFileId = await fileTester.CreateLargeFileAttachment(user1Id!, user2Id!);
            if (largeFileId == null)
            {
                passedTests++;
                PrintSuccess("✓ Correctly rejected file > 3MB");
            }
            else
            {
                failedTests++;
                PrintError("✗ Should have rejected file > 3MB");
            }
            totalTests++;

            Console.WriteLine("\n[13] Testing Various File Types...");
            var fileTypesResult = await fileTester.TestVariousFileTypes(user1Id!, user2Id!);
            if (fileTypesResult)
            {
                passedTests++;
                PrintSuccess("✓ All file types handled correctly");
            }
            else
            {
                failedTests++;
                PrintError("✗ Some file types failed");
            }
            totalTests++;

            // Test Database Constraints
            Console.WriteLine("\n[14] Testing Foreign Key Constraint...");
            var invalidMsg = await messageTester.SendMessage("invalid_user_id", user2Id!, "This should fail");
            if (invalidMsg == null)
            {
                passedTests++;
                PrintSuccess("✓ Correctly enforced foreign key constraint");
            }
            else
            {
                failedTests++;
                PrintError("✗ Should have rejected invalid SenderId");
            }
            totalTests++;

            // Test Empty Message
            Console.WriteLine("\n[15] Testing Empty Message...");
            var emptyMsg = await messageTester.SendMessage(user1Id!, user2Id!, "");
            if (emptyMsg != null) // Empty messages are allowed in database
            {
                passedTests++;
                PrintSuccess("✓ Empty message handling works");
            }
            else
            {
                failedTests++;
                PrintError("✗ Empty message test failed");
            }
            totalTests++;

            // Test User List
            Console.WriteLine("\n[16] Testing User List Retrieval...");
            var users = await tester.GetAllUsers();
            if (users != null && users.Count >= 2)
            {
                passedTests++;
                PrintSuccess($"✓ Retrieved {users.Count} user(s)");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to retrieve user list");
            }
            totalTests++;

            // Cleanup
            Console.WriteLine("\n[17] Cleaning Up Test Data...");
            if (await tester.CleanupTestData())
            {
                passedTests++;
                PrintSuccess("✓ Test data cleaned up successfully");
            }
            else
            {
                failedTests++;
                PrintError("✗ Cleanup failed (manual cleanup may be required)");
            }
            totalTests++;

            // ==================== NEW CRUD TESTS ====================

            // Test User CRUD Operations
            Console.WriteLine("\n[18] Testing User Create...");
            var crudUserId = await userTester.CreateUser("crud_test_user", "testpass123", "crud@test.com", "CRUD Test User", "admin", "QA Engineer", "Testing Squad");
            if (crudUserId != null)
            {
                passedTests++;
                PrintSuccess($"✓ User created: {crudUserId}");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to create user");
            }
            totalTests++;

            Console.WriteLine("\n[19] Testing User Edit...");
            if (crudUserId != null && await userTester.EditUser(crudUserId, role: "developer", position: "Senior Developer"))
            {
                passedTests++;
                PrintSuccess("✓ User edited successfully");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to edit user");
            }
            totalTests++;

            Console.WriteLine("\n[20] Testing User Get...");
            var retrievedUser = await userTester.GetUser(crudUserId!);
            if (retrievedUser != null && retrievedUser["role"].ToString() == "developer")
            {
                passedTests++;
                PrintSuccess("✓ User retrieved and verified");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to retrieve or verify user");
            }
            totalTests++;

            Console.WriteLine("\n[21] Testing User Delete...");
            if (crudUserId != null && await userTester.DeleteUser(crudUserId))
            {
                passedTests++;
                PrintSuccess("✓ User deleted successfully");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to delete user");
            }
            totalTests++;

            // Test Environment CRUD Operations
            Console.WriteLine("\n[22] Testing Environment Create...");
            var envId = await environmentTester.CreateEnvironment("Test Environment", "production", "https://test.example.com", "healthy", null, null, "Test environment description", "#00FF00");
            if (envId != null)
            {
                passedTests++;
                PrintSuccess($"✓ Environment created: {envId}");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to create environment");
            }
            totalTests++;

            Console.WriteLine("\n[23] Testing Environment Edit...");
            if (envId != null && await environmentTester.EditEnvironment(envId, health: "degraded", color: "#FFFF00"))
            {
                passedTests++;
                PrintSuccess("✓ Environment edited successfully");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to edit environment");
            }
            totalTests++;

            Console.WriteLine("\n[24] Testing Environment Get...");
            var retrievedEnv = await environmentTester.GetEnvironment(envId!);
            if (retrievedEnv != null && retrievedEnv["health"].ToString() == "degraded")
            {
                passedTests++;
                PrintSuccess("✓ Environment retrieved and verified");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to retrieve or verify environment");
            }
            totalTests++;

            // Test Credential CRUD Operations
            Console.WriteLine("\n[25] Testing Credential Create...");
            var credId = await credentialTester.CreateCredential("Test Credential", "testuser", "testpassword123", "TESTDOMAIN", "Test credential for automation");
            if (credId != null)
            {
                passedTests++;
                PrintSuccess($"✓ Credential created: {credId}");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to create credential");
            }
            totalTests++;

            Console.WriteLine("\n[26] Testing Credential Edit...");
            if (credId != null && await credentialTester.EditCredential(credId, username: "updated_user", domain: "UPDATED_DOMAIN"))
            {
                passedTests++;
                PrintSuccess("✓ Credential edited successfully");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to edit credential");
            }
            totalTests++;

            Console.WriteLine("\n[27] Testing Credential Get...");
            var retrievedCred = await credentialTester.GetCredential(credId!);
            if (retrievedCred != null && retrievedCred["username"].ToString() == "updated_user")
            {
                passedTests++;
                PrintSuccess("✓ Credential retrieved and verified");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to retrieve or verify credential");
            }
            totalTests++;

            // Test Server CRUD Operations with FK relationships
            Console.WriteLine("\n[28] Testing Server Create...");
            var serverId = await serverTester.CreateServer("Test Server", "192.168.1.100", 3389, envId, credId, "Test server for automation");
            if (serverId != null)
            {
                passedTests++;
                PrintSuccess($"✓ Server created with FK relationships: {serverId}");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to create server");
            }
            totalTests++;

            Console.WriteLine("\n[29] Testing Server Edit...");
            if (serverId != null && await serverTester.EditServer(serverId, host: "192.168.1.101", port: 3390, status: "maintenance"))
            {
                passedTests++;
                PrintSuccess("✓ Server edited successfully");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to edit server");
            }
            totalTests++;

            Console.WriteLine("\n[30] Testing Server Get...");
            var retrievedServer = await serverTester.GetServer(serverId!);
            if (retrievedServer != null && retrievedServer["host"].ToString() == "192.168.1.101")
            {
                passedTests++;
                PrintSuccess("✓ Server retrieved and verified");
            }
            else
            {
                failedTests++;
                PrintError("✗ Failed to retrieve or verify server");
            }
            totalTests++;

            Console.WriteLine("\n[31] Testing Server Foreign Key Constraint...");
            var invalidServerId = await serverTester.CreateServer("Invalid Server", "192.168.1.200", 3389, "invalid_env_id", credId, "Should fail");
            if (invalidServerId == null)
            {
                passedTests++;
                PrintSuccess("✓ Correctly enforced FK constraint on environment_id");
            }
            else
            {
                failedTests++;
                PrintError("✗ Should have rejected invalid environment_id");
            }
            totalTests++;

            // Cleanup CRUD test data
            Console.WriteLine("\n[32] Cleaning Up CRUD Test Data...");
            bool cleanupSuccess = true;
            if (serverId != null) cleanupSuccess &= await serverTester.DeleteServer(serverId);
            if (credId != null) cleanupSuccess &= await credentialTester.DeleteCredential(credId);
            if (envId != null) cleanupSuccess &= await environmentTester.DeleteEnvironment(envId);

            if (cleanupSuccess)
            {
                passedTests++;
                PrintSuccess("✓ CRUD test data cleaned up successfully");
            }
            else
            {
                failedTests++;
                PrintError("✗ CRUD cleanup had errors");
            }
            totalTests++;

        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"\n❌ FATAL ERROR: {ex.Message}");
            Console.WriteLine($"Stack Trace: {ex.StackTrace}");
            Console.ResetColor();
        }

        // Print Summary
        Console.WriteLine("\n═══════════════════════════════════════════════════════");
        Console.WriteLine("                   TEST SUMMARY");
        Console.WriteLine("═══════════════════════════════════════════════════════");
        Console.WriteLine($"Total Tests: {totalTests}");
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"Passed: {passedTests}");
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"Failed: {failedTests}");
        Console.ResetColor();
        Console.WriteLine($"Success Rate: {(totalTests > 0 ? (passedTests * 100.0 / totalTests):0):F2}%");
        Console.WriteLine("═══════════════════════════════════════════════════════");

        var ciMode = (Environment.GetEnvironmentVariable("ORBIS_CI") ?? "").Equals("1", StringComparison.OrdinalIgnoreCase);

        if (failedTests == 0)
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("\n🎉 ALL TESTS PASSED! 🎉");
            Console.ResetColor();
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"\n⚠️  {failedTests} TEST(S) FAILED");
            Console.ResetColor();
        }

        if (ciMode)
        {
            Environment.Exit(failedTests == 0 ? 0 : 1);
            return;
        }

        Console.WriteLine("\nPress any key to exit...");
        Console.ReadKey();
    }

    static DatabaseConfig GetDatabaseConfig()
    {
        // Environment-variable driven (non-interactive) mode support
        var envServer = Environment.GetEnvironmentVariable("ORBIS_DB_SERVER");
        var envDatabase = Environment.GetEnvironmentVariable("ORBIS_DB_NAME");
        var envAuth = Environment.GetEnvironmentVariable("ORBIS_DB_AUTH"); // "windows" or "sql"
        var envUser = Environment.GetEnvironmentVariable("ORBIS_DB_USER");
        var envPass = Environment.GetEnvironmentVariable("ORBIS_DB_PASS");

        if (!string.IsNullOrWhiteSpace(envServer) || !string.IsNullOrWhiteSpace(envAuth))
        {
            var cfg = new DatabaseConfig
            {
                Server = string.IsNullOrWhiteSpace(envServer) ? "localhost" : envServer!,
                Database = string.IsNullOrWhiteSpace(envDatabase) ? "OrbisHubDB" : envDatabase!,
                UseWindowsAuth = string.IsNullOrWhiteSpace(envAuth) || envAuth!.Equals("windows", StringComparison.OrdinalIgnoreCase),
                Username = envUser,
                Password = envPass
            };
            Console.WriteLine($"Using non-interactive DB config: Server={cfg.Server}, Database={cfg.Database}, UseWindowsAuth={cfg.UseWindowsAuth}");
            return cfg;
        }

        // Interactive prompts
        Console.WriteLine("Enter Database Configuration:");
        Console.Write("Server (default: localhost): ");
        var server = Console.ReadLine();
        if (string.IsNullOrWhiteSpace(server)) server = "localhost";

        Console.Write("Database (default: OrbisHubDB): ");
        var database = Console.ReadLine();
        if (string.IsNullOrWhiteSpace(database)) database = "OrbisHubDB";

        Console.Write("Use Windows Authentication? (Y/n): ");
        var useWindows = Console.ReadLine()?.ToLower() != "n";

        string? username = null;
        string? password = null;

        if (!useWindows)
        {
            Console.Write("Username: ");
            username = Console.ReadLine();
            Console.Write("Password: ");
            password = ReadPassword();
        }

        return new DatabaseConfig
        {
            Server = server!,
            Database = database!,
            UseWindowsAuth = useWindows,
            Username = username,
            Password = password
        };
    }

    static string ReadPassword()
    {
        var password = new StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(true);
            if (key.Key == ConsoleKey.Enter) break;
            if (key.Key == ConsoleKey.Backspace && password.Length > 0)
            {
                password.Remove(password.Length - 1, 1);
                Console.Write("\b \b");
            }
            else if (!char.IsControl(key.KeyChar))
            {
                password.Append(key.KeyChar);
                Console.Write("*");
            }
        }
        Console.WriteLine();
        return password.ToString();
    }

    static void PrintSuccess(string message)
    {
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine(message);
        Console.ResetColor();
    }

    static void PrintError(string message)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine(message);
        Console.ResetColor();
    }
}
