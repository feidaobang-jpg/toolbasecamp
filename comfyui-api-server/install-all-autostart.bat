@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "ROOT=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if exist "%ROOT%local.env" (
  for /f "usebackq eol=# delims=" %%L in ("%ROOT%local.env") do (
    for /f "tokens=1,* delims==" %%A in ("%%L") do (
      if not "%%~A"=="" set "%%~A=%%B"
    )
  )
)

if not exist "%ROOT%scripts\run-comfyui-hidden.vbs" (
  echo [ERROR] Missing scripts\run-comfyui-hidden.vbs
  exit /b 1
)
copy /Y "%ROOT%scripts\run-comfyui-hidden.vbs" "%STARTUP%\ComfyUI-Main.vbs" >nul
echo [OK] ComfyUI-Main.vbs

if not exist "%ROOT%start-server-hidden.vbs" (
  echo [ERROR] Missing start-server-hidden.vbs
  exit /b 1
)
copy /Y "%ROOT%start-server-hidden.vbs" "%STARTUP%\ComfyUI-API-Server.vbs" >nul
echo [OK] ComfyUI-API-Server.vbs
echo.
echo Both autostart entries installed in:
echo   %STARTUP%
echo ComfyUI path: default D:\sd\ComfyUI-main ^(override COMFYUI_MAIN_DIR in local.env^)
endlocal
