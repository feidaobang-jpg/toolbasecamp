# Keep NAS PDF + translate warm (JVM / models + Tunnel path). Run every 5 min via Task Scheduler.
$ErrorActionPreference = "SilentlyContinue"
$urls = @(
    "https://pdf.toolbasecamp.com/",
    "https://translate.toolbasecamp.com/"
)
foreach ($u in $urls) {
    $code = (curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 10 --max-time 60 $u)
    Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $u HTTP $code"
}
