@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0.."
if exist "%ROOT%\local.env" (
  for /f "usebackq eol=# delims=" %%L in ("%ROOT%\local.env") do (
    for /f "tokens=1,* delims==" %%A in ("%%L") do (
      if not "%%~A"=="" set "%%~A=%%B"
    )
  )
)

if not defined COMFYUI_MAIN_DIR set "COMFYUI_MAIN_DIR=D:\sd\ComfyUI-main"
if not exist "%COMFYUI_MAIN_DIR%\main.py" (
  echo [ERROR] ComfyUI not found: %COMFYUI_MAIN_DIR%
  exit /b 1
)

cd /d "%COMFYUI_MAIN_DIR%"

set "PYTHON=%COMFYUI_MAIN_DIR%\venv\Scripts\python.exe"
set ATTN_BACKEND=xformers
set SPCONV_ALGO=native

if not exist "%PYTHON%" (
  echo [ERROR] venv not found: %PYTHON%
  exit /b 1
)

"%PYTHON%" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8188/system_stats', timeout=3)" >nul 2>&1
if not errorlevel 1 exit /b 0

netstat -ano | findstr ":8188" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 exit /b 1

"%PYTHON%" main.py --listen 127.0.0.1 --port 8188
exit /b %ERRORLEVEL%
