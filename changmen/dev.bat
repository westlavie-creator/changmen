@echo off
REM Full dev: backend 3456 + Vite 5174 (two windows)
setlocal

set "ROOT=%~dp0"
set "BACKEND_PORT=3456"
set "APP_PORT=5174"

echo.
echo ========================================
echo   Gamebet Dev (%BACKEND_PORT% + %APP_PORT%)
echo ========================================
echo   Vite : http://localhost:%APP_PORT%/app/
echo   API  : http://localhost:%BACKEND_PORT%/app/
echo.

start "Gamebet Backend :%BACKEND_PORT%" cmd /k "cd /d "%ROOT%" && call backend.bat"
call "%ROOT%scripts\wait-backend.bat" %BACKEND_PORT% 120
if errorlevel 1 (
  echo Backend did not start. Check the Backend window.
  pause
  exit /b 1
)

start "Gamebet Vite :%APP_PORT%" cmd /k "cd /d "%ROOT%" && call dev-vite.bat"

endlocal
