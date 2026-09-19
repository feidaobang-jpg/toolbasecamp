# Restore home-nas stack on WSL Docker Engine (after setup-docker-context-wsl.ps1).
param(
    [string]$BackupTar = "",
    [string]$ComposeDir = "D:\project\toolbasecamp\deploy\home-nas"
)

$ErrorActionPreference = "Stop"
Set-Location $ComposeDir

if (-not $BackupTar) {
    $dir = Join-Path $ComposeDir "migration-backup"
    if (Test-Path $dir) {
        $BackupTar = (Get-ChildItem $dir -Filter "stirling-data-*.tar.gz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
    }
}

if ($BackupTar -and (Test-Path $BackupTar)) {
    Write-Host "Restoring volume from $BackupTar"
    docker volume create home-nas_stirling-data | Out-Null
    docker run --rm `
        -v home-nas_stirling-data:/volume `
        -v "${BackupTar}:/backup/stirling-data.tar.gz:ro" `
        nginx:1.27-alpine sh -c "tar xzf /backup/stirling-data.tar.gz -C /volume"
} else {
    Write-Host "No backup tar found; compose will create an empty stirling-data volume."
}

$Distro = "Ubuntu-24.04"
$wslDistros = (wsl -l -q) | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($wslDistros -notcontains $Distro -and $wslDistros -contains "Ubuntu") { $Distro = "Ubuntu" }

$wslComposeDir = "/mnt/d/project/toolbasecamp/deploy/home-nas"
Write-Host "Pulling images and starting stack in WSL ($Distro) — bind mounts need Linux paths..."
wsl -d $Distro -e bash -lc "set -e; cd '$wslComposeDir'; docker compose pull; docker compose up -d; docker compose ps"
