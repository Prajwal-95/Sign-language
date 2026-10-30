@echo off
REM ---------------------------------------------------------------------------
REM One-time setup for the ISL local speech service (Hindi + Kannada).
REM Creates a private Python environment, installs the engine and downloads the
REM voice models. After this, run.bat starts the service.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo.
echo  ISL local speech service - setup
echo  ================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [X] Python 3.9 or newer was not found on PATH.
  echo     Install it from https://www.python.org/downloads/ and tick
  echo     "Add python.exe to PATH" during setup.
  echo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/3] Creating a private Python environment in .venv ...
  python -m venv .venv
  if errorlevel 1 (
    echo [X] Could not create the environment.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Reusing the existing .venv environment.
)

echo [2/3] Installing the engine (this downloads CPU PyTorch, ~200 MB) ...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo.
echo [3/3] Downloading the Hindi and Kannada voice models (~290 MB) ...
echo       They are cached in .\models and are never bundled into the app.
".venv\Scripts\python.exe" download_models.py
if errorlevel 1 goto :failed

echo.
echo  Setup complete. Start the service with:
echo      run.bat
echo.
echo  The frontend finds it automatically at http://127.0.0.1:8765.
echo.
pause
exit /b 0

:failed
echo.
echo [X] Setup failed. Review the message above and try again.
echo.
pause
exit /b 1