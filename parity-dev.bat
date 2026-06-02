@echo off
REM A8 parity: ESPORT_BRIDGE=0, ENABLE_OB=0, browser collect
setlocal

set "ROOT=%~dp0"
set "BACKEND_PORT=3456"
set "APP_PORT=5174"

echo.
echo ========================================
echo   Gamebet Parity Dev (mode P)
echo ========================================
echo   ESPORT_BRIDGE=0  ENABLE_OB=0  SKIP_APP_BUILD=1
echo   Vite: http://localhost:%APP_PORT%/app/
echo   API:  http://localhost:%BACKEND_PORT%/
echo.

start "Gamebet Backend parity %BACKEND_PORT%" cmd /k "cd /d "%ROOT%" && set ESPORT_BRIDGE=0&& set ENABLE_OB=0&& set SKIP_APP_BUILD=1&& call backend.bat"
ping 127.0.0.1 -n 2 >nul
start "Gamebet Vite %APP_PORT%" cmd /k "cd /d "%ROOT%" && call dev-vite.bat"

echo.
echo [OK] Started Backend (parity) and Vite windows.
echo.
ping 127.0.0.1 -n 6 >nul

endlocal
