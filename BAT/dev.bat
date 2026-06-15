@echo off

setlocal EnableDelayedExpansion

chcp 65001 >nul 2>&1



set "BAT=%~dp0"

set "ROOT=%~dp0.."

set "_P=3560"

set "_V=5174"

set "_PARITY=0"

if /I "%~1"=="parity" set "_PARITY=1"

if /I "%~1"=="matcher" set "_PARITY=1"



if "!_PARITY!"=="1" (

  title GameBet Dev + Matcher

) else (

  title GameBet Dev

)



echo.

echo ========================================

if "!_PARITY!"=="1" (

  echo   GameBet Dev + Matcher

) else (

  echo   GameBet Dev

)

echo ========================================

echo   Backend : http://localhost:!_P!/

echo   Vite    : http://localhost:!_V!/

echo   Chrome  : load client/chrome-extension

if "!_PARITY!"=="1" (

  echo   Matcher : npm run matcher:loop ^(auto-started^)

)

echo.

echo   Tip: BAT\dev.bat parity  — also start matcher

echo        npm run matcher:ui  — matcher panel :4567

echo.



where npm >nul 2>&1

if errorlevel 1 (

  echo ERROR: npm not found.

  pause

  exit /b 1

)



echo [1/2] Starting backend...

start "GameBet-Backend" cmd /k "cd /d %ROOT% && set SKIP_APP_BUILD=1&& call %BAT%backend.bat"



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

echo [2/2] Starting Vite...

start "GameBet-Vite" cmd /k "cd /d %ROOT% && npm run app:dev"



if not "!_PARITY!"=="1" goto done

ping 127.0.0.1 -n 2 >nul

echo [3/3] Starting matcher loop...

start "GameBet-Matcher" cmd /k "cd /d %ROOT% && npm run matcher:loop"



:done

echo.

echo [OK] Open http://localhost:!_V!/

echo      Close this window; other windows keep running.

pause



endlocal

