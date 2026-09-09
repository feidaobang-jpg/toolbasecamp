@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title ComfyUI API Server (IndexTTS + ACE-Step + Stable Audio)

echo ========================================
echo   ComfyUI Image Processor API Server
echo   TTS: IndexTTS-2.5 / Music: ACE-Step / SFX: Stable Audio Open
echo ========================================
echo.

cd /d "%~dp0"

if exist "%~dp0local.env" (
  echo [INFO] Loading local.env ...
  for /f "usebackq eol=# delims=" %%L in ("%~dp0local.env") do (
    for /f "tokens=1,* delims==" %%A in ("%%L") do (
      if not "%%~A"=="" set "%%~A=%%B"
    )
  )
)

echo Checking Python...
set "PY="

rem Prefer explicit installs (3.12 first) — `py -3` may point at an env without tzdata
for %%P in (
  "%LocalAppData%\Programs\Python\Python312\python.exe"
  "%LocalAppData%\Programs\Python\Python313\python.exe"
  "%LocalAppData%\Programs\Python\Python314\python.exe"
  "%LocalAppData%\Programs\Python\Python311\python.exe"
  "%LocalAppData%\Programs\Python\Python310\python.exe"
  "%LocalAppData%\Programs\Python\Python39\python.exe"
  "%LocalAppData%\Programs\Python\Python38\python.exe"
) do if not defined PY if exist "%%~P" set "PY=%%~P"

if not defined PY (
  py -3 --version >nul 2>&1
  if not errorlevel 1 set "PY=py -3"
)

if not defined PY if exist "%USERPROFILE%\miniconda3\python.exe" set "PY=%USERPROFILE%\miniconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\anaconda3\python.exe" set "PY=%USERPROFILE%\anaconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\miniforge3\python.exe" set "PY=%USERPROFILE%\miniforge3\python.exe"

if not defined PY if exist "%ProgramFiles%\Python312\python.exe" set "PY=%ProgramFiles%\Python312\python.exe"
if not defined PY if exist "%ProgramFiles%\Python313\python.exe" set "PY=%ProgramFiles%\Python313\python.exe"
if not defined PY if exist "%ProgramFiles%\Python314\python.exe" set "PY=%ProgramFiles%\Python314\python.exe"
if not defined PY if exist "%ProgramFiles%\Python311\python.exe" set "PY=%ProgramFiles%\Python311\python.exe"
if not defined PY if exist "%ProgramFiles%\Python310\python.exe" set "PY=%ProgramFiles%\Python310\python.exe"

if not defined PY (
  for /f "delims=" %%W in ('where python 2^>nul') do (
    echo %%W| findstr /i "WindowsApps" >nul
    if errorlevel 1 if exist "%%W" (
      set "PY=%%W"
      goto py_found_where
    )
  )
)
:py_found_where

if not defined PY (
  python --version >nul 2>&1
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  python3 --version >nul 2>&1
  if not errorlevel 1 set "PY=python3"
)

if not defined PY (
    echo [ERROR] Python not found.
    echo py launcher: not installed ^(where py: nothing^) is OK.
    echo Install: https://www.python.org/downloads/windows/ ^(option: py launcher^)
    pause
    exit /b 1
)

echo Using: !PY!
!PY! --version

echo Ensuring tzdata ^(Asia/Shanghai^) ...
!PY! -m pip install -q "tzdata>=2024.1" >nul 2>&1

echo.
echo Checking port 5000 ...
!PY! -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=3)" >nul 2>&1
if not errorlevel 1 goto already_running

netstat -ano | findstr ":5000" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto port_busy

echo.
echo pip install -r requirements.txt ...
!PY! -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo [ERROR] pip install failed. Retry:
    echo   !PY! -m pip install -r "%~dp0requirements.txt" -i https://pypi.tuna.tsinghua.edu.cn/simple
    pause
    exit /b 1
)

echo.
echo TTS: IndexTTS-2.5 at D:\sd\index-tts (fallback Edge-TTS)
if not defined INDEXTTS_ROOT set INDEXTTS_ROOT=D:\sd\index-tts
set INDEXTTS_MODE=cli
set INDEXTTS_CMD=edge-tts
set INDEXTTS_VOICE=zh-CN-XiaoxiaoNeural
set INDEXTTS_SPEED=1.0
echo Music: ACE-Step 1.5 | SFX: Stable Audio Open | Image-to-3D: TripoSR/Hunyuan/TRELLIS(+.2)
if not defined ACESTEP_ROOT set ACESTEP_ROOT=D:\sd\ACE-Step-1.5
if not defined STABLE_AUDIO_ROOT set STABLE_AUDIO_ROOT=D:\sd\stable-audio-open
if not defined STABLE_AUDIO_MODEL_DIR set STABLE_AUDIO_MODEL_DIR=D:\sd\stable-audio-open\model
if not defined TRIPOSR_ROOT set TRIPOSR_ROOT=D:\sd\triposr
if not defined HUNYUAN3D_ROOT set HUNYUAN3D_ROOT=D:\sd\hunyuan3d
if not defined TRELLIS_ROOT set TRELLIS_ROOT=D:\sd\trellis
if not defined TRELLIS2_ROOT set TRELLIS2_ROOT=D:\sd\trellis2
rem 不要默认 HF_ENDPOINT=hf-mirror：会导致 hub missing commit header（TripoSR 等）
rem 若需镜像请自行 set HF_ENDPOINT=https://hf-mirror.com
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

if not defined COMFYUI_RESOURCE_CPU_PERCENT set COMFYUI_RESOURCE_CPU_PERCENT=75
if not defined COMFYUI_RESOURCE_LIMIT set COMFYUI_RESOURCE_LIMIT=1
if /i not "%COMFYUI_RESOURCE_LIMIT%"=="0" (
  echo.
  echo Shared-PC resource cap: CPU ~%COMFYUI_RESOURCE_CPU_PERCENT%%%, priority below_normal
  echo   ^(edit comfyui-api-server\local.env to tune; COMFYUI_RESOURCE_LIMIT=0 to disable^)
)

echo.
echo Starting: http://localhost:5000  docs: /docs
echo Press Ctrl+C to stop
echo ========================================
echo.

if /i "%~1"=="hidden" (
  !PY! app.py
  goto done
)

!PY! app.py
pause
goto done

:already_running
echo.
set "API_PID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do set "API_PID=%%a"
echo [INFO] comfyui-api-server is already running at http://127.0.0.1:5000
if defined API_PID echo        PID: !API_PID!
echo        Skip startup. To load new code: stop-server.bat then start again.
echo.
if /i not "%~1"=="hidden" pause
goto done

:port_busy
echo.
echo [WARN] Port 5000 is in use but /health did not respond.
echo        Run stop-server.bat or taskkill the PID on 5000, then retry.
echo.
if /i not "%~1"=="hidden" pause
exit /b 1

:done
endlocal
