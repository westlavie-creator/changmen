@echo off
setlocal

set "GIT_ROOT=%~dp0.."

echo.
echo ========================================
echo   Push to GitHub
echo ========================================
echo   Repo: %GIT_ROOT%
echo.
pause

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: git not found.
  pause
  exit /b 1
)

pushd "%GIT_ROOT%"

git status --porcelain | findstr /r "." >nul
if errorlevel 1 goto do_push

set "COMMIT_MSG="
set /p COMMIT_MSG=Commit message (empty=deploy):
if not defined COMMIT_MSG set "COMMIT_MSG=deploy"
git add -A
git commit -m "%COMMIT_MSG%"
if errorlevel 1 goto fail

:do_push
git push
if errorlevel 1 goto fail

popd
echo.
echo Git push OK.
echo.
pause
exit /b 0

:fail
popd
echo.
echo ERROR: git push failed.
pause
exit /b 1
