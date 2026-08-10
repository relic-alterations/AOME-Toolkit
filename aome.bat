@echo off
setlocal

if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="restart" goto restart

echo Usage: aome.bat [start^|stop^|restart]
exit /b 1

:start
echo --- Starting AOME Suite ---
echo Starting Backend (FastAPI)...
start "AOME Backend" cmd /c "cd backend && pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo Starting Frontend (Vite)...
start "AOME Frontend" cmd /c "cd frontend && npm install && npm run dev"
echo AOME is fully operational.
echo The backend is running at http://localhost:8000
echo The frontend is running at http://localhost:5173
echo Close this window or run 'aome.bat stop' to terminate the servers.
goto :eof

:stop
echo --- Stopping AOME Suite ---
taskkill /FI "WINDOWTITLE eq AOME Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq AOME Frontend*" /T /F >nul 2>&1
echo AOME has been stopped.
goto :eof

:restart
call :stop
timeout /t 2 /nobreak >nul
call :start
goto :eof
