@echo off
setlocal
title ComfyUI (official main) :8188
cd /d "%~dp0"

if exist "%~dp0..\local.env" (
  for /f "usebackq eol=# delims=" %%L in ("%~dp0..\local.env") do (
    for /f "tokens=1,* delims==" %%A in ("%%L") do (
      if not "%%~A"=="" set "%%~A=%%B"
    )
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-comfyui-limited.ps1"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" pause
exit /b %ERR%
