# Point Windows docker CLI at Engine in WSL (no Docker Desktop).
# Requires: Ubuntu (or Ubuntu-24.04) with install-docker-engine-wsl.sh completed.
param(
    [string]$Distro = "Ubuntu-24.04",
    [string]$ContextName = "wsl-engine"
)

$ErrorActionPreference = "Stop"

$distros = (wsl -l -q) | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($distros -notcontains $Distro) {
    if ($distros -contains "Ubuntu") { $Distro = "Ubuntu" }
    else {
        Write-Host "WSL distro '$Distro' not found. Install first, e.g.: wsl --install -d Ubuntu-24.04"
        Write-Host "Installed: $($distros -join ', ')"
        exit 1
    }
}

# TCP via localhost (WSL port-forward). install-docker-engine-wsl-inline.sh exposes 127.0.0.1:2375.
$hostEndpoint = "tcp://127.0.0.1:2375"
$existing = docker context ls -q 2>$null
if ($existing -contains $ContextName) {
    docker context rm -f $ContextName | Out-Null
}
docker context create $ContextName --docker "host=$hostEndpoint" | Out-Null
docker context use $ContextName | Out-Null

$configPath = Join-Path $env:USERPROFILE ".docker\config.json"
$cfg = @{ auths = @{}; currentContext = $ContextName }
if (Test-Path $configPath) {
    try {
        $old = Get-Content $configPath -Raw | ConvertFrom-Json
        if ($old.auths) { $cfg.auths = $old.auths }
    } catch { }
}
[System.IO.File]::WriteAllText($configPath, ($cfg | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))

Write-Host "Active context: $ContextName ($hostEndpoint)"
docker version
