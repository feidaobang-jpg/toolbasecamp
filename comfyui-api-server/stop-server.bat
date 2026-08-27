@echo off
chcp 65001 >nul
title Stop ComfyUI API Server

echo ========================================
echo   Stop process on port 5000
echo ========================================
echo.

set FOUND_PID=

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do (
    set FOUND_PID=%%a
)

if "%FOUND_PID%"=="" (
    echo [INFO] Nothing listening on port 5000
    echo.
    pause
    exit /b 0
)

echo PID: %FOUND_PID%
echo.

tasklist /FI "PID eq %FOUND_PID%"

echo.
echo Stopping...
taskkill /F /PID %FOUND_PID%

if errorlevel 1 (
    echo.
    echo [ERROR] taskkill failed (try Run as administrator)
) else (
    echo.
    echo [OK] Stopped
)

echo.
pause
