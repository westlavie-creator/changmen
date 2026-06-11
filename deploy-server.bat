@echo off
setlocal

set "DEPLOY_USER=root"
set "DEPLOY_HOST=47.82.100.166"
set "DEPLOY_REPO=/root/gamebet"

if exist "%~dp0deploy-server.env" call "%~dp0deploy-server.env"

set "REMOTE=%DEPLOY_USER%@%DEPLOY_HOST%"
set "REMOTE_SCRIPT=%DEPLOY_REPO%/changmen/scripts/deploy-server-remote.sh"

echo.
echo ========================================
echo   Deploy changmen to server
echo ========================================
echo   Target: %REMOTE%
echo   Repo:   %DEPLOY_REPO%
echo.
echo   Make sure you already git push from this PC.
echo.
pause

where ssh >nul 2>&1
if errorlevel 1 (
  echo ERROR: ssh not found.
  pause
  exit /b 1
)

echo [1/1] ssh pull + build + pm2 restart ...
ssh %REMOTE% "bash %REMOTE_SCRIPT%"
if errorlevel 1 goto fail

echo.
echo Done. Open http://%DEPLOY_HOST%:3456/app/
echo.
pause
exit /b 0

:fail
echo.
echo ERROR: deploy failed.
pause
exit /b 1
