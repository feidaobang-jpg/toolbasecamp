param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue
if(!$nodeCommand){throw '未找到Node.js，请安装Node.js 22或更新版本。'}
$liveState=Join-Path $env:LOCALAPPDATA 'ChongchaoLive'
New-Item -ItemType Directory -Path $liveState -Force | Out-Null
$livePort=18765
$liveConfigFile=Join-Path $liveState 'config.json'
if(Test-Path -LiteralPath $liveConfigFile){$liveConfig=Get-Content -LiteralPath $liveConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json; $livePort=$liveConfig.port}
$liveUrl='http://127.0.0.1:'+$livePort
$listener=Get-NetTCPConnection -LocalPort $livePort -State Listen -ErrorAction SilentlyContinue
if(!$listener){
  Start-Process -FilePath $nodeCommand.Source -ArgumentList @(('"'+(Join-Path $taskRoot 'server.mjs')+'"')) -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $liveState 'runtime.log') -RedirectStandardError (Join-Path $liveState 'runtime-error.log') | Out-Null
  $liveReady=$false
  for($i=0;$i -lt 30;$i++){try{$probe=Invoke-WebRequest -UseBasicParsing -Uri $liveUrl -TimeoutSec 1;if($probe.StatusCode -eq 200){$liveReady=$true;break}}catch{Start-Sleep -Milliseconds 300}}
  if(!$liveReady){throw '直播服务没有成功启动，请查看本机runtime-error.log。'}
} else {
  $liveOwner=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener[0].OwningProcess)
  if($liveOwner.CommandLine -notlike '*starship-defense*live*server.mjs*'){throw '直播端口被其他程序占用，未修改其他程序。'}
}
$ollama=Join-Path $env:LOCALAPPDATA 'Programs/Ollama/ollama.exe'
if(Test-Path -LiteralPath $ollama){try{Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 1 | Out-Null}catch{Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden | Out-Null}}
Write-Host ('虫潮AI直播控制台：'+$liveUrl)
Write-Host ('OBS浏览器源：'+$liveUrl+'/html/game/starship-defense/live.html?capture=1')
Write-Host '启动器不会自动公开开播。B站身份码与推流配置由本人完成。'
if(!$NoBrowser){Start-Process -FilePath 'msedge.exe' -ArgumentList @($liveUrl) | Out-Null}
