@echo off
chcp 65001 >nul
title GameBet Electron
setlocal

set "ROOT=%~dp0"
set "BACKEND=%ROOT%gamebet_backend"
set "PORT=3456"

echo.
echo ========================================
echo   GameBet Electron
echo ========================================
echo.

if not exist "%BACKEND%" (
  echo ERROR: Cannot find %BACKEND%
  pause
  exit /b 1
)

cd /d "%BACKEND%"

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Please install Node.js.
  pause
  exit /b 1
)

echo [1/2] Stop old process on port %PORT% ...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
ping 127.0.0.1 -n 2 >nul

echo [2/2] Starting Electron...
npm run electron
if errorlevel 1 (
  echo.
  echo ERROR: Electron failed to start.
  pause
)

endlocal