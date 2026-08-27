@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title ComfyUI API Server (Edge-TTS)

echo ========================================
echo   ComfyUI Image Processor API Server
echo   TTS Engine: Edge-TTS
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

py -3 --version >nul 2>&1
if not errorlevel 1 set "PY=py -3"

if not defined PY (
  for %%P in (
    "%LocalAppData%\Programs\Python\Python314\python.exe"
    "%LocalAppData%\Programs\Python\Python313\python.exe"
    "%LocalAppData%\Programs\Python\Python312\python.exe"
    "%LocalAppData%\Programs\Python\Python311\python.exe"
    "%LocalAppData%\Programs\Python\Python310\python.exe"
    "%LocalAppData%\Programs\Python\Python39\python.exe"
    "%LocalAppData%\Programs\Python\Python38\python.exe"
  ) do if exist "%%~P" (
    set "PY=%%~P"
    goto found_local_py
  )
)
:found_local_py

if not defined PY if exist "%USERPROFILE%\miniconda3\python.exe" set "PY=%USERPROFILE%\miniconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\anaconda3\python.exe" set "PY=%USERPROFILE%\anaconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\miniforge3\python.exe" set "PY=%USERPROFILE%\miniforge3\python.exe"

if not defined PY if exist "%ProgramFiles%\Python314\python.exe" set "PY=%ProgramFiles%\Python314\python.exe"
if not defined PY if exist "%ProgramFiles%\Python313\python.exe" set "PY=%ProgramFiles%\Python313\python.exe"
if not defined PY if exist "%ProgramFiles%\Python312\python.exe" set "PY=%ProgramFiles%\Python312\python.exe"
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
echo TTS: Edge-TTS
set INDEXTTS_MODE=cli
set INDEXTTS_CMD=edge-tts
set INDEXTTS_VOICE=zh-CN-XiaoxiaoNeural
set INDEXTTS_SPEED=1.0

echo.
echo Starting: http://localhost:5000  docs: /docs
echo Press Ctrl+C to stop
echo ========================================
echo.

if /i "%~1"=="hidden" (
  !PY! app.py
  exit /b %ERRORLEVEL%
)

!PY! app.py

pause
endlocal
