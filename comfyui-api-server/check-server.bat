@echo off
chcp 65001 >nul
title ComfyUI API Server status

echo ========================================
echo   Health check
echo ========================================
echo.

echo GET http://localhost:5000/health ...
echo.

curl -s http://localhost:5000/health >nul 2>&1

if errorlevel 1 (
    echo [FAIL] Server not running
    echo Start: start-server.bat  or  py -3 app.py
) else (
    echo [OK] Server is up
    echo http://localhost:5000/health
    echo http://localhost:5000/docs
)

echo.
pause
