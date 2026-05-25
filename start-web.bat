@echo off
REM ============================================================================
REM  start-web.bat — 仅启动后端（3456）
REM
REM  等价于 backend\start-web.bat → npm run web
REM  preweb 会构建 frontend/app（可用 SKIP_APP_BUILD=1 跳过）
REM ============================================================================
call "%~dp0backend\start-web.bat"
