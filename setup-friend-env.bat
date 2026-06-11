@echo off
REM 朋友电脑：把管理员发来的 .env 复制到 GameBet 配置目录（无需管理员权限）
setlocal

set "SRC=%~1"
if "%SRC%"=="" (
  echo 用法：把管理员发来的 .env 文件拖到此脚本上
  echo 或：setup-friend-env.bat "C:\Users\你\Downloads\gamebet.env"
  pause
  exit /b 1
)

if not exist "%SRC%" (
  echo ERROR: 找不到文件: %SRC%
  pause
  exit /b 1
)

set "USERDATA_DIR=%APPDATA%\gamebet-backend"
set "USERDATA_ENV=%USERDATA_DIR%\.env"

if not exist "%USERDATA_DIR%" mkdir "%USERDATA_DIR%"
copy /Y "%SRC%" "%USERDATA_ENV%"
if errorlevel 1 (
  echo ERROR: 复制失败: %USERDATA_ENV%
  pause
  exit /b 1
)

echo OK: 已写入 %USERDATA_ENV%
echo 请完全退出 GameBet 后重新打开。
pause
