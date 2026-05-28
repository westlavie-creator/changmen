@echo off
REM Poll until TCP port is LISTENING. Usage: call wait-backend.bat [port] [max_seconds]
setlocal

set "PORT=%~1"
if "%PORT%"=="" set "PORT=3456"
set "MAX_TRY=%~2"
if "%MAX_TRY%"=="" set "MAX_TRY=90"

set /a N=0
:loop
netstat -aon | findstr ":%PORT%" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo Backend ready on port %PORT%.
  endlocal & exit /b 0
)
set /a N+=1
if %N% geq %MAX_TRY% (
  echo ERROR: Backend not listening on port %PORT% after %MAX_TRY%s.
  endlocal & exit /b 1
)
if %N%==1 echo Waiting for backend on port %PORT% (max %MAX_TRY%s)...
ping 127.0.0.1 -n 2 >nul
goto loop
