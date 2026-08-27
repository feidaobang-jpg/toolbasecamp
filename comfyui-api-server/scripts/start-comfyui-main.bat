@echo off
setlocal
title ComfyUI (official main) :8188

if not defined COMFYUI_ROOT set "COMFYUI_ROOT=D:\sd\ComfyUI-main"
set "VENV_PY=%COMFYUI_ROOT%\venv\Scripts\python.exe"
if not exist "%VENV_PY%" set "VENV_PY=%COMFYUI_ROOT%\.venv\Scripts\python.exe"
set "MAIN_PY=%COMFYUI_ROOT%\main.py"

if not exist "%MAIN_PY%" (
  echo [ERROR] ComfyUI not found: %MAIN_PY%
  echo Set COMFYUI_ROOT to your ComfyUI-main clone path.
  pause
  exit /b 1
)

if not exist "%VENV_PY%" (
  echo [ERROR] venv missing: %COMFYUI_ROOT%\venv or .venv
  pause
  exit /b 1
)

"%VENV_PY%" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8188/system_stats', timeout=3)" >nul 2>&1
if not errorlevel 1 goto already_running

netstat -ano | findstr ":8188" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto port_busy

cd /d "%COMFYUI_ROOT%"
echo ComfyUI root: %COMFYUI_ROOT%
echo Listen: 127.0.0.1:8188
echo Open: http://127.0.0.1:8188
echo Press Ctrl+C to stop
echo.
"%VENV_PY%" "%MAIN_PY%" --listen 127.0.0.1 --port 8188
pause
exit /b 0

:already_running
echo.
echo [INFO] ComfyUI is already running at http://127.0.0.1:8188
echo        Skip startup. API can use 127.0.0.1:8188 directly.
echo.
pause
exit /b 0

:port_busy
echo.
echo [WARN] Port 8188 is in use but ComfyUI did not respond.
echo        Kill stale python.exe with ComfyUI-main\main.py in Task Manager, then retry.
echo.
pause
exit /b 1
