@echo off
setlocal
cd /d "%~dp0.."
if "%~1"=="" (
  call npm run db:mode -- --status
  exit /b 0
)
call npm run db:mode -- %*
