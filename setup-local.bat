@echo off
:: ============================================================
::  Transcribe Easy - One-Click Local Setup for Windows
::  No admin rights required. Everything installs to user space.
:: ============================================================

setlocal enabledelayedexpansion

set "ROOT=%~dp0"
set "TOOLS=%ROOT%tools"
set "LOGS=%TOOLS%\logs"
set "NODE_VER=22.15.0"
set "NODE_FOLDER=node-v%NODE_VER%-win-x64"
set "NODE_DIR=%TOOLS%\node\%NODE_FOLDER%"
set "OLLAMA_DIR=%TOOLS%\ollama"
set "OLLAMA_EXE=%OLLAMA_DIR%\ollama.exe"
set "OLLAMA_MODEL=qwen3.5:0.8b"
set "USING_SYSTEM_OLLAMA=0"

if not exist "%LOGS%" mkdir "%LOGS%"

cls
echo.
echo  ========================================
echo   Transcribe Easy - Setup
echo  ========================================
echo.
echo   This will install everything you need
echo   to run Transcribe Easy on this computer.
echo.
echo   Estimated time: 5-15 minutes
echo   (depending on your internet speed)
echo.
echo  ========================================
echo.

:: -------------------------------------------
:: Step 1: App engine (Node.js)
:: -------------------------------------------
if exist "%NODE_DIR%\node.exe" (
    echo  [1/6] App engine ............... already installed
    goto :deps
)

:: Check if Node.js is already installed on the system
where node >nul 2>&1
if not errorlevel 1 (
    echo  [1/6] App engine ............... found (system install)
    for /f "delims=" %%i in ('where node') do (
        pushd "%%~dpi"
        set "NODE_DIR=%CD%"
        popd
        goto :deps
    )
)

echo  [1/6] App engine ............... downloading
if not exist "%TOOLS%" mkdir "%TOOLS%"

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "$ProgressPreference = 'SilentlyContinue'; " ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
  "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-win-x64.zip' " ^
  "-OutFile '%TOOLS%\node.zip' -UseBasicParsing"

if not exist "%TOOLS%\node.zip" (
    echo.
    echo  [ERROR] Download failed.
    echo  Please check your internet connection and try again.
    pause
    exit /b 1
)

echo         Extracting...
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "Expand-Archive -Path '%TOOLS%\node.zip' -DestinationPath '%TOOLS%\node' -Force"

del "%TOOLS%\node.zip" 2>nul

if not exist "%NODE_DIR%\node.exe" (
    echo.
    echo  [ERROR] Extraction failed.
    echo  Please try running this setup again.
    pause
    exit /b 1
)

echo  [1/6] App engine ............... done
echo.

:: -------------------------------------------
:: Step 2: App libraries (npm install)
:: -------------------------------------------
:deps
set "PATH=%NODE_DIR%;%PATH%"

if exist "node_modules\.package-lock.json" (
    echo  [2/6] App libraries ............ already installed
    goto :build
)

echo  [2/6] App libraries ............ installing
echo         (this may take a few minutes)

call "%NODE_DIR%\npm.cmd" install --no-audit --no-fund > "%LOGS%\npm-install.log" 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Library installation failed.
    echo  Details saved to: tools\logs\npm-install.log
    echo  Please try running this setup again.
    pause
    exit /b 1
)

echo  [2/6] App libraries ............ done
echo.

:: -------------------------------------------
:: Step 3: App interface (vite build)
:: -------------------------------------------
:build
if exist "dist\index.html" (
    echo  [3/6] App interface ............ already built
    goto :ollama
)

echo  [3/6] App interface ............ building

set "VITE_DEFAULT_PROVIDER=ollama"
call "%NODE_DIR%\npx.cmd" vite build > "%LOGS%\vite-build.log" 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed.
    echo  Details saved to: tools\logs\vite-build.log
    echo  Please try running this setup again.
    pause
    exit /b 1
)

echo  [3/6] App interface ............ done
echo.

:: -------------------------------------------
:: Step 4: AI engine (Ollama)
:: -------------------------------------------
:ollama
if exist "%OLLAMA_EXE%" (
    echo  [4/6] AI engine ................ already installed
    goto :pull_model
)

:: Check if Ollama is already installed on the system (PATH or standard installer location)
where ollama >nul 2>&1
if not errorlevel 1 (
    echo  [4/6] AI engine ................ found (system install)
    for /f "delims=" %%i in ('where ollama') do (
        set "OLLAMA_EXE=%%i"
        set "USING_SYSTEM_OLLAMA=1"
        goto :pull_model
    )
)
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
    set "USING_SYSTEM_OLLAMA=1"
    echo  [4/6] AI engine ................ found (system install)
    goto :pull_model
)

echo  [4/6] AI engine ................ downloading
if not exist "%OLLAMA_DIR%" mkdir "%OLLAMA_DIR%"

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "$ProgressPreference = 'SilentlyContinue'; " ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
  "Invoke-WebRequest -Uri 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip' " ^
  "-OutFile '%OLLAMA_DIR%\ollama.zip' -UseBasicParsing"

if not exist "%OLLAMA_DIR%\ollama.zip" (
    echo.
    echo  [ERROR] Download failed.
    echo  Please check your internet connection and try again.
    pause
    exit /b 1
)

