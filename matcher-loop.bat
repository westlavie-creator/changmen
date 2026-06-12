@echo off
setlocal EnableDelayedExpansion
title GameBet Matcher Loop

cd /d "%~dp0"

echo.
echo ========================================
echo   Gamebet Matcher Loop
echo ========================================
echo   Rebuild client_matches periodically
echo   Matcher UI (optional): matcher-ui.bat  -^> http://localhost:4567/
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo npm run matcher:loop ...
call npm run matcher:loop
if errorlevel 1 (
  echo ERROR: matcher loop failed.
  pause
  exit /b 1
)

endlocal
