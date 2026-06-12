@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0.."
set "_PLUG=%ROOT%\apps\chrome-extension"
set "_DIST=%ROOT%\dist"

echo.
echo ========================================
echo   Gamebet Chrome plug pack
echo ========================================
echo   Output: %_DIST%
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Install Node.js first.
  pause
  exit /b 1
)

cd /d "%_PLUG%"
if not exist "node_modules\" (
  echo [1/2] npm install ...
  call npm install
  if errorlevel 1 goto fail
) else (
  echo [1/2] node_modules OK, skip install
)

echo [2/2] npm run pack ...
call npm run pack
if errorlevel 1 goto fail

echo.
echo Done. Send zip from %_DIST%\gamebet-chromeplug-v*.zip to friends.
echo.
pause
exit /b 0

:fail
echo.
echo ERROR: pack failed.
pause
exit /b 1
