@echo off
setlocal

set "DEPLOY_USER=root"
set "DEPLOY_HOST=47.82.100.166"
set "DEPLOY_REPO=/root/gamebet"
set "DEPLOY_LOCAL_BUILD=1"
set "DEPLOY_FULL="
set "SSH_OPTS=-o ServerAliveInterval=30 -o ServerAliveCountMax=120 -o ConnectTimeout=30"

if exist "%~dp0deploy-server.env" call "%~dp0deploy-server.env"

set "REMOTE=%DEPLOY_USER%@%DEPLOY_HOST%"
set "LOCAL_SCRIPT=%~dp0scripts\deploy-server-remote.sh"
set "FRONTEND_DIST=%~dp0gamebet_frontend\app\dist"
set "REMOTE_APP=%DEPLOY_REPO%/changmen/gamebet_frontend/app"

echo.
echo ========================================
echo   Deploy changmen to VPS
echo ========================================
echo   Target: %REMOTE%
echo   Repo:   %DEPLOY_REPO%
echo   LOCAL_BUILD: %DEPLOY_LOCAL_BUILD%
if /I "%DEPLOY_LOCAL_BUILD%"=="1" echo   Mode: local build on PC, upload dist
if /I not "%DEPLOY_LOCAL_BUILD%"=="1" echo   Mode: build on VPS (slow, may OOM on 2G RAM)
if /I "%DEPLOY_FULL%"=="1" echo   FULL: force install + build on VPS
echo.
echo   Run push-git.bat first if you have unpushed commits.
echo.
pause

where ssh >nul 2>&1
if errorlevel 1 (
  echo ERROR: ssh not found.
  pause
  exit /b 1
)

if not exist "%LOCAL_SCRIPT%" (
  echo ERROR: missing %LOCAL_SCRIPT%
  pause
  exit /b 1
)

if /I not "%DEPLOY_LOCAL_BUILD%"=="1" goto remote_deploy

echo [1/2] local app:build ...
pushd "%~dp0"
call npm run app:build
if errorlevel 1 (
  popd
  goto fail
)
popd
echo Local build OK.
echo.

:remote_deploy
if /I "%DEPLOY_LOCAL_BUILD%"=="1" goto step_ssh_upload
echo [1/1] ssh pull + install + pm2 ...
goto step_ssh

:step_ssh_upload
echo [2/2] ssh pull + install ...
goto step_ssh

:step_ssh
set "REMOTE_ENV=export DEPLOY_REPO=%DEPLOY_REPO%"
if /I "%DEPLOY_FULL%"=="1" set "REMOTE_ENV=%REMOTE_ENV% && export DEPLOY_FULL=1"
if /I "%DEPLOY_LOCAL_BUILD%"=="1" set "REMOTE_ENV=%REMOTE_ENV% && export DEPLOY_SKIP_APP_BUILD=1"

ssh %SSH_OPTS% %REMOTE% "%REMOTE_ENV% && bash -s" < "%LOCAL_SCRIPT%"
if errorlevel 1 goto fail

if /I not "%DEPLOY_LOCAL_BUILD%"=="1" goto done

if not exist "%FRONTEND_DIST%" (
  echo ERROR: missing %FRONTEND_DIST%
  goto fail
)

echo Upload dist to VPS ...
scp %SSH_OPTS% -r "%FRONTEND_DIST%" %REMOTE%:%REMOTE_APP%/
if errorlevel 1 goto fail

ssh %SSH_OPTS% %REMOTE% "pm2 restart gamebet-web && pm2 status"
if errorlevel 1 goto fail

:done
echo.
echo Done. Open http://%DEPLOY_HOST%:3456/app/
echo.
pause
exit /b 0

:fail
echo.
echo ERROR: deploy failed.
echo If SSH dropped during VPS vite build, keep DEPLOY_LOCAL_BUILD=1 in deploy-server.env
pause
exit /b 1
