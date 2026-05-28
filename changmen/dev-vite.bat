@echo off
REM Internal: Vite only (called by dev.bat). Or run after backend.bat.
setlocal

set "APP_PORT=5174"
cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%APP_PORT%" ^| findstr "LISTENING"') do (
  if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
ping 127.0.0.1 -n 2 >nul

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo Vite: http://localhost:%APP_PORT%/app/
call npm run app:dev
if errorlevel 1 pause

endlocal
