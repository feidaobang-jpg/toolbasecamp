# Start ComfyUI main with shared-PC resource caps (CPU affinity, priority, optional GPU power).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Import-LocalEnv {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        if ($key) { Set-Item -Path "Env:$key" -Value $val }
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-LocalEnv (Join-Path $scriptDir '..\local.env')

if (-not $env:COMFYUI_ROOT) { $env:COMFYUI_ROOT = 'D:\sd\ComfyUI-main' }
$root = $env:COMFYUI_ROOT
$venvPy = Join-Path $root 'venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { $venvPy = Join-Path $root '.venv\Scripts\python.exe' }
$mainPy = Join-Path $root 'main.py'

if (-not (Test-Path $mainPy)) {
    Write-Host "[ERROR] ComfyUI not found: $mainPy"
    exit 1
}
if (-not (Test-Path $venvPy)) {
    Write-Host "[ERROR] venv missing under $root"
    exit 1
}

try {
    $null = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/system_stats' -TimeoutSec 3 -UseBasicParsing
    Write-Host '[INFO] ComfyUI already running at http://127.0.0.1:8188'
    exit 0
} catch {}

$cpuPct = 75
if ($env:COMFYUI_RESOURCE_CPU_PERCENT) {
    [void][int]::TryParse($env:COMFYUI_RESOURCE_CPU_PERCENT, [ref]$cpuPct)
}
$cpuPct = [Math]::Max(50, [Math]::Min(100, $cpuPct))
$prio = if ($env:COMFYUI_PROCESS_PRIORITY) { $env:COMFYUI_PROCESS_PRIORITY } else { 'below_normal' }
$gpuPct = 0
if ($env:COMFYUI_RESOURCE_GPU_POWER_PERCENT) {
    [void][int]::TryParse($env:COMFYUI_RESOURCE_GPU_POWER_PERCENT, [ref]$gpuPct)
}
$limitOff = ($env:COMFYUI_RESOURCE_LIMIT -eq '0')

Write-Host "ComfyUI root: $root"
Write-Host "Listen: 127.0.0.1:8188"
if (-not $limitOff) {
    Write-Host "Resource cap: CPU~${cpuPct}% cores, priority=$prio$(if ($gpuPct -gt 0) { ", GPU power~${gpuPct}%" } else { '' })"
}
Write-Host 'Press Ctrl+C to stop'
Write-Host ''

$args = @($mainPy, '--listen', '127.0.0.1', '--port', '8188')
if ($env:COMFYUI_EXTRA_ARGS) {
    $args += ($env:COMFYUI_EXTRA_ARGS -split '\s+')
}

$proc = Start-Process -FilePath $venvPy -ArgumentList $args -WorkingDirectory $root -PassThru -NoNewWindow

if (-not $limitOff) {
    & (Join-Path $scriptDir 'apply-process-resource-limits.ps1') -ProcessId $proc.Id -CpuPercent $cpuPct -Priority $prio -GpuPowerPercent $gpuPct
}

try {
    Wait-Process -Id $proc.Id
} finally {
    if ($gpuPct -gt 0 -and (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
        & nvidia-smi -rac 2>$null | Out-Null
    }
}
