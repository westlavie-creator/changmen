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
if "%NAME%"=="" set /p NAME=Cert label (e.g. RIVER, need not match login): 
if "%NAME%"=="" (
  echo ERROR: name required
  pause
  exit /b 1
)

set "P12_PASSWORD=%~2"
if "%P12_PASSWORD%"=="" set /p P12_PASSWORD=.p12 export password (save it): 
if "%P12_PASSWORD%"=="" (
  echo ERROR: password required
  pause
  exit /b 1
)

bash -c "export P12_PASSWORD='%P12_PASSWORD%'; bash './03-issue-client.sh' '%NAME%'"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo FAILED exit=%RC%
  pause
  exit /b %RC%
)
echo.
echo File: out\clients\%NAME%.p12
echo CA:   out\ca.crt
echo Password: the one you just entered
pause
exit /b 0