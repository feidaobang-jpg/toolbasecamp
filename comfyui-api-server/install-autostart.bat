@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "DEST=%STARTUP%\ComfyUI-API-Server.vbs"

if not exist "%~dp0start-server-hidden.vbs" (
  echo [ERROR] start-server-hidden.vbs not found in %~dp0
  pause
  exit /b 1
)

copy /Y "%~dp0start-server-hidden.vbs" "%DEST%" >nul
if errorlevel 1 (
  echo [ERROR] Failed to copy to Startup folder.
  pause
  exit /b 1
)

echo OK: Autostart installed:
echo   %DEST%
echo.
echo comfyui-api-server will run in background on logon.
echo ComfyUI must also be running on port 8188 - start it separately or add its own autostart.
pause
endlocal
