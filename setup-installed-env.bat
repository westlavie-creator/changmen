@echo off
REM Copy dev .env for installed GameBet (no admin needed)
setlocal

set "SRC=%~dp0gamebet_backend\.env"
set "INSTALL_DIR=%~1"
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=%ProgramFiles%\GameBet"
set "INSTALL_ENV=%INSTALL_DIR%\.env"

REM Electron userData = %%APPDATA%%\gamebet-backend (package.json name, NOT GameBet)
set "USERDATA_DIR=%APPDATA%\gamebet-backend"
set "USERDATA_ENV=%USERDATA_DIR%\.env"

if not exist "%SRC%" (
  echo ERROR: Missing %SRC%
  echo Create it from gamebet_backend\.env.example first.
  pause
  exit /b 1
)

if not exist "%USERDATA_DIR%" mkdir "%USERDATA_DIR%"
copy /Y "%SRC%" "%USERDATA_ENV%"
if errorlevel 1 (
  echo ERROR: copy failed: %USERDATA_ENV%
  pause
  exit /b 1
)
echo OK: %USERDATA_ENV%

if exist "%INSTALL_DIR%\GameBet.exe" (
  copy /Y "%SRC%" "%INSTALL_ENV%" >nul 2>&1
  if errorlevel 1 (
    echo NOTE: could not write %INSTALL_ENV% ^(need Administrator^).
  ) else (
    echo OK: %INSTALL_ENV%
  )
) else (
  echo NOTE: GameBet.exe not in %INSTALL_DIR% — skipped install-dir copy.
)

echo Restart GameBet completely.
pause
