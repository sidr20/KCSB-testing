@echo off

REM Move to the project root directory
cd /d "%~dp0.."

REM Make sure Python and dependencies are set up
call scripts\ensure-python.bat

REM Run the Python unit tests
.venv\Scripts\python.exe -m unittest discover -s apps\api\tests -v