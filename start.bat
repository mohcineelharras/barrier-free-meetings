@echo off
:: ============================================================
::  Transcribe Easy - Dev launcher (hot reload)
::  Resolves Node and Ollama from PATH or standard install
::  locations. For end-user production launch use start-local.bat.
:: ============================================================

setlocal enabledelayedexpansion

set "OLLAMA_LOG=%TEMP%\transcribe-easy-ollama.log"

:: ---------- Resolve Node.js ----------
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Node.js not found in PATH.
    echo  Run setup-local.bat first, or install Node.js system-wide.
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

:: ---------- Resolve Ollama ----------
set "OLLAMA_EXE="
where ollama >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%i in ('where ollama') do (
        set "OLLAMA_EXE=%%i"
        goto :ollama_resolved
    )
)
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
)
:ollama_resolved

set "PATH=%NODE_DIR%;%PATH%"

cls
echo.
echo  ========================================
echo   Transcribe Easy (Dev Mode)
echo  ========================================
echo.

:: ---------- Start Ollama if not already running ----------
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "try { Invoke-WebRequest 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"

if not errorlevel 1 (
    echo  [1/2] Ollama .................. already running
    goto :server
)

if "%OLLAMA_EXE%"=="" (
    echo  [1/2] Ollama .................. not found ^(translation will be unavailable^)
    goto :server
)

echo  [1/2] Ollama .................. starting
start "" /b cmd /c ""%OLLAMA_EXE%" serve > "%OLLAMA_LOG%" 2>&1"

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "$s = [System.Diagnostics.Stopwatch]::StartNew(); " ^
  "while ($s.Elapsed.TotalSeconds -lt 30) { " ^
  "  try { Invoke-WebRequest 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch {} " ^
  "  Start-Sleep -Milliseconds 600 " ^
  "} exit 1"

if errorlevel 1 (
    echo  [WARNING] Ollama slow to start. See: %OLLAMA_LOG%
) else (
    echo  [1/2] Ollama .................. ready
)

:: ---------- Open browser once server is up ----------
:server
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = [System.Diagnostics.Stopwatch]::StartNew(); " ^
  "while ($s.Elapsed.TotalSeconds -lt 45) { " ^
  "  try { if ((Invoke-WebRequest 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { Start-Process 'http://127.0.0.1:3000'; exit 0 } } catch {} " ^
  "  Start-Sleep -Milliseconds 500 " ^
  "} exit 0"

echo  [2/2] App server .............. starting
echo.
echo  ========================================
echo   Browser will open at http://127.0.0.1:3000
echo   Press Ctrl+C to stop.
echo  ========================================
echo.

"%NODE_DIR%\npx.cmd" tsx watch server.ts
