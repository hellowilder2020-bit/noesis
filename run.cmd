@echo off
rem AI Pentester — start the backend + UI on http://127.0.0.1:8000
setlocal
cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
    echo [error] No .venv found. Run "install.cmd" first.
    exit /b 1
)

.venv\Scripts\python.exe -m uvicorn aipentester.main:app --port 8000
endlocal
