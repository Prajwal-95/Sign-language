@echo off
REM Start the FastAPI backend.
REM   run.bat        -> dev mode (auto-reload)
REM   run.bat prod   -> no auto-reload

cd /d "%~dp0"

REM Create .env from example on first run
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [i] Created .env from .env.example
    )
)

REM Kill any stale process already bound to port 8000 to avoid
REM "Address already in use" (Errno 10048) on restart.
for /f "tokens=2,5 delims=^: " %%a in ('netstat -ano ^| findstr ":8000"') do (
    echo [i] Killing stale process on port 8000 (PID %%b)
    taskkill /F /PID %%b 2>nul
)

if "%1"=="prod" (
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
) else (
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
)