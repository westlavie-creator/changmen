@echo off
cd /d "%~dp0..\.."
node public/copy/sync-styles.mjs
exit /b %ERRORLEVEL%
