@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Install Python dependencies

echo ========================================
echo   pip install -r requirements.txt
echo ========================================
echo.

cd /d "%~dp0"

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
      goto py_found_where_inst
    )
  )
)
:py_found_where_inst

if not defined PY (
  python --version >nul 2>&1
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  python3 --version >nul 2>&1
  if not errorlevel 1 set "PY=python3"
)

if not defined PY (
    echo [ERROR] Python not found. Install from https://www.python.org/downloads/windows/
    pause
    exit /b 1
)

echo Using: !PY!
!PY! --version

echo.
echo Checking pip...
!PY! -m pip --version
if errorlevel 1 (
    echo [ERROR] pip missing
    pause
    exit /b 1
)

echo.
echo Installing...
!PY! -m pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo [ERROR] Install failed. Try mirror:
    echo   !PY! -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    echo   !PY! -m pip install --upgrade pip
    pause
    exit /b 1
)

echo.
echo Done. Run start-server.bat
echo.
pause
endlocal
