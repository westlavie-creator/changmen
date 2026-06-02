@echo off
powershell.exe -ExecutionPolicy Bypass -NoLogo -File "%~dp0dev.ps1" %*
if errorlevel 1 pause
