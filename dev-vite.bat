@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

set "_V=5174"
cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr "LISTENING" ^| findstr /C:":5174 "') do (
  if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
ping 127.0.0.1 -n 2 >nul

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo Vite: http://localhost:!_V!/
call npm run app:dev
if errorlevel 1 pause

endlocal
