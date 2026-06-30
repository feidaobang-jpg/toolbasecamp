# Manual deploy from Windows (PowerShell) to DigitalOcean
# Usage:
#   $env:DO_HOST = "134.209.221.228"
#   $env:DO_USER = "root"
#   .\deploy.ps1

param(
    [string]$ServerHost = $env:DO_HOST,
    [string]$User = $env:DO_USER,
    [string]$RemotePath = "/var/www/toolbasecamp"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PublicDir = Join-Path (Split-Path $ScriptDir -Parent) "public"

if (-not $ServerHost) { throw "Set DO_HOST or pass -ServerHost" }
if (-not $User) { $User = "root" }
if (-not (Test-Path $PublicDir)) { throw "Missing $PublicDir" }

Write-Host "Deploying $PublicDir -> ${User}@${ServerHost}:${RemotePath}"

# Requires OpenSSH client (Windows 10+): scp -r
scp -r "$PublicDir\*" "${User}@${ServerHost}:${RemotePath}/"

Write-Host "Reload nginx..."
ssh "${User}@${ServerHost}" "nginx -t && systemctl reload nginx"

Write-Host "Done. Visit http://${ServerHost} or https://toolbasecamp.com"
