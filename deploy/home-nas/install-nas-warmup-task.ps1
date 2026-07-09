# Register Windows Task Scheduler job: warm pdf + translate every 5 minutes
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script = Join-Path $Here "warm-nas-portals.ps1"
$TaskName = "ToolBasecamp-NAS-Portal-Warmup"

if (-not (Test-Path $Script)) { throw "Missing $Script" }

$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`""
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null
Write-Host "OK: scheduled task '$TaskName' (every 5 min)"
& $Script
