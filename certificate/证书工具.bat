@echo off
setlocal
cd /d "%~dp0"
chcp 936 >nul

:menu
cls
echo ========================================
echo   changmen certificate tool (local)
echo ========================================
echo   1. Init root CA              (01-init-ca)
echo   2. Issue server cert         (02-issue-server)
echo   3. Issue client .p12         (03-issue-client)
echo   4. Revoke client cert        (04-revoke-client)
echo   5. Print upload commands     (05-print-upload-cmds)
echo   0. Exit
echo ========================================
set "CHOICE="
set /p CHOICE=Select: 

if "%CHOICE%"=="1" call "%~dp001-init-ca.bat" & goto menu
if "%CHOICE%"=="2" call "%~dp002-issue-server.bat" & goto menu
if "%CHOICE%"=="3" call "%~dp003-issue-client.bat" & goto menu
if "%CHOICE%"=="4" call "%~dp004-revoke-client.bat" & goto menu
if "%CHOICE%"=="5" call "%~dp005-print-upload-cmds.bat" & goto menu
if "%CHOICE%"=="0" exit /b 0
echo Invalid option
pause
goto menu