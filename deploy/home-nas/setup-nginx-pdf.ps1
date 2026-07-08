# Generate nginx-pdf.conf from template + portal inject snippet
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Template = Join-Path $Here "nginx-pdf.conf.template"
$SnippetPath = Join-Path $Here "..\pdf-portal-inject.snippet"
$Out = Join-Path $Here "nginx-pdf.conf"

if (-not (Test-Path $Template)) { throw "Missing $Template" }
if (-not (Test-Path $SnippetPath)) { throw "Missing $SnippetPath" }

$snippet = (Get-Content $SnippetPath -Raw).Trim() -replace "`r`n|`n", ""
if ($snippet -match "'") { throw "Inject snippet must not contain single quotes" }

$text = Get-Content $Template -Raw
if ($text -notmatch "PDF_HEAD_INJECT") { throw "Template missing PDF_HEAD_INJECT placeholder" }

$text = $text.Replace("PDF_HEAD_INJECT", $snippet)
[System.IO.File]::WriteAllText($Out, $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: wrote $Out"
