@echo off
REM ---------------------------------------------------------------------------
REM Start the ISL local speech service. Leave this window open while using the
REM translator; closing it puts Hindi and Kannada speech back to "service
REM offline" in the app.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [X] The speech service has not been set up yet.
  echo     Run install.bat first.
  echo.
  pause
  exit /b 1
)

REM Kill any stale process already bound to port 8765 to avoid
REM "Address already in use" (Errno 10048) on restart.
for /f "tokens=2,5 delims=^: " %%a in ('netstat -ano ^| findstr ":8765"') do (
  echo [i] Killing stale process on port 8765 (PID %%b)
  taskkill /F /PID %%b 2>nul
)

echo.
echo  ISL local speech service
echo  ------------------------
echo  Health check : http://127.0.0.1:8765/health
echo  Stop it      : close this window or press Ctrl+C
echo.

".venv\Scripts\python.exe" service.py
if errorlevel 1 (
  echo.
  echo [X] The service stopped with an error. See the message above.
  pause
)