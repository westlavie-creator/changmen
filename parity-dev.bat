@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title GameBet Parity Dev (mode P)

set "_D=%~dp0"
set "_P=3560"
set "_V=5174"

echo.
echo ========================================
echo   Gamebet Parity Dev (mode P)
echo ========================================
echo   SKIP_APP_BUILD=1
echo   Vite : http://localhost:!_V!/
echo   API  : http://localhost:!_P!/
echo.
echo   A8 parity: browser saveMatch/saveBets + plugin (PB/Stake)
echo   Before PB/Stake: cd apps\chrome-extension ^&^& npm run build
echo   Chrome: load unpacked extension from apps\chrome-extension
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo [1/3] Starting backend (parity)...
start "GameBet-Backend-Parity" cmd /k "cd /d %~dp0 && set SKIP_APP_BUILD=1&& call backend.bat"

ping 127.0.0.1 -n 2 >nul

echo [2/3] Starting Vite frontend...
start "GameBet-Vite" cmd /k "cd /d %~dp0 && call dev-vite.bat"

ping 127.0.0.1 -n 3 >nul

echo [3/3] Starting matcher (rebuild client_matches)...
start "GameBet-Matcher" cmd /k "cd /d %~dp0 && call npm run matcher:loop"

echo.
echo [OK] Mode P started. Matcher writes client_matches; UI reads Client_GetMatchs only.
echo      Matcher UI: http://localhost:!_P!/matcher/  (or standalone :4567 via npm run matcher:ui)
echo.

endlocal
