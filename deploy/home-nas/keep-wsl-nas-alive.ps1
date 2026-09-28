# A foreground WSL client keeps the distro alive. Launch this script hidden.
$ErrorActionPreference = 'Continue'
$mutex = New-Object System.Threading.Mutex($false, 'Local\ToolBasecamp-WslNasKeepAlive')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); exit 0 }
$logDir = Join-Path $env:LOCALAPPDATA 'ToolBasecamp'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir 'wsl-nas-keepalive.log'
try {
    while ($true) {
        if ((Test-Path $logPath) -and (Get-Item $logPath).Length -gt 5MB) {
            Move-Item -LiteralPath $logPath -Destination "$logPath.1" -Force
        }
        Add-Content -Path $logPath -Value "$(Get-Date -Format o) Starting WSL NAS watchdog"
        # Synchronous by design: retain a Windows client while the watchdog runs.
        & "$env:WINDIR\System32\wsl.exe" -d Ubuntu-24.04 -u root -- bash /mnt/d/project/toolbasecamp/deploy/home-nas/wsl-tunnel-watchdog.sh 2>&1 | Out-File -FilePath $logPath -Append -Encoding utf8
        Add-Content -Path $logPath -Value "$(Get-Date -Format o) WSL client exited ($LASTEXITCODE); retrying in 15 seconds"
        Start-Sleep -Seconds 15
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
