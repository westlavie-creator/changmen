@echo off
setlocal

set "ROOT=%~dp0.."
set "DEPLOY_USER=root"
set "DEPLOY_HOST=47.82.100.166"
set "DEPLOY_REPO=/root/gamebet"
set "DEPLOY_LOCAL_BUILD=1"
set "DEPLOY_FULL="
set "SSH_RETRIES=3"
set "SSH_OPTS=-o ServerAliveInterval=30 -o ServerAliveCountMax=120 -o ConnectTimeout=60"

REM Windows CMD cannot execute .env via CALL (opens "choose app" dialog). Use .local.bat instead.
if exist "%ROOT%\deploy-server.env" if not exist "%~dp0deploy-server.local.bat" (
  copy /Y "%ROOT%\deploy-server.env" "%~dp0deploy-server.local.bat" >nul
  echo [deploy] Migrated deploy-server.env -^> BAT\deploy-server.local.bat
)
if exist "%ROOT%\deploy-server.local.bat" if not exist "%~dp0deploy-server.local.bat" (
  move /Y "%ROOT%\deploy-server.local.bat" "%~dp0deploy-server.local.bat" >nul
  echo [deploy] Migrated changmen\deploy-server.local.bat -^> BAT\
)
if exist "%~dp0deploy-server.local.bat" call "%~dp0deploy-server.local.bat"

set "REMOTE=%DEPLOY_USER%@%DEPLOY_HOST%"
set "LOCAL_SCRIPT=%ROOT%\scripts\deploy-server-remote.sh"
set "FRONTEND_DIST=%ROOT%\client\web\dist"
set "REMOTE_APP=%DEPLOY_REPO%/changmen/client/web"

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
echo   Run BAT\push-git.bat first if you have unpushed commits.
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
pushd "%ROOT%"
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

dir /b "%FRONTEND_DIST%\assets\index*.js" >nul 2>&1
if errorlevel 1 (
  echo ERROR: dist/assets missing — run npm run app:build locally first
  goto fail_network
)

set "SCP_ATTEMPT=0"
:scp_retry
set /a SCP_ATTEMPT+=1
echo Clear remote dist and upload attempt %SCP_ATTEMPT%/%SSH_RETRIES% ...
ssh %SSH_OPTS% %REMOTE% "rm -rf %REMOTE_APP%/dist"
scp %SSH_OPTS% -r "%FRONTEND_DIST%" %REMOTE%:%REMOTE_APP%/
if not errorlevel 1 goto scp_ok
if %SCP_ATTEMPT% geq %SSH_RETRIES% goto fail_network
ping 127.0.0.1 -n 6 >nul
goto scp_retry

:scp_ok
ssh %SSH_OPTS% %REMOTE% "test -f %REMOTE_APP%/dist/index.html && test -d %REMOTE_APP%/dist/assets && ls %REMOTE_APP%/dist/assets/index*.js >/dev/null"
if errorlevel 1 (
  echo ERROR: remote dist incomplete after upload
  goto fail_network
)
echo Remote dist uploaded to %REMOTE_APP%/dist
echo [3/3] verify homepage (restart web only if still 404) ...
ssh %SSH_OPTS% %REMOTE% "curl -sf -o /dev/null http://127.0.0.1:3456/ || (echo homepage not 200, restarting gamebet-web & pm2 restart gamebet-web); pm2 status gamebet-web"
if errorlevel 1 (
  echo WARN: verify/restart failed — on VPS run: pm2 restart gamebet-web
)

:done
echo.
echo Done. Open http://%DEPLOY_HOST%/  (or http://%DEPLOY_HOST%:3456/ before Caddy)
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
echo Local dist is already built. After SSH works, run BAT\deploy-server.bat again
echo (it will skip rebuild if you keep LOCAL_BUILD=1, or delete dist to force).
pause
exit /b 1
