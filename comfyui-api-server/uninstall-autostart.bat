@echo off
setlocal
chcp 65001 >nul
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "DEST=%STARTUP%\ComfyUI-API-Server.vbs"
set "LINK=%STARTUP%\ComfyUI-API-Server.lnk"

if exist "%DEST%" del /f /q "%DEST%" && echo Removed: %DEST%
if exist "%LINK%" del /f /q "%LINK%" && echo Removed: %LINK%
if not exist "%DEST%" if not exist "%LINK%" echo Nothing to remove.
pause
endlocal
