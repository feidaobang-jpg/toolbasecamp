@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "DEST=%STARTUP%\ComfyUI-Main.vbs"
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "BAT=%ROOT%\scripts\run-comfyui-autostart.bat"
if not exist "%BAT%" (
  echo [ERROR] Missing: %BAT%
  pause
  exit /b 1
)
> "%DEST%" (
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.CurrentDirectory = "%ROOT%"
  echo WshShell.Run "cmd /c ""%BAT%""", 0, False
)
echo OK: ComfyUI autostart installed:
echo   %DEST%
echo   -^> %BAT%
pause
endlocal
