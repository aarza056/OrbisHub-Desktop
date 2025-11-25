# Patch to add to OrbisAgent.ps1
# Insert this after Get-MachineInfo function

function Get-SystemMetrics {
    try {
        $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
        $mem = Get-CimInstance -ClassName Win32_OperatingSystem
        $memPercent = [math]::Round((($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / $mem.TotalVisibleMemorySize) * 100, 1)
        $disk = Get-PSDrive C | Select-Object @{N='PercentUsed';E={[math]::Round(($_.Used / ($_.Used + $_.Free)) * 100, 1)}}
        
        return @{
            cpuPercent = [math]::Round($cpu, 1)
            memoryPercent = $memPercent
            diskPercent = $disk.PercentUsed
        }
    } catch {
        return @{ cpuPercent = 0; memoryPercent = 0; diskPercent = 0 }
    }
}

# Update Send-Heartbeat function to:
function Send-Heartbeat {
    if (-not $script:AgentId) { return $false }

    $metrics = Get-SystemMetrics
    $body = @{
        agentVersion = $script:AgentVersion
        currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        metadata = ($metrics | ConvertTo-Json -Compress)
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$script:CoreServiceUrl/api/agents/$script:AgentId/heartbeat" `
            -Method Post `
            -Body $body `
            -ContentType "application/json"

        Write-Log "Heartbeat sent successfully" "DEBUG"
        return $true
    } catch {
        Write-Log "Failed to send heartbeat: $_" "ERROR"
        return $false
    }
}
