@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo =====================================================
echo  PDF Ping Wheel v1.5.2 - GitHub uploader (fixed)
echo =====================================================
echo.
echo Target repository: CurioMi/pdf-ping-wheel-LOL
echo This uploader sets Git author identity for this repository only.
echo It will replace the current bootstrap README/.gitignore commit on main
echo with the complete source tree in this folder. Do not use it if you have
echo added other work to the remote repository.
echo.
set "DEFAULT_REPO=https://github.com/CurioMi/pdf-ping-wheel-LOL.git"
set "REPO_URL=%DEFAULT_REPO%"
set /p "REPO_INPUT=Repository URL [press Enter to use default]: "
if not "%REPO_INPUT%"=="" set "REPO_URL=%REPO_INPUT%"

if /I not "%REPO_URL%"=="https://github.com/CurioMi/pdf-ping-wheel-LOL.git" if /I not "%REPO_URL%"=="https://github.com/CurioMi/pdf-ping-wheel-LOL" (
  echo This script is prepared for CurioMi/pdf-ping-wheel-LOL only.
  echo Received: %REPO_URL%
  pause
  exit /b 1
)

git --version >nul 2>&1
if errorlevel 1 (
  echo Git is not installed. Install Git for Windows, then run this script again.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 git init
if errorlevel 1 (
  echo Could not initialize Git in this folder.
  pause
  exit /b 1
)

rem Set identity locally for this repository; do not modify global Git settings.
git config user.name "CurioMi"
git config user.email "65121751+CurioMi@users.noreply.github.com"
if errorlevel 1 (
  echo Could not configure the local Git author identity.
  pause
  exit /b 1
)

git branch -M main
set "EXISTING_REMOTE="
for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "EXISTING_REMOTE=%%R"
if defined EXISTING_REMOTE (
  if /I not "%EXISTING_REMOTE%"=="%REPO_URL%" if /I not "%EXISTING_REMOTE%"=="https://github.com/CurioMi/pdf-ping-wheel-LOL" (
    echo An origin remote already exists and does not match the target:
    echo %EXISTING_REMOTE%
    echo Aborting to avoid pushing to the wrong repository.
    pause
    exit /b 1
  )
) else (
  git remote add origin "%REPO_URL%"
  if errorlevel 1 (
    echo Could not add the origin remote.
    pause
    exit /b 1
  )
)

git add -A
if errorlevel 1 (
  echo Could not stage the source files.
  pause
  exit /b 1
)

echo.
echo Review the staged files below. Check that there are no private files,
echo personal PDFs, build outputs, or locally installed game assets.
git status --short
echo.
git diff --cached --stat
echo.
set /p "CONFIRM=Type YES to commit and push this source: "
if /I not "%CONFIRM%"=="YES" (
  echo Cancelled. No commit or push was performed.
  pause
  exit /b 0
)

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "feat: publish PDF Ping Wheel v1.5.2 source"
  if errorlevel 1 (
    echo Commit failed. Review the Git output above.
    pause
    exit /b 1
  )
) else (
  echo No new changes to commit; will push the existing local main branch.
)

set "REMOTE_MAIN="
for /f "tokens=1" %%H in ('git ls-remote --heads origin refs/heads/main 2^>nul') do set "REMOTE_MAIN=%%H"
if defined REMOTE_MAIN goto remote_main_exists

git push -u origin main
goto after_push

:remote_main_exists
echo.
echo The remote main branch already exists. It currently contains the
echo bootstrap files created during setup. This push will replace that
echo branch with the complete source tree from this folder.
set /p "OVERWRITE=Type OVERWRITE to replace remote main: "
if /I not "%OVERWRITE%"=="OVERWRITE" goto cancelled_push
git push -u origin main --force
goto after_push

:cancelled_push
echo Cancelled before pushing. No remote changes were made.
pause
exit /b 0

:after_push
if errorlevel 1 goto push_failed
echo.
echo Upload complete. Open https://github.com/CurioMi/pdf-ping-wheel-LOL
pause
exit /b 0

:push_failed
echo Push failed. Check GitHub sign-in and write permission for this repository.
pause
exit /b 1
