@echo off
REM ============================================================================
REM  start-console.bat — 兼容旧名称，实际调用 start-web.bat
REM  阶段 7 后不再默认 patch 旧 bundle；需要旧 /console/ 时：
REM    set PATCH_CONSOLE=1
REM    npm run web
REM ============================================================================
call "%~dp0start-web.bat"
