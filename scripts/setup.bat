@echo off

REM Move to the project root directory
cd /d "%~dp0.."

REM Run the setup scripts for Python and Web
call scripts\ensure-python.bat
call scripts\ensure-web.bat

REM Check if .env is missing AND .env.example exists
if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env from .env.example ...
        copy ".env.example" ".env" >nul
    )
)

echo Setup complete.