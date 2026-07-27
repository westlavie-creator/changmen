@echo off
setlocal
cd /d "%~dp0"
chcp 936 >nul

where bash >nul 2>&1
if errorlevel 1 (
  echo ERROR: bash not found. Install Git for Windows or enable WSL.
  pause
  exit /b 1
)

set "NAME=%~1"
if "%NAME%"=="" set /p NAME=Cert label to revoke: 
if "%NAME%"=="" (
  echo ERROR: name required
  pause
  exit /b 1
)

bash "./04-revoke-client.sh" "%NAME%"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo FAILED exit=%RC%
  pause
  exit /b %RC%
)
pause
exit /b 0