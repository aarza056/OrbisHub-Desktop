# OrbisHub Desktop - Automation Test Suite

## Overview
This is a comprehensive console application for automated testing of the OrbisHub Desktop application. It tests all major functionality including database operations, user authentication, messaging, and file attachments.

## Requirements
- .NET 8.0 SDK or later
- SQL Server (same instance used by OrbisHub Desktop)
- Database already created and migrated

## Installation

1. Navigate to the AutomationTests directory:
```bash
cd D:\OrbisDesktop\AutomationTests
```

2. Restore NuGet packages:
```bash
dotnet restore
```

3. Build the project:
```bash
dotnet build
```

## Running the Tests

```bash
dotnet run
```

You will be prompted to enter:
- Database server (default: localhost)
- Database name (default: OrbisHubDB)
- Authentication type (Windows or SQL Server)
- Username/Password (if using SQL Server auth)

### Non-Interactive Mode (CI-friendly)

Set environment variables to avoid prompts and return proper exit codes:

```powershell
$env:ORBIS_CI = "1"               # exits 0 on success, 1 on failures
$env:ORBIS_DB_SERVER = "localhost" # or your server
$env:ORBIS_DB_NAME = "OrbisHubDB"
# For Windows auth:
$env:ORBIS_DB_AUTH = "windows"
# Or for SQL auth:
# $env:ORBIS_DB_AUTH = "sql"; $env:ORBIS_DB_USER = "sa"; $env:ORBIS_DB_PASS = "yourpassword"

dotnet run --configuration Release
```

## Test Coverage

### 1. Database Connection (1 test)
- Tests basic connectivity to SQL Server

### 2. User Operations (3 tests)
- Create test users
- Test duplicate username rejection
- Test user authentication with valid credentials
- Test authentication rejection with invalid credentials

### 3. Message Operations (4 tests)
- Send message between users
- Create self-note (RecipientId = NULL)
- Load conversation between two users
- Load self-notes
- Test foreign key constraint enforcement
- Test empty message handling

### 4. File Attachment Operations (4 tests)
- Upload small file (< 3MB)
- Download and verify file integrity
- Test large file rejection (> 3MB)
- Test various file types (.png, .pdf, .docx, .xlsx, .zip, .mp3)

### 5. Data Retrieval (1 test)
- Retrieve user list

### 6. Cleanup (1 test)
- Clean up all test data

**Total: 17 automated tests**

## Test Data

The test suite creates temporary test data:
- Test users: `testuser_auto1`, `testuser_auto2`
- Test messages and file attachments
- All test data is automatically cleaned up at the end

## Expected Results

All tests should pass with:
- ✓ Green checkmarks for passed tests
- ✗ Red X marks for failed tests
- Final summary with pass/fail counts

### Success Criteria
```
Total Tests: 17
Passed: 17
Failed: 0
Success Rate: 100%

🎉 ALL TESTS PASSED! 🎉
```

## Troubleshooting

### Connection Errors
- Verify SQL Server is running
- Check connection string credentials
- Ensure database exists and is migrated

### Foreign Key Errors
- Ensure the database schema is up to date
- Check that Users and Messages tables exist

### File Upload Errors
- Verify AttachmentData column exists (VARBINARY(MAX))
- Check file size limits (3MB max)

### Cleanup Errors
- Some test data may remain if cleanup fails
- Manually delete users with username starting with `testuser_auto`

## Manual Cleanup (if needed)

If automatic cleanup fails, run this SQL:

```sql
-- Delete test messages
DELETE FROM [dbo].[Messages] 
WHERE SenderId IN (
    SELECT Id FROM [dbo].[Users] 
    WHERE Username LIKE 'testuser_auto%'
)
OR RecipientId IN (
    SELECT Id FROM [dbo].[Users] 
    WHERE Username LIKE 'testuser_auto%'
);

-- Delete test users
DELETE FROM [dbo].[Users] 
WHERE Username LIKE 'testuser_auto%';
```

## Extending the Tests

To add new tests:

1. Create a new tester class (e.g., `GroupChatTester.cs`)
2. Add test methods following the existing pattern
3. Call the new tests from `Program.cs`
4. Update test counts and summary

## CI Integration

This test suite can be integrated into CI workflows:

```yaml
# Example for GitHub Actions
- name: Run Automation Tests
  run: |
    cd AutomationTests
    dotnet test --logger "console;verbosity=detailed"
```

## Performance Notes

- Tests run sequentially (not parallel)
- Typical execution time: 10-30 seconds
- Database operations are not mocked (real integration tests)

## License

This test suite is part of the OrbisHub Desktop project.