echo         Extracting...
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "Expand-Archive -Path '%OLLAMA_DIR%\ollama.zip' -DestinationPath '%OLLAMA_DIR%' -Force"

del "%OLLAMA_DIR%\ollama.zip" 2>nul

if not exist "%OLLAMA_EXE%" (
    echo.
    echo  [ERROR] Extraction failed.
    echo  Please try running this setup again.
    pause
    exit /b 1
)

echo  [4/6] AI engine ................ done
echo.

:: -------------------------------------------
:: Step 5: Translation model (qwen3.5:0.8b)
:: -------------------------------------------
:pull_model

:: Check if model is already available via an existing Ollama server
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "try { " ^
  "  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 3; " ^
  "  if ($r.Content -match '%OLLAMA_MODEL%') { exit 0 } else { exit 1 } " ^
  "} catch { exit 1 }"
if not errorlevel 1 (
    echo  [5/6] Translation model ........ already available
    goto :whisper
)

:: Check bundled Ollama model location
set "OLLAMA_MANIFEST=%OLLAMA_DIR%\models\manifests\registry.ollama.ai\library"
if exist "%OLLAMA_MANIFEST%\qwen3.5\0.8b" (
    echo  [5/6] Translation model ........ already downloaded
    goto :whisper
)

:: Check standard system Ollama model location (~\.ollama\models\)
set "OLLAMA_SYS_MANIFEST=%USERPROFILE%\.ollama\models\manifests\registry.ollama.ai\library"
if exist "%OLLAMA_SYS_MANIFEST%\qwen3.5\0.8b" (
    echo  [5/6] Translation model ........ already downloaded
    goto :whisper
)

echo  [5/6] Translation model ........ downloading (~500 MB)
echo         (this is the largest download)
echo.

:: Start Ollama server in background
if "%USING_SYSTEM_OLLAMA%"=="0" (
    set "OLLAMA_MODELS=%OLLAMA_DIR%\models"
)
set "OLLAMA_HOST=127.0.0.1:11434"
set "OLLAMA_LOG=%TEMP%\transcribe-easy-ollama.log"
start "" /b cmd /c ""%OLLAMA_EXE%" serve > "%OLLAMA_LOG%" 2>&1"

:: Wait for Ollama server to be ready
echo         Starting AI engine...
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "$sw = [System.Diagnostics.Stopwatch]::StartNew(); " ^
  "while ($sw.Elapsed.TotalSeconds -lt 90) { " ^
  "  try { " ^
  "    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 3; " ^
  "    if ($r.StatusCode -eq 200) { Write-Host 'Ready'; exit 0 } " ^
  "  } catch {} " ^
  "  Start-Sleep -Seconds 2 " ^
  "} " ^
  "Write-Host 'Timeout'; exit 1"

if errorlevel 1 (
    echo.
    echo  [ERROR] AI engine failed to start.
    echo  Details saved to: %OLLAMA_LOG%
    echo  Please try running this setup again.
    taskkill /f /im ollama.exe >nul 2>&1
    pause
    exit /b 1
)

:: Pull the model
"%OLLAMA_EXE%" pull %OLLAMA_MODEL%
if errorlevel 1 (
    echo.
    echo  [ERROR] Model download failed.
    echo  Please check your internet connection and try again.
    taskkill /f /im ollama.exe >nul 2>&1
    pause
    exit /b 1
)

echo.
echo  [5/6] Translation model ........ done
echo.

:: Stop the Ollama server (start-local.bat will restart it)
taskkill /f /im ollama.exe >nul 2>&1

:: -------------------------------------------
:: Step 6: Speech recognition model (Whisper)
:: -------------------------------------------
:whisper
set "WHISPER_ONNX=%USERPROFILE%\.transcribe-easy\transformers-cache\onnx-community\whisper-tiny_timestamped\onnx"

if exist "%WHISPER_ONNX%\encoder_model.onnx" (
    if exist "%WHISPER_ONNX%\decoder_model_merged.onnx" (
        echo  [6/6] Speech recognition ....... already downloaded
        goto :done
    )
)

echo  [6/6] Speech recognition ....... downloading (~75 MB)

call "%NODE_DIR%\npx.cmd" tsx scripts/download-whisper-tiny.ts > "%LOGS%\whisper-download.log" 2>&1
if errorlevel 1 (
    echo.
    echo  [WARNING] Speech recognition download failed.
    echo  Details saved to: tools\logs\whisper-download.log
    echo  The app will retry this download when you first use it.
    echo.
) else (
    echo  [6/6] Speech recognition ....... done
    echo.
)

:: -------------------------------------------
:: Done!
:: -------------------------------------------
:done
echo.
echo  ========================================
echo.
echo   Setup complete! Everything is ready.
echo.
echo  ========================================
echo.

set /p "LAUNCH=  Would you like to launch the app now? (Y/N) "
if /i "%LAUNCH%"=="Y" (
    echo.
    echo  Launching...
    call "%ROOT%start-local.bat"
) else (
    echo.
    echo  To start the app later, double-click:
    echo    start-local.bat
    echo.
    pause
)
exit /b 0
