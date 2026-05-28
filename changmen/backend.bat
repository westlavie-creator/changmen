@echo off
REM Backend only (port 3456). Builds /app/ unless SKIP_APP_BUILD=1
setlocal

set "PORT=3456"
set "A8_AUTH=0"
set "ESPORT_BRIDGE=1"
cd /d "%~dp0gamebet_backend"

echo.
echo ========================================
echo   Gamebet Backend - port %PORT%
echo ========================================
echo   App : http://localhost:%PORT%/app/
echo   Feed: http://localhost:%PORT%/feed/
echo.

echo [1/2] Stop old process on port %PORT% ...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
ping 127.0.0.1 -n 3 >nul

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo [2/2] npm run web ...
call npm run web
if errorlevel 1 (
  echo ERROR: server failed.
  pause
  exit /b 1
)

endlocal
