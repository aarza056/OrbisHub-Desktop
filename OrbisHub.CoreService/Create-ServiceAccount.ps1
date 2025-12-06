# Create dedicated service account for OrbisHub CoreService
# Run this script as Administrator

param(
    [string]$Username = "OrbisHub.Service",
    [string]$WindowsPassword = $null,
    [string]$SqlUsername = "usr/orbisadmin",
    [string]$SqlPassword = $null,
    [string]$DatabaseServer = $null,
    [string]$DatabaseName = "OrbisHub"
)

# Prompt for database server if not provided
if (-not $DatabaseServer) {
    Write-Host ""
    Write-Host "Enter SQL Server instance (e.g., localhost\ORBISDB or ServerName\InstanceName):" -ForegroundColor Cyan
    $DatabaseServer = Read-Host "Database Server"
    if ([string]::IsNullOrWhiteSpace($DatabaseServer)) {
        Write-Host "Error: Database server cannot be empty" -ForegroundColor Red
        exit 1
    }
}

# Prompt for SQL password if not provided
if (-not $SqlPassword) {
    Write-Host ""
    Write-Host "Enter password for SQL login '$SqlUsername':" -ForegroundColor Cyan
    $SqlPasswordSecure = Read-Host "SQL Password" -AsSecureString
    $SqlPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SqlPasswordSecure))
    if ([string]::IsNullOrWhiteSpace($SqlPassword)) {
        Write-Host "Error: SQL password cannot be empty" -ForegroundColor Red
        exit 1
    }
}

# Generate secure password for Windows account if not provided
if (-not $WindowsPassword) {
    Add-Type -AssemblyName 'System.Web'
    $WindowsPassword = [System.Web.Security.Membership]::GeneratePassword(16, 4)
}

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Database Server: $DatabaseServer" -ForegroundColor White
Write-Host "  Database Name: $DatabaseName" -ForegroundColor White
Write-Host "  SQL Login: $SqlUsername (using existing login)" -ForegroundColor White
Write-Host "  Windows Service Account: $Username" -ForegroundColor White
Write-Host ""
Write-Host "Generated Windows Account Password:" -ForegroundColor Yellow
Write-Host "  $WindowsPassword" -ForegroundColor Yellow
Write-Host "SAVE THIS PASSWORD!" -ForegroundColor Red
Write-Host ""

$SecurePassword = ConvertTo-SecureString $WindowsPassword -AsPlainText -Force

Write-Host "Creating local user account: $Username" -ForegroundColor Cyan

# Create local user account
try {
    $userExists = Get-LocalUser -Name $Username -ErrorAction SilentlyContinue
    if ($userExists) {
        Write-Host "User already exists, updating password..." -ForegroundColor Yellow
        Set-LocalUser -Name $Username -Password $SecurePassword
    } else {
        New-LocalUser -Name $Username -Password $SecurePassword -FullName "OrbisHub Core Service Account" -Description "Service account for OrbisHub Core Service" -PasswordNeverExpires -UserMayNotChangePassword
        Write-Host "[OK] User created successfully" -ForegroundColor Green
    }
} catch {
    Write-Host "[ERROR] Failed to create user: $_" -ForegroundColor Red
    exit 1
}

# Grant "Log on as a service" right
Write-Host "Granting 'Log on as a service' right..." -ForegroundColor Cyan
try {
    $tempPath = "$env:TEMP\grant_logon_service.inf"
    $dbPath = "$env:TEMP\secedit.sdb"
    
    secedit /export /cfg $tempPath /quiet
    
    $content = Get-Content $tempPath
    $newContent = @()
    $userSID = (New-Object System.Security.Principal.NTAccount($Username)).Translate([System.Security.Principal.SecurityIdentifier]).Value
    
    foreach ($line in $content) {
        if ($line -match "SeServiceLogonRight") {
            if ($line -notmatch $userSID) {
                $line = $line.TrimEnd() + ",*$userSID"
            }
        }
        $newContent += $line
    }
    
    $newContent | Set-Content $tempPath
    secedit /configure /db $dbPath /cfg $tempPath /quiet
    Remove-Item $tempPath, $dbPath -Force -ErrorAction SilentlyContinue
    
    Write-Host "[OK] Service logon right granted" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Failed to grant service logon right: $_" -ForegroundColor Red
}

# Grant SQL Server permissions
Write-Host "Verifying SQL Server login '$SqlUsername'..." -ForegroundColor Cyan

# Check if SqlServer module is installed, install if needed
if (-not (Get-Module -ListAvailable -Name SqlServer)) {
    Write-Host "SqlServer PowerShell module not found. Installing..." -ForegroundColor Yellow
    try {
        Install-Module -Name SqlServer -Force -AllowClobber -Scope CurrentUser -ErrorAction Stop
        Write-Host "[OK] SqlServer module installed" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Failed to install SqlServer module: $_" -ForegroundColor Red
        Write-Host "Please install manually: Install-Module -Name SqlServer" -ForegroundColor Yellow
        Write-Host "Skipping SQL verification..." -ForegroundColor Yellow
        $skipSql = $true
    }
}

if (-not $skipSql) {
    try {
        Import-Module SqlServer -ErrorAction Stop
        
        # Test SQL login by attempting to connect
        $testQuery = "SELECT SYSTEM_USER AS CurrentLogin, DB_NAME() AS CurrentDatabase;"
        $result = Invoke-Sqlcmd -ServerInstance $DatabaseServer -Database $DatabaseName -Username $SqlUsername -Password $SqlPassword -Query $testQuery -ErrorAction Stop
        
        Write-Host "[OK] SQL login verified successfully" -ForegroundColor Green
        Write-Host "    Logged in as: $($result.CurrentLogin)" -ForegroundColor Gray
        Write-Host "    Database: $($result.CurrentDatabase)" -ForegroundColor Gray
    } catch {
        Write-Host "[ERROR] Failed to connect with SQL login: $_" -ForegroundColor Red
        Write-Host "Please verify the SQL login '$SqlUsername' exists and the password is correct" -ForegroundColor Yellow
    }
}

# Grant folder permissions
Write-Host "Granting folder permissions..." -ForegroundColor Cyan
try {
    # Use the actual script directory
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $servicePath = Join-Path $scriptDir "publish"
    
    if (Test-Path $servicePath) {
        $acl = Get-Acl $servicePath
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule("$env:COMPUTERNAME\$Username", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.SetAccessRule($accessRule)
        Set-Acl $servicePath $acl
        
        Write-Host "[OK] Folder permissions granted" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Publish folder not found at: $servicePath" -ForegroundColor Yellow
        Write-Host "  Run 'dotnet publish' first or the service may not start" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[ERROR] Failed to grant folder permissions: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Service Account Created Successfully!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Windows Service Account:" -ForegroundColor Cyan
Write-Host "  Account: $env:COMPUTERNAME\$Username" -ForegroundColor White
Write-Host "  Password: $WindowsPassword" -ForegroundColor Yellow
Write-Host ""
Write-Host "SQL Server Authentication:" -ForegroundColor Cyan
Write-Host "  Username: $SqlUsername" -ForegroundColor White
Write-Host "  Password: ********** (you entered this)" -ForegroundColor White
Write-Host "  Server: $DatabaseServer" -ForegroundColor White
Write-Host "  Database: $DatabaseName" -ForegroundColor White
Write-Host ""
Write-Host "Connection String:" -ForegroundColor Cyan
Write-Host "  Server=$DatabaseServer;Database=$DatabaseName;User Id=$SqlUsername;Password=YOUR_PASSWORD;TrustServerCertificate=True;" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Save the Windows account password: $WindowsPassword" -ForegroundColor White
Write-Host "2. Update appsettings.json with the connection string (use your SQL password)" -ForegroundColor White
Write-Host "3. Update the service to use the Windows account:" -ForegroundColor White
Write-Host "   sc.exe config `"OrbisHub.CoreService`" obj= `"$env:COMPUTERNAME\$Username`" password= `"$WindowsPassword`"" -ForegroundColor Gray
Write-Host "4. Restart the service:" -ForegroundColor White
Write-Host "   Restart-Service -Name 'OrbisHub.CoreService'" -ForegroundColor Gray
Write-Host ""
