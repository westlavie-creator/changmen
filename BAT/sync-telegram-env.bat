@echo off
setlocal EnableExtensions
node "%~dp0..\scripts\sync-telegram-env.mjs"
if errorlevel 1 (
  echo ERROR: sync failed
  pause
  exit /b 1
)
echo.
echo Done. Test: User diag -^> Message -^> Send test
pause
