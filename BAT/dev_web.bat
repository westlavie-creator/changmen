@echo off
REM 别名：与 dev-web.bat / dev.bat 相同（下划线写法，方便口述）
call "%~dp0dev.bat" %*
if errorlevel 1 pause
