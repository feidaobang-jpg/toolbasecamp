# Run once as the Windows user who owns the Ubuntu-24.04 distribution.
$ErrorActionPreference = 'Stop'
$taskName = 'ToolBasecamp-WSL-NAS-KeepAlive'
$runnerPath = Join-Path $PSScriptRoot 'keep-wsl-nas-alive.ps1'
if (-not (Test-Path -LiteralPath $runnerPath)) { throw "Missing $runnerPath" }
$accountName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$loginTrigger = New-ScheduledTaskTrigger -AtLogOn -User $accountName
# No duration means indefinite repetition. IgnoreNew prevents duplicate workers.
# RestartOnFailure alone did not recover a terminated Windows supervisor.
$retryTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    $backupDir = Join-Path $env:LOCALAPPDATA 'ToolBasecamp'
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Export-ScheduledTask -TaskName $taskName | Set-Content -Path (Join-Path $backupDir ('keepalive-task-' + (Get-Date -Format yyyyMMdd-HHmmss) + '.xml')) -Encoding Unicode
    Set-ScheduledTask -TaskName $taskName -Trigger @($loginTrigger, $retryTrigger) | Out-Null
} else {
    $action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runnerPath + '"')
    $principal = New-ScheduledTaskPrincipal -UserId $accountName -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($loginTrigger, $retryTrigger) -Principal $principal -Settings $settings -Description 'Keep WSL NAS online; check every minute and start the supervisor if stopped.' | Out-Null
}
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
