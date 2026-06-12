@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

rem Windows Hyper-V 保留 3426-3525，本地勿用 3456（会 EACCES）
set "_P=3560"
set "PORT=3560"
set "A8_AUTH=0"
cd /d "%~dp0gamebet_backend"

echo.
echo ========================================
echo   Gamebet Backend - port !_P!
echo ========================================
echo   App : http://localhost:!_P!/
echo   Collect: browser / only
echo.

echo [1/2] Stop old process on port !_P! ...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "LISTENING" ^| findstr /C:":!_P! "') do (
  if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
ping 127.0.0.1 -n 3 >nul

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo [2/2] npm run web ...
call npm run web
if errorlevel 1 (
  echo ERROR: server failed.
  pause
  exit /b 1
)

endlocal
