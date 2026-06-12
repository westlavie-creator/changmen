@echo off
setlocal

set "DEPLOY_USER=root"
set "DEPLOY_HOST=47.82.100.166"
set "DEPLOY_REPO=/root/gamebet"
set "DEPLOY_LOCAL_BUILD=1"
set "DEPLOY_FULL="
set "SSH_RETRIES=3"
set "SSH_OPTS=-o ServerAliveInterval=30 -o ServerAliveCountMax=120 -o ConnectTimeout=60"

REM Windows CMD cannot execute .env via CALL (opens "choose app" dialog). Use .local.bat instead.
if exist "%~dp0deploy-server.env" if not exist "%~dp0deploy-server.local.bat" (
  copy /Y "%~dp0deploy-server.env" "%~dp0deploy-server.local.bat" >nul
  echo [deploy] Migrated deploy-server.env -^> deploy-server.local.bat
)
if exist "%~dp0deploy-server.local.bat" call "%~dp0deploy-server.local.bat"

set "REMOTE=%DEPLOY_USER%@%DEPLOY_HOST%"
set "LOCAL_SCRIPT=%~dp0scripts\deploy-server-remote.sh"
set "FRONTEND_DIST=%~dp0gamebet_frontend\dist"
set "REMOTE_APP=%DEPLOY_REPO%/changmen/gamebet_frontend"

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
  goto fail_network
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

set "SSH_ATTEMPT=0"
:ssh_retry
set /a SSH_ATTEMPT+=1
echo SSH attempt %SSH_ATTEMPT%/%SSH_RETRIES% ...
ssh %SSH_OPTS% %REMOTE% "%REMOTE_ENV% && bash -s" < "%LOCAL_SCRIPT%"
if not errorlevel 1 goto ssh_ok
if %SSH_ATTEMPT% geq %SSH_RETRIES% goto fail_network
echo SSH failed, wait 5s and retry ...
ping 127.0.0.1 -n 6 >nul
goto ssh_retry

:ssh_ok
if /I not "%DEPLOY_LOCAL_BUILD%"=="1" goto done

if not exist "%FRONTEND_DIST%" (
  echo ERROR: missing %FRONTEND_DIST%
  goto fail_network
)

set "SCP_ATTEMPT=0"
:scp_retry
set /a SCP_ATTEMPT+=1
echo Upload dist attempt %SCP_ATTEMPT%/%SSH_RETRIES% ...
scp %SSH_OPTS% -r "%FRONTEND_DIST%" %REMOTE%:%REMOTE_APP%/
if not errorlevel 1 goto scp_ok
if %SCP_ATTEMPT% geq %SSH_RETRIES% goto fail_network
ping 127.0.0.1 -n 6 >nul
goto scp_retry

:scp_ok
ssh %SSH_OPTS% %REMOTE% "pm2 restart gamebet-web && pm2 status"
if errorlevel 1 goto fail_network

:done
echo.
echo Done. Open http://%DEPLOY_HOST%:3456/
echo.
pause
exit /b 0

:fail_network
echo.
echo ERROR: deploy failed (SSH/SCP/script error on %DEPLOY_HOST%).
echo.
echo Checklist:
echo   1. Aliyun console: is the VPS running? Try reboot.
echo   2. Security group: allow TCP 22 SSH and 3456 from your IP.
echo   3. Browser test: http://%DEPLOY_HOST%:3456/
echo   4. Wait a few minutes if VPS was OOM from old vite build, then retry.
echo.
echo Local dist is already built. After SSH works, run deploy-server.bat again
echo (it will skip rebuild if you keep LOCAL_BUILD=1, or delete dist to force).
pause
exit /b 1
