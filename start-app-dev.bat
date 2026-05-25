@echo off
REM ============================================================================
REM  start-app-dev.bat — 仅启动 Vite 开发服务器（5174）
REM
REM  需后端已在 3456 运行（start-web.bat 或 start-dev.bat 第一个窗口）
REM  访问 http://localhost:5174/app/ — API 代理到 3456
REM ============================================================================
setlocal

set "APP_PORT=5174"
set "BACKEND_PORT=3456"
cd /d "%~dp0"

echo.
echo ========================================
echo   Gamebet App Dev (Vite) - Port %APP_PORT%
echo ========================================
echo.

echo [1/2] Stop old process on port %APP_PORT% ...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%APP_PORT%" ^| findstr "LISTENING"') do (
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

netstat -aon | findstr ":%BACKEND_PORT%" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo WARNING: Backend is not running on port %BACKEND_PORT%.
  echo   Start it first: start-web.bat
  echo   Or use start-dev.bat to launch both.
  echo.
) else (
  echo Backend OK on port %BACKEND_PORT%.
  echo.
)

echo [2/2] Start npm run app:dev ...
echo   Vite app   : http://localhost:%APP_PORT%/app/
echo   Backend    : http://localhost:%BACKEND_PORT%/app/
echo   Feed debug : http://localhost:%BACKEND_PORT%/feed/
echo   Legacy     : http://localhost:%BACKEND_PORT%/console/
echo   Stop server: press Ctrl+C in this window
echo.

call npm run app:dev
if errorlevel 1 (
  echo.
  echo ERROR: app dev server failed.
  pause
  exit /b 1
)

endlocal
