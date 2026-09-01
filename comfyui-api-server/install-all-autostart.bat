@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "API_DEST=%STARTUP%\ComfyUI-API-Server.vbs"
set "COMFY_DEST=%STARTUP%\ComfyUI-Main.vbs"
set "COMFY_BAT=%ROOT%\scripts\run-comfyui-autostart.bat"
if not exist "%ROOT%\start-server.bat" (
  echo [ERROR] Missing %ROOT%\start-server.bat
  exit /b 1
)
if not exist "%COMFY_BAT%" (
  echo [ERROR] Missing %COMFY_BAT%
  exit /b 1
)
> "%API_DEST%" (
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.CurrentDirectory = "%ROOT%"
  echo WshShell.Run "cmd /c ""%ROOT%\start-server.bat""", 0, False
)
echo [OK] %API_DEST%
> "%COMFY_DEST%" (
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.CurrentDirectory = "%ROOT%"
  echo WshShell.Run "cmd /c ""%COMFY_BAT%""", 0, False
)
echo [OK] %COMFY_DEST%
echo Both autostart entries installed with absolute paths.
echo Tunnel to https://comfy.zhengxiaohui.cn is NOT included - start it separately.
endlocal
