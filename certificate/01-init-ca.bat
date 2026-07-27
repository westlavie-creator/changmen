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

where openssl >nul 2>&1
if errorlevel 1 (
  echo ERROR: openssl not found. Install OpenSSL and add to PATH.
  pause
  exit /b 1
)

bash "./01-init-ca.sh"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo FAILED exit=%RC%
  pause
  exit /b %RC%
)
pause
exit /b 0