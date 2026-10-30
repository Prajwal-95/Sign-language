@echo off
REM Start both the FastAPI backend and the Vite frontend.
REM   run-all.bat        -> dev mode (auto-reload on both)
REM   run-all.bat prod   -> no auto-reload

cd /d "%~dp0"

echo [i] Starting backend...
start "Backend" cmd /c "backend\run.bat %1"

echo [i] Starting frontend...
start "Frontend" cmd /c "cd frontend && npm run dev"

echo [i] Starting local speech service (Hindi / Kannada offline TTS)...
start "Speech" cmd /c "frontend\tools\tts-service\run.bat"

echo [i] Done. Backend on :8000, frontend on :5173, speech on :8765.
pause