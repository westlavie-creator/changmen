@echo off
setlocal EnableDelayedExpansion
title GameBet Dev (Web)

set "_D=%~dp0"
set "_P=3456"
set "_V=5174"

echo.
echo ========================================
echo   GameBet Dev (Web Host)
echo ========================================
echo   Web backend : http://localhost:!_P!/app/
echo   Vite HMR    : http://localhost:!_V!/app/
echo   API proxy   : Vite !_V! -^> backend !_P!/esport/*
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
echo [OK] Started. Matcher writes client_matches; frontend reads Client_GetMatchs only.
echo      Optional: npm run matcher:ui  (人工关联 http://localhost:4567)
echo.

endlocal
