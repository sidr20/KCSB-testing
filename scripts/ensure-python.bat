@echo off
setlocal enabledelayedexpansion

REM Move to the project root directory
cd /d "%~dp0.."

set "VENV_PYTHON=.venv\Scripts\python.exe"
set "REQ_FILE=requirements.txt"
set "STAMP_FILE=.venv\.requirements.sha256"

REM 1. Check if virtual environment exists
if not exist "%VENV_PYTHON%" (
    echo Creating Python venv at .venv\ ...
    REM Windows usually uses 'python' instead of 'python3'
    python -m venv .venv
    if errorlevel 1 (
        echo Error: python not found or venv creation failed.
        exit /b 1
    )
)

REM 2. Check if requirements.txt exists
if not exist "%REQ_FILE%" (
    echo Error: %REQ_FILE% not found ^(expected at repo root^).
    exit /b 1
)

REM 3. Calculate current SHA256 hash using Python
"%VENV_PYTHON%" -c "import hashlib, pathlib; print(hashlib.sha256(pathlib.Path('%REQ_FILE%').read_bytes()).hexdigest())" > .venv\.temp_hash
set /p CURRENT_HASH=<.venv\.temp_hash
del .venv\.temp_hash

REM 4. Read the previously installed hash
set "INSTALLED_HASH="
if exist "%STAMP_FILE%" (
    set /p INSTALLED_HASH=<%STAMP_FILE%
)

REM 5. Compare hashes and install if they are different
if "%CURRENT_HASH%" neq "%INSTALLED_HASH%" (
    echo Installing Python dependencies from %REQ_FILE% ...
    "%VENV_PYTHON%" -m pip install --upgrade pip >nul
    "%VENV_PYTHON%" -m pip install -r "%REQ_FILE%"
    
    REM Save the new hash to the stamp file
    echo %CURRENT_HASH%>"%STAMP_FILE%"
)