@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "DEST=%STARTUP%\ComfyUI-Main.vbs"
set "SRC=%~dp0scripts\run-comfyui-hidden.vbs"

if not exist "%SRC%" (
  echo [ERROR] Missing: %SRC%
  pause
  exit /b 1
)

copy /Y "%SRC%" "%DEST%" >nul
if errorlevel 1 (
  echo [ERROR] Failed to copy to Startup folder.
  pause
  exit /b 1
)

echo OK: ComfyUI autostart installed:
echo   %DEST%
echo.
echo On logon, ComfyUI starts hidden on http://127.0.0.1:8188
echo Path: read COMFYUI_MAIN_DIR from local.env, default D:\sd\ComfyUI-main
echo.
echo Also run install-autostart.bat for comfyui-api-server :5000 if not yet.
echo Remove: uninstall-comfyui-autostart.bat
pause
endlocal
