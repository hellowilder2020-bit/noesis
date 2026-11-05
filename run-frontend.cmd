@echo off
rem AI Pentester — Vite dev server for frontend development (proxies /api to :8000)
setlocal
cd /d "%~dp0frontend"

if not exist node_modules (
    call npm install
)
call npm run dev
endlocal
