@echo off
setlocal
chcp 65001 >nul 2>&1

REM 开发联调：从 example 复制 server/backend/.env（浏览器 + 插件模式，非 Electron）
set "ROOT=%~dp0.."
set "EXAMPLE=%ROOT%\server\backend\.env.example"
set "DEST=%ROOT%\server\backend\.env"

if exist "%DEST%" (
  echo OK: 已存在 %DEST%
  echo 如需重置，先删除该文件再运行本脚本。
  pause
  exit /b 0
)

if not exist "%EXAMPLE%" (
  echo ERROR: 缺少 %EXAMPLE%
  pause
  exit /b 1
)

copy /Y "%EXAMPLE%" "%DEST%"
if errorlevel 1 (
  echo ERROR: 复制失败
  pause
  exit /b 1
)

echo OK: 已创建 %DEST%
echo 请编辑 JWT_SECRET、DATABASE_URL 等，然后运行 BAT\dev.bat
pause
