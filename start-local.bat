@echo off
:: ============================================================
::  Transcribe Easy - Local Launcher for Windows
::  Wakes up Ollama, loads speech recognition, opens browser.
::  Run setup-local.bat first if you haven't already.
:: ============================================================

setlocal enabledelayedexpansion

set "ROOT=%~dp0"
set "NODE_VER=22.15.0"
set "NODE_DIR=%ROOT%tools\node\node-v%NODE_VER%-win-x64"
set "OLLAMA_DIR=%ROOT%tools\ollama"
set "OLLAMA_EXE=%OLLAMA_DIR%\ollama.exe"
set "USING_SYSTEM_OLLAMA=0"

:: ---------- Resolve Node.js ----------
:: Prefer bundled tools\node, fall back to system install
if not exist "%NODE_DIR%\node.exe" (
    where node >nul 2>&1
    if errorlevel 1 (
        echo.
        echo  ERROR: Node.js not found.
        echo  Please run setup-local.bat first.
        echo.
        pause
        exit /b 1
    )
    for /f "delims=" %%i in ('where node') do (
        pushd "%%~dpi"
        set "NODE_DIR=%CD%"
        popd
        goto :node_resolved
    )
    :node_resolved
)

:: ---------- Resolve Ollama ----------
:: Prefer bundled tools\ollama, fall back to PATH then standard installer location
if not exist "%OLLAMA_EXE%" (
    where ollama >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%i in ('where ollama') do (
            set "OLLAMA_EXE=%%i"
            set "USING_SYSTEM_OLLAMA=1"
            goto :ollama_resolved
        )
    )
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
        set "USING_SYSTEM_OLLAMA=1"
    )
    :ollama_resolved
)

:: ---------- Prerequisites ----------
if not exist "%ROOT%dist\index.html" (
    echo.
    echo  ERROR: App not built.
    echo  Please run setup-local.bat first.
    echo.
    pause
    exit /b 1
)

:: ---------- Environment ----------
set "PATH=%NODE_DIR%;%PATH%"
set "NODE_ENV=production"
set "HOST=127.0.0.1"
set "DISABLE_AUTO_SETUP=true"
set "OLLAMA_HOST=127.0.0.1:11434"
set "DEFAULT_WHISPER_MODEL=tiny"
set "OLLAMA_LOG=%TEMP%\transcribe-easy-ollama.log"

:: Only override OLLAMA_MODELS for bundled Ollama.
:: System Ollama already knows its model location (~\.ollama\models).
:: Setting this for a system install would redirect it to an empty directory.
if "%USING_SYSTEM_OLLAMA%"=="0" (
    set "OLLAMA_MODELS=%OLLAMA_DIR%\models"
)

cls
echo.
echo  ========================================
echo   Transcribe Easy
echo  ========================================
echo.

:: -----------------------------------------------
:: Step 1: AI engine (Ollama / translation)
:: -----------------------------------------------

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "try { Invoke-WebRequest 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"

if not errorlevel 1 (
    echo  [1/2] AI engine ................ already running
    goto :server
)

if "%OLLAMA_EXE%"=="%OLLAMA_DIR%\ollama.exe" (
    if not exist "%OLLAMA_EXE%" (
        echo  [1/2] AI engine ................ not found ^(run setup-local.bat^)
        goto :server
    )
)

echo  [1/2] AI engine ................ starting
start "" /b cmd /c ""%OLLAMA_EXE%" serve > "%OLLAMA_LOG%" 2>&1"

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "$s = [System.Diagnostics.Stopwatch]::StartNew(); " ^
  "while ($s.Elapsed.TotalSeconds -lt 30) { " ^
  "  try { Invoke-WebRequest 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch {} " ^
  "  Start-Sleep -Milliseconds 600 " ^
  "} " ^
  "exit 1"

if errorlevel 1 (
    echo.
    echo  [WARNING] AI engine is slow to start.
    echo  Translation may be unavailable. See: %OLLAMA_LOG%
    echo.
) else (
    echo  [1/2] AI engine ................ ready
)

:: -----------------------------------------------
:: Step 2: App server + browser
:: -----------------------------------------------
:server

:: Background watcher: opens the browser the moment the server responds.
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = [System.Diagnostics.Stopwatch]::StartNew(); " ^
  "while ($s.Elapsed.TotalSeconds -lt 45) { " ^
  "  try { if ((Invoke-WebRequest 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { Start-Process 'http://127.0.0.1:3000'; exit 0 } } catch {} " ^
  "  Start-Sleep -Milliseconds 500 " ^
  "} " ^
  "exit 0"

echo  [2/2] App server ............... starting
echo.
echo  ========================================
echo.
echo   Speech recognition loads on first use.
echo   Browser opens at http://127.0.0.1:3000
echo.
echo   Press Ctrl+C to stop.
echo  ========================================
echo.

:: Run server in foreground — blocks until Ctrl+C
"%NODE_DIR%\npx.cmd" tsx server.ts
