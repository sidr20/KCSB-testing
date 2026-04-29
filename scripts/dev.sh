@echo off

REM Move to the project root directory
cd /d "%~dp0.."

REM Preflight sequentially so installs don't run concurrently.
call scripts\ensure-python.bat
call scripts\ensure-web.bat
call scripts\warn-openai-key.bat

echo Starting API + Web dev servers ...

REM Launch the API server in a new window
REM "cmd /k" ensures the window stays open so you can see the logs
start "API Server" cmd /k ".venv\Scripts\python.exe -m apps.api"

REM Launch the Web server in a second new window
start "Web Server" cmd /k "npm --prefix apps\web run dev"

echo Servers are running in separate windows! 
echo To stop the servers, simply close those new terminal windows.