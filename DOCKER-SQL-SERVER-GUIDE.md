# Docker SQL Server Connection Guide

## Common Issues with Docker SQL Server

When connecting to SQL Server running in Docker, you may encounter several issues:

### 1. **Certificate Trust Issues** ✓ MOST COMMON
Docker SQL Server often uses self-signed certificates which causes connection failures.

**Solution:** Enable "Trust Server Certificate" in the setup wizard (already checked by default).

### 2. **Port Mapping**
Docker containers typically map SQL Server port 1433 to a host port.

**Correct Server Address Format:**
```
localhost,1433          ← Default Docker mapping
localhost,14333         ← If mapped to different port
host.docker.internal    ← From inside another container
```

**Note:** Use comma (`,`) not backslash (`\`) for port numbers!

### 3. **SQL Server Authentication Required**
Docker SQL Server typically uses SQL authentication, not Windows authentication.

**Setup:**
- Authentication Type: `SQL Server Authentication`
- Username: `sa` (default admin user)
- Password: The password you set when creating the container

### 4. **Network Isolation**
Docker containers may be on isolated networks.

**Check:**
```powershell
# Verify SQL Server is listening
docker ps | Select-String "1433"

# Test port connectivity
Test-NetConnection -ComputerName localhost -Port 1433
```

### 5. **Encryption Settings**
Docker SQL Server may have different encryption requirements.

**Recommended Settings:**
- ✅ Trust Server Certificate: **CHECKED** (required)
- ⬜ Encrypt Connection: **UNCHECKED** (unless you configured SSL)

---

## Quick Setup for Docker SQL Server

### Step 1: Get Your Docker SQL Server Details

```powershell
# List running containers
docker ps

# Check SQL Server port mapping
docker port <container-name>
```

### Step 2: Configure OrbisHub

1. **SQL Server Address:** `localhost,1433` (or your mapped port)
2. **Database Name:** `OrbisHub`
3. **Authentication Type:** `SQL Server Authentication`
4. **Username:** `sa`
5. **Password:** Your SA password
6. **Trust Server Certificate:** ✅ CHECKED
7. **Encrypt Connection:** ⬜ UNCHECKED

### Step 3: Test Connection

Click "Test Connection" in the setup wizard.

**If it fails, check:**
```powershell
# 1. Is SQL Server container running?
docker ps | Select-String "mssql"

# 2. Can you reach the port?
Test-NetConnection -ComputerName localhost -Port 1433

# 3. Are credentials correct?
docker exec -it <container-name> /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "<password>"
```

---

## Common Error Messages & Solutions

### ❌ "Login failed for user 'sa'"
- **Cause:** Wrong password or user doesn't exist
- **Fix:** Verify SA password or create SQL user in Docker container

### ❌ "A connection was successfully established... but then an error occurred"
- **Cause:** Certificate trust issue
- **Fix:** Enable "Trust Server Certificate"

### ❌ "Could not open a connection to SQL Server"
- **Cause:** Port not accessible or container not running
- **Fix:** Check `docker ps` and port mapping

### ❌ "Network-related or instance-specific error"
- **Cause:** Wrong server address or firewall blocking
- **Fix:** Use `localhost,1433` format (comma, not backslash)

---

## Sample Docker SQL Server Setup

If you need to create a new SQL Server container:

```powershell
# Create and run SQL Server 2022 in Docker
docker run -e "ACCEPT_EULA=Y" `
  -e "SA_PASSWORD=YourStrong@Password123" `
  -e "MSSQL_PID=Developer" `
  -p 1433:1433 `
  --name sql-server-2022 `
  -d mcr.microsoft.com/mssql/server:2022-latest

# Verify it's running
docker ps

# Test connection
docker exec -it sql-server-2022 /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "YourStrong@Password123"
```

Then in OrbisHub:
- Server: `localhost,1433`
- Auth: `SQL Server Authentication`
- User: `sa`
- Password: `YourStrong@Password123`
- Trust Cert: ✅

---

## Troubleshooting Checklist

- [ ] Container is running (`docker ps`)
- [ ] Port 1433 is mapped correctly
- [ ] Using **SQL Server Authentication** (not Windows Auth)
- [ ] Server address uses **comma** for port: `localhost,1433`
- [ ] **Trust Server Certificate** is checked
- [ ] SA password is correct
- [ ] Firewall allows localhost:1433
- [ ] No other SQL Server using port 1433

---

## Advanced: Custom Port Mapping

If your Docker SQL Server uses a different port (e.g., 14333):

```powershell
# Docker run with custom port
docker run -p 14333:1433 ...
```

OrbisHub Setup:
- Server Address: `localhost,14333`
- Everything else stays the same

---

## Still Having Issues?

1. **Check Docker logs:**
   ```powershell
   docker logs <container-name>
   ```

2. **Verify SQL Server is accepting connections:**
   ```powershell
   docker exec -it <container-name> /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "<password>" -Q "SELECT @@VERSION"
   ```

3. **Test from Windows:**
   ```powershell
   # Install SQL tools if needed
   sqlcmd -S localhost,1433 -U sa -P "<password>" -Q "SELECT @@VERSION"
   ```

4. **Check OrbisHub Developer Console (F12)** for detailed error messages

---

## Why Docker SQL Server is Different

Unlike traditional SQL Server installations:

1. **No Windows Authentication** - Docker containers don't integrate with Windows auth
2. **Self-signed certificates** - Always requires trust server certificate
3. **Port mapping** - Uses Docker's port forwarding
4. **Network isolation** - May need special network configuration
5. **No SQLEXPRESS instance name** - Use port numbers instead

---

## Best Practices

✅ **Do:**
- Use SQL Server Authentication
- Trust server certificate for local development
- Use `localhost,1433` format
- Check Docker container is running before connecting
- Use strong SA passwords

❌ **Don't:**
- Use Windows Authentication with Docker SQL Server
- Use instance names like `\SQLEXPRESS`
- Forget to map port 1433
- Leave encryption enabled without proper SSL setup
- Use weak passwords for SA account
