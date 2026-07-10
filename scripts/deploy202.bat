@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

echo === deploy202: build + deploy to http://47.57.10.202/ ===

where node >nul 2>&1 || (echo ERROR: node not in PATH & exit /b 1)
where tar >nul 2>&1 || (echo ERROR: tar not found & exit /b 1)

echo.
echo [1/3] npm run app:build
call npm run app:build
if errorlevel 1 (
  echo ERROR: app:build failed
  exit /b 1
)

set "DIST_ARCHIVE=%TEMP%\changmen-gha-dist\changmen-dist.tgz"
if not exist "%TEMP%\changmen-gha-dist" mkdir "%TEMP%\changmen-gha-dist"
if exist "%DIST_ARCHIVE%" del /f /q "%DIST_ARCHIVE%"

echo.
echo [2/3] pack dist -^> %DIST_ARCHIVE%
tar -czf "%DIST_ARCHIVE%" -C "client\web\dist" .
if errorlevel 1 (
  echo ERROR: dist pack failed
  exit /b 1
)

echo.
echo [3/3] deploy to 47.57.10.202
node "%~dp0deploy-hk-remaining.mjs" 47.57.10.202
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo ERROR: deploy failed (exit %RC%)
  exit /b %RC%
)

echo.
echo OK http://47.57.10.202/
endlocal
exit /b 0
