

@echo off

REM Move to the project root directory (one level up from where this script is located)
cd /d "%~dp0.."

REM Call the other scripts (assuming you translate these to .bat as well)
call scripts\ensure-python.bat
call scripts\warn-openai-key.bat

REM Run the Python API using the Windows virtual environment path
.venv\Scripts\python.exe -m apps.api