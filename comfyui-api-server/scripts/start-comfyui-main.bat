@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
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
  echo Run once:
  echo   cd /d %COMFYUI_ROOT%
  echo   python -m venv venv
  echo   venv\Scripts\python.exe -m pip install -r requirements.txt
  pause
  exit /b 1
)

cd /d "%COMFYUI_ROOT%"
echo ComfyUI root: %COMFYUI_ROOT%
echo Listen: 127.0.0.1:8188
echo Open: http://127.0.0.1:8188
echo Press Ctrl+C to stop
echo.

"%VENV_PY%" "%MAIN_PY%" --listen 127.0.0.1 --port 8188

pause
endlocal
