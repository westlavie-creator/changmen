@echo off
setlocal

set "PORT=3456"
set "A8_AUTH=0"
cd /d "%~dp0"

echo.
echo ========================================
echo   Gamebet Web Server - Restart
echo ========================================
echo.

echo [1/2] Stop old process on port %PORT% ...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  if not "%%p"=="0" (
    echo   taskkill PID=%%p
    taskkill /F /PID %%p >nul 2>&1
  )
)
ping 127.0.0.1 -n 3 >nul

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Please install Node.js.
  pause
  exit /b 1
)

echo [2/2] Start npm run web ...
echo   Console UI : http://localhost:%PORT%/console/
echo   Dashboard  : http://localhost:%PORT%/
echo   Stop server: press Ctrl+C in this window
echo.

call npm run web
if errorlevel 1 (
  echo.
  echo ERROR: server failed.
  pause
  exit /b 1
)

endlocal
