@echo off
setlocal EnableDelayedExpansion
title GameBet Dev

set "_D=%~dp0"
set "_P=3456"
set "_V=5174"

echo.
echo ========================================
echo   GameBet Dev
echo ========================================
echo   Web backend : http://localhost:!_P!/
echo   Vite HMR    : http://localhost:!_V!/
echo   API proxy   : Vite !_V! -^> backend !_P!/esport/*
echo   Chrome      : load gamebet_chromeplug in chrome://extensions
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo [1/3] Starting Web backend...
start "GameBet-Web" cmd /k "cd /d %~dp0 && call backend.bat"

ping 127.0.0.1 -n 4 >nul

echo [2/3] Starting Vite frontend...
start "GameBet-Vite" cmd /k "cd /d %~dp0 && call dev-vite.bat"

ping 127.0.0.1 -n 3 >nul

echo [3/3] Starting matcher (rebuild client_matches)...
start "GameBet-Matcher" cmd /k "cd /d %~dp0 && call npm run matcher:loop"

echo.
echo [OK] Started. Open http://localhost:!_V!/ in Chrome with extension loaded.
echo      Matcher UI: http://localhost:!_P!/matcher/  (or standalone :4567 via npm run matcher:ui)
echo.

endlocal
