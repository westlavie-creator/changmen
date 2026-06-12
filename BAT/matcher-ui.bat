@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0.."
set "_P=4567"
if defined MATCHER_UI_PORT set "_P=!MATCHER_UI_PORT!"
cd /d "%ROOT%\apps\matcher"

echo.
echo ========================================
echo   Gamebet Matcher UI - port !_P!
echo ========================================
echo   http://localhost:!_P!/
echo.

echo [1/2] Stop old process on port !_P! ...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "LISTENING" ^| findstr /C:":!_P! "') do (
  if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
ping 127.0.0.1 -n 2 >nul

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo [2/2] npm start ...
call npm start
if errorlevel 1 (
  echo ERROR: matcher UI failed.
  pause
  exit /b 1
)

endlocal
