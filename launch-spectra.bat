@echo off
setlocal

cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%USERPROFILE%\.cargo\bin;%PATH%"
set "CARGO_TARGET_DIR=%TEMP%\spectra-tauri-target"

if not exist "C:\Program Files\nodejs\npm.cmd" (
  echo Node.js was not found. Install Node.js LTS, then try again.
  pause
  exit /b 1
)

if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
  echo Rust was not found. Install Rust, then try again.
  pause
  exit /b 1
)

echo Starting Spectra...
call "C:\Program Files\nodejs\npm.cmd" run tauri dev

if errorlevel 1 pause
