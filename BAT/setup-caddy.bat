@echo off
setlocal

set "ROOT=%~dp0.."
set "DEPLOY_USER=root"
set "DEPLOY_HOST=47.82.100.166"
set "SSH_OPTS=-o ServerAliveInterval=30 -o ServerAliveCountMax=120 -o ConnectTimeout=60"
set "CADDY_LOCAL=%ROOT%\scripts\Caddyfile"
set "REMOTE_SCRIPT=%ROOT%\scripts\setup-caddy-remote.sh"

if exist "%~dp0deploy-server.local.bat" call "%~dp0deploy-server.local.bat"

set "REMOTE=%DEPLOY_USER%@%DEPLOY_HOST%"

echo.
echo ========================================
echo   Setup Caddy reverse proxy (port 80)
echo ========================================
echo   Target: %REMOTE%
echo   Local:  %CADDY_LOCAL%
echo.
echo   Caddy :80  -^>  Node 127.0.0.1:3456 (gamebet-web)
echo.

if not exist "%CADDY_LOCAL%" (
  echo ERROR: missing %CADDY_LOCAL%
  pause
  exit /b 1
)
if not exist "%REMOTE_SCRIPT%" (
  echo ERROR: missing %REMOTE_SCRIPT%
  pause
  exit /b 1
)

where ssh >nul 2>&1
if errorlevel 1 (
  echo ERROR: ssh not found. Install OpenSSH Client.
  pause
  exit /b 1
)

echo [1/2] Upload Caddyfile ...
scp %SSH_OPTS% "%CADDY_LOCAL%" %REMOTE%:/root/Caddyfile
if errorlevel 1 (
  echo.
  echo ERROR: scp failed. Check SSH key/password and security group TCP 22.
  echo Or paste changmen/scripts/setup-caddy-paste-on-server.sh in Aliyun Workbench.
  pause
  exit /b 1
)

echo [2/2] Apply on server ...
ssh %SSH_OPTS% %REMOTE% "bash -s" < "%REMOTE_SCRIPT%"
if errorlevel 1 (
  echo.
  echo ERROR: remote setup failed. SSH in and run: sudo journalctl -u caddy -n 30
  pause
  exit /b 1
)

echo.
echo Done. Open http://%DEPLOY_HOST%/
echo (Not the Caddy welcome page - should be changmen login.)
echo.
pause
exit /b 0
