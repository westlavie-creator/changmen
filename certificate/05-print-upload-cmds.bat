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

set "IP=%~1"
if "%IP%"=="" set /p IP=Public IP (e.g. 47.57.10.202): 
if "%IP%"=="" (
  echo ERROR: IP required
  pause
  exit /b 1
)

bash "./05-print-upload-cmds.sh" "%IP%"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo FAILED exit=%RC%
  pause
  exit /b %RC%
)
pause
exit /b 0