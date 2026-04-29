@echo off

REM Move to the project root directory
cd /d "%~dp0.."

REM Call the web setup script (assuming you translate this one too)
call scripts\ensure-web.bat

REM Run the web frontend using npm
npm --prefix apps\web run dev