@echo off
REM ============================================================================
REM  start-dev.bat — 一键本地开发（推荐）
REM
REM  启动两个窗口：
REM    1) 后端 API + 静态托管  → http://localhost:3456/app/（需先 app:build 或由 preweb 构建）
REM    2) Vite 热更新 dev      → http://localhost:5174/app/（日常改 UI 用这个）
REM
REM  阶段 7 后默认入口为新控制台 /app/；旧 bundle 仍在 /console/（需 PATCH_CONSOLE=1 构建）
REM ============================================================================
setlocal

set "ROOT=%~dp0"
set "BACKEND_PORT=3456"
set "APP_PORT=5174"

echo.
echo ========================================
echo   Gamebet Full Dev (3456 + 5174)
echo ========================================
echo.
echo   Backend API: http://localhost:%BACKEND_PORT%/app/
echo   Vite dev   : http://localhost:%APP_PORT%/app/
echo   Feed debug : http://localhost:%BACKEND_PORT%/feed/
echo.
echo Two windows will open. Close each with Ctrl+C.
echo.

start "Gamebet Backend :%BACKEND_PORT%" cmd /k "cd /d "%ROOT%" && call start-web.bat"
ping 127.0.0.1 -n 4 >nul
start "Gamebet App Dev :%APP_PORT%" cmd /k "cd /d "%ROOT%" && call start-app-dev.bat"

endlocal
