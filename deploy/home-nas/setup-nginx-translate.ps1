# Generate nginx-translate.conf from template + inject snippets
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Template = Join-Path $Here "nginx-translate.conf.template"
$HeadPath = Join-Path $Here "..\chef-portal-inject.snippet"
$Out = Join-Path $Here "nginx-translate.conf"
$BodyInject = '<script src="/translate-ui-patch.js?v=13"></script>'

if (-not (Test-Path $Template)) { throw "Missing $Template" }
if (-not (Test-Path $HeadPath)) { throw "Missing $HeadPath" }

$head = (Get-Content $HeadPath -Raw).Trim() -replace "`r`n|`n", ""
if ($head -match "'") { throw "Head inject must not contain single quotes" }
if ($BodyInject -match "'") { throw "Body inject must not contain single quotes" }

$text = Get-Content $Template -Raw
$text = $text.Replace("TRANSLATE_HEAD_INJECT", $head)
$text = $text.Replace("TRANSLATE_BODY_INJECT", $BodyInject)
[System.IO.File]::WriteAllText($Out, $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: wrote $Out"
