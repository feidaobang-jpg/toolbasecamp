param(
    [ValidateRange(7,365)][int]$Days = 90,
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$taskEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $taskEncoding
$OutputEncoding = $taskEncoding
$taskLines = & ssh -o BatchMode=yes -o ConnectTimeout=12 toolbasecamp-cn "sudo -n bash /opt/toolbasecamp-deploy/run-stock-job.sh --export --days $Days"
if ($LASTEXITCODE -ne 0) { throw '网站股票复盘导出失败，请核验SSH和后台服务。' }
$taskText = $taskLines -join [Environment]::NewLine
$taskData = $taskText | ConvertFrom-Json
if (-not $taskData.success -or -not $taskData.rules.version) { throw '网站未返回有效策略数据。' }
if ($OutputPath) {
    $taskFullPath = [System.IO.Path]::GetFullPath($OutputPath)
    $taskParent = [System.IO.Path]::GetDirectoryName($taskFullPath)
    [System.IO.Directory]::CreateDirectory($taskParent) | Out-Null
    [System.IO.File]::WriteAllText($taskFullPath,$taskText,$taskEncoding)
}
$taskText
