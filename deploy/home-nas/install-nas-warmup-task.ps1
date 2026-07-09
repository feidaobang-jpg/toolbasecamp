# Register Windows Task Scheduler job: warm pdf + translate every 5 minutes
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script = Join-Path $Here "warm-nas-portals.ps1"
$TaskName = "ToolBasecamp-NAS-Portal-Warmup"

if (-not (Test-Path $Script)) { throw "Missing $Script" }

# schtasks avoids PowerShell RepetitionDuration limits (MaxValue → XML error 0x80041318)
$Tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Script`""
schtasks /Create /TN $TaskName /TR $Tr /SC MINUTE /MO 5 /F | Out-Null

Write-Host "OK: scheduled task '$TaskName' (every 5 min)"
& $Script
