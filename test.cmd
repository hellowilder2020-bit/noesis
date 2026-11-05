@echo off
rem AI Pentester — run the backend test suite (unit + integration)
setlocal
cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
    echo [error] No .venv found. Run "install.cmd" first.
    exit /b 1
)

.venv\Scripts\python.exe -m pytest backend\tests %*
endlocal
