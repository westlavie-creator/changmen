@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_PORT=3456"
set "APP_PORT=5174"

echo.
echo ========================================
echo   Gamebet Full Dev (3456 + 5174)
echo ========================================
echo.
echo   Backend    : http://localhost:%BACKEND_PORT%/console/
echo   New app    : http://localhost:%APP_PORT%/app/
echo.
echo Two windows will open. Close each with Ctrl+C.
echo.

start "Gamebet Backend :%BACKEND_PORT%" cmd /k "cd /d "%ROOT%" && call start-console.bat"
ping 127.0.0.1 -n 4 >nul
start "Gamebet App Dev :%APP_PORT%" cmd /k "cd /d "%ROOT%" && call start-app-dev.bat"

endlocal
