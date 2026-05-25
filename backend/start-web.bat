@echo off
REM ============================================================================
REM  backend\start-web.bat — 重启并启动 Node 服务（端口 3456）
REM
REM  默认入口 /app/（Vue 控制台）
REM  环境变量：
REM    SKIP_APP_BUILD=1  — 跳过 npm run app:build（加快纯 API 调试）
REM    PATCH_CONSOLE=1   — 额外 patch 旧 bundle 到 frontend/console
REM ============================================================================
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

echo [2/2] Start npm run web (preweb builds /app/ unless SKIP_APP_BUILD=1) ...
echo   App (default): http://localhost:%PORT%/app/
echo   Feed debug   : http://localhost:%PORT%/feed/
echo   Legacy bundle: http://localhost:%PORT%/console/  (needs PATCH_CONSOLE=1)
echo   Stop server  : press Ctrl+C in this window
echo.

call npm run web
if errorlevel 1 (
  echo.
  echo ERROR: server failed.
  pause
  exit /b 1
)

endlocal
