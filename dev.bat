@echo off
chcp 65001 >nul
title GameBet Dev
setlocal

set "ROOT=%~dp0"
set "BACKEND_PORT=3456"
set "APP_PORT=5174"

echo.
echo ========================================
echo   GameBet Dev
echo ========================================
echo   Electron backend : http://localhost:%BACKEND_PORT%/app/
echo   Vite HMR         : http://localhost:%APP_PORT%/app/
echo.

cd /d "%ROOT%gamebet_backend"

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo [1/2] Starting Electron backend...
start "GameBet Electron %BACKEND_PORT%" cmd /k "chcp 65001 >nul & cd /d "%ROOT%gamebet_backend" & npm run electron"

ping 127.0.0.1 -n 4 >nul

echo [2/2] Starting Vite frontend...
start "GameBet Vite %APP_PORT%" cmd /k "cd /d "%ROOT%" & call dev-vite.bat"

echo.
echo [OK] Started. Use Vite port for HMR, Electron window for full test.
echo.

endlocal