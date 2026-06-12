@echo off
setlocal EnableDelayedExpansion
title GameBet Dev

set "_D=%~dp0"
set "_P=3560"
set "_V=5174"

echo.
echo ========================================
echo   GameBet Dev
echo ========================================
echo   Web backend : http://localhost:!_P!/
echo   Vite HMR    : http://localhost:!_V!/
echo   API proxy   : Vite !_V! -^> backend !_P!/esport/*
echo   Backend     : SKIP_APP_BUILD=1 (UI via Vite, skip preweb app:build)
echo   Chrome      : load apps/chrome-extension in chrome://extensions
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo [1/2] Starting Web backend...
start "GameBet-Web" cmd /k "cd /d %~dp0 && set SKIP_APP_BUILD=1&& call backend.bat"

echo Waiting for backend on port !_P! ...
set /a "_W=0"
:wait_backend
netstat -aon | findstr "LISTENING" | findstr /C:":!_P! " >nul
if not errorlevel 1 goto backend_ready
set /a "_W+=1"
if !_W! geq 60 (
  echo WARN: Backend not listening after ~60s; starting Vite anyway.
  goto start_vite
)
ping 127.0.0.1 -n 2 >nul
goto wait_backend
:backend_ready
echo Backend is listening on !_P!.

:start_vite
echo [2/2] Starting Vite frontend...
start "GameBet-Vite" cmd /k "cd /d %~dp0 && call dev-vite.bat"

echo.
echo [OK] Started. Open http://localhost:!_V!/ in Chrome with extension loaded.
echo      Matcher (separate): matcher-loop.bat  or  matcher-ui.bat
echo.
echo You can close this window; backend and Vite run in the other two cmd windows.
pause

endlocal
