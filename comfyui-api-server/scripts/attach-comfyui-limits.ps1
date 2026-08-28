# Attach resource caps to ComfyUI already listening on 8188 (no restart).
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (Test-Path (Join-Path $scriptDir '..\local.env')) {
    Get-Content (Join-Path $scriptDir '..\local.env') -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        Set-Item -Path ("Env:" + $line.Substring(0, $idx).Trim()) -Value $line.Substring($idx + 1).Trim()
    }
}

$cpuPct = 75
if ($env:COMFYUI_RESOURCE_CPU_PERCENT) { [void][int]::TryParse($env:COMFYUI_RESOURCE_CPU_PERCENT, [ref]$cpuPct) }
$prio = if ($env:COMFYUI_PROCESS_PRIORITY) { $env:COMFYUI_PROCESS_PRIORITY } else { 'below_normal' }
$gpuPct = 0
if ($env:COMFYUI_RESOURCE_GPU_POWER_PERCENT) { [void][int]::TryParse($env:COMFYUI_RESOURCE_GPU_POWER_PERCENT, [ref]$gpuPct) }

$pid = $null
netstat -ano | Select-String ':8188' | Select-String 'LISTENING' | ForEach-Object {
    $parts = ($_.Line -replace '\s+', ' ').Trim().Split(' ')
    if ($parts.Length -ge 5) { $pid = [int]$parts[-1] }
}
if (-not $pid) {
    Write-Host '[ERROR] Nothing listening on port 8188'
    exit 1
}

& (Join-Path $scriptDir 'apply-process-resource-limits.ps1') -ProcessId $pid -CpuPercent $cpuPct -Priority $prio -GpuPowerPercent $gpuPct
