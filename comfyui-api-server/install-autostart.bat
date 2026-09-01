@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "DEST=%STARTUP%\ComfyUI-API-Server.vbs"
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
if not exist "%ROOT%\start-server.bat" (
  echo [ERROR] start-server.bat not found in %ROOT%
  pause
  exit /b 1
)
> "%DEST%" (
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.CurrentDirectory = "%ROOT%"
  echo WshShell.Run "cmd /c ""%ROOT%\start-server.bat""", 0, False
)
echo OK: Autostart installed:
echo   %DEST%
echo   -^> %ROOT%\start-server.bat
echo Tunnel (comfy.zhengxiaohui.cn) is separate - start it yourself if needed.
pause
endlocal
