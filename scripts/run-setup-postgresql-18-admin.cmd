@echo off
:: Double-click or run from terminal; approves UAC once, then installs PG18.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0setup-postgresql-18.ps1\"' -Wait"
echo.
echo Log: %~dp0setup-postgresql-18.log
pause
