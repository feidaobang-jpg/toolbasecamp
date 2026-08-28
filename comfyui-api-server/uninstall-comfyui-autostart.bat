@echo off
setlocal
chcp 65001 >nul
set "DEST=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ComfyUI-Main.vbs"
if exist "%DEST%" del /f "%DEST%"
echo Removed ComfyUI autostart (if it existed).
pause
endlocal
