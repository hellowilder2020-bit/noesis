@echo off
rem AI Pentester — build the frontend and start the production server on http://127.0.0.1:8000
setlocal
cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
    echo [error] No .venv found. Run "install.cmd" first.
    exit /b 1
)

echo [1/2] Building frontend...
pushd frontend
call npm.cmd run build
if errorlevel 1 (
    echo [error] Frontend build failed.
    popd
    exit /b 1
)
popd

echo [2/2] Starting server on http://127.0.0.1:8000 ...
.venv\Scripts\python.exe -m uvicorn aipentester.main:app --port 8000
endlocal
