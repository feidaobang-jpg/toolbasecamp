@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Home-PC services  ^|  ComfyUI :8188  +  API :5000
cd /d "%~dp0"

echo ==========================================================
echo   Home-PC services launcher
echo     ComfyUI   http://127.0.0.1:8188   (background, hidden)
echo     API       http://127.0.0.1:5000   (this window)
echo   Web admin   http://zhengxiaohui.cn/html/admin/
echo ==========================================================
echo.

rem ---------- load local.env ----------
if exist "%~dp0local.env" (
  for /f "usebackq eol=# delims=" %%L in ("%~dp0local.env") do (
    for /f "tokens=1,* delims==" %%A in ("%%L") do (
      if not "%%~A"=="" set "%%~A=%%B"
    )
  )
)

rem ---------- ffmpeg (MuseTalk / Wav2Lip need it) ----------
if exist "D:\sd\ffmpeg\bin\ffmpeg.exe" set "PATH=D:\sd\ffmpeg\bin;%PATH%"

rem ---------- 1) ComfyUI ----------
call :probe 8188 /system_stats
if "!ALIVE!"=="1" (
  echo [1/2] ComfyUI already running on :8188
) else (
  echo [1/2] Starting ComfyUI in background ...
  start "" wscript.exe "%~dp0scripts\run-comfyui-hidden.vbs"
  call :wait 8188 /system_stats 180 "ComfyUI"
  if "!OK!"=="0" (
    echo.
    echo [ERROR] ComfyUI did not come up on :8188 within 3 minutes.
    echo         Start it manually:  D:\sd\ComfyUI-main\run_comfyui.bat
    echo.
    pause
    exit /b 1
  )
)

rem ---------- 2) API server ----------
call :probe 5000 /health
if "!ALIVE!"=="1" (
  echo [2/2] API already running on :5000
  echo.
  echo Nothing to do. Open the admin site: http://zhengxiaohui.cn/html/admin/
  echo.
  pause
  exit /b 0
)

echo [2/2] Starting API server on :5000 ...
echo.
call "%~dp0start-server.bat" hidden
exit /b %ERRORLEVEL%

rem ================= helpers =================
:probe
rem %1=port %2=path  ->  sets ALIVE=1/0
set "ALIVE=0"
for /f "usebackq tokens=*" %%R in (`powershell -NoProfile -Command "try{ $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:%1%2'; if($r.StatusCode -eq 200){'1'}else{'0'} }catch{'0'}"`) do set "ALIVE=%%R"
exit /b 0

:wait
rem %1=port %2=path %3=timeout_sec %4=label  ->  sets OK=1/0
set "OK=0"
set /a _ELAPSED=0
:wait_loop
call :probe %1 %2
if "!ALIVE!"=="1" (
  set "OK=1"
  echo        %4 is up ^(after !_ELAPSED!s^)
  exit /b 0
)
timeout /t 5 /nobreak >nul
set /a _ELAPSED+=5
if !_ELAPSED! GEQ %3 exit /b 0
goto wait_loop
