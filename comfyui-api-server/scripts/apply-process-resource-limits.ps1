# Apply CPU affinity / priority / optional NVIDIA power cap to a process (or current).
param(
    [int]$ProcessId = 0,
    [int]$CpuPercent = 90,
    [ValidateSet('idle', 'below_normal', 'normal')]
    [string]$Priority = 'below_normal',
    [int]$GpuPowerPercent = 0
)

$ErrorActionPreference = 'Stop'

function Get-CpuAffinityMask([int]$Percent) {
    $cores = [Environment]::ProcessorCount
    if ($cores -lt 1) { $cores = 4 }
    $use = [Math]::Max(1, [Math]::Floor($cores * $Percent / 100.0))
    if ($use -gt $cores) { $use = $cores }
    $mask = 0
    for ($i = 0; $i -lt $use; $i++) {
        $mask = $mask -bor [int64][Math]::Pow(2, $i)
    }
    return @{ Mask = $mask; Cores = $use; Total = $cores }
}

function Set-ThreadEnv([int]$Percent) {
    $aff = Get-CpuAffinityMask $Percent
    $t = [string]$aff.Cores
    $env:OMP_NUM_THREADS = $t
    $env:MKL_NUM_THREADS = $t
    $env:OPENBLAS_NUM_THREADS = $t
    $env:NUMEXPR_NUM_THREADS = $t
    $env:VECLIB_MAXIMUM_THREADS = $t
    return $aff
}

function Set-GpuPowerCap([int]$Percent) {
    if ($Percent -le 0 -or $Percent -gt 100) { return $null }
    $nvidia = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    if (-not $nvidia) { return $null }
    $line = & nvidia-smi --query-gpu=power.max_limit --format=csv,noheader,nounits 2>$null | Select-Object -First 1
    if (-not $line) { return $null }
    $maxW = [double]($line.ToString().Trim().Split(',')[0])
    if ($maxW -le 0) { return $null }
    $target = [Math]::Max(50, [Math]::Floor($maxW * $Percent / 100.0))
    & nvidia-smi -pl $target | Out-Null
    return @{ MaxW = $maxW; TargetW = $target }
}

$prioMap = @{
    idle         = [System.Diagnostics.ProcessPriorityClass]::Idle
    below_normal = [System.Diagnostics.ProcessPriorityClass]::BelowNormal
    normal       = [System.Diagnostics.ProcessPriorityClass]::Normal
}

$affInfo = Set-ThreadEnv $CpuPercent
$proc = if ($ProcessId -gt 0) { Get-Process -Id $ProcessId -ErrorAction Stop } else { Get-Process -Id $PID }

if ($prioMap.ContainsKey($Priority)) {
    $proc.PriorityClass = $prioMap[$Priority]
}
$proc.ProcessorAffinity = [IntPtr]$affInfo.Mask

$gpu = Set-GpuPowerCap $GpuPowerPercent
Write-Host ("[limits] PID={0} CPU~{1}% ({2}/{3} cores) priority={4}" -f $proc.Id, $CpuPercent, $affInfo.Cores, $affInfo.Total, $Priority)
if ($gpu) {
    Write-Host ("[limits] GPU power cap ~{0}W (max {1}W, {2}%)" -f $gpu.TargetW, $gpu.MaxW, $GpuPowerPercent)
}
