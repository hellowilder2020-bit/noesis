@echo off
rem AI Pentester — one-time setup for Windows (creates .venv, installs deps, builds UI)
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo [error] Python was not found on PATH. Install Python 3.12-3.14 from https://python.org
    exit /b 1
)

if not exist .venv\Scripts\python.exe (
    echo Creating virtual environment...
    python -m venv .venv
)

echo Upgrading pip...
.venv\Scripts\python.exe -m pip install -U pip

echo Installing backend dependencies ^(includes Semgrep^)...
.venv\Scripts\python.exe -m pip install -e "backend[dev]" "semgrep>=1.80" "GitPython>=3.1"
if errorlevel 1 (
    echo [error] Backend install failed. If you are on Python 3.15+, install Python 3.12-3.14
    echo         and re-run this script ^(Semgrep wheels do not support 3.15 yet^).
    exit /b 1
)

echo Building frontend...
pushd frontend
call npm install
if errorlevel 1 (
    echo [error] npm install failed. Is Node.js 18+ installed?
    popd
    exit /b 1
)
call npm run build
if errorlevel 1 (
    echo [error] Frontend build failed.
    popd
    exit /b 1
)
popd

echo.
echo Setup complete. Run "run.cmd" to start the app at http://127.0.0.1:8000
endlocal
