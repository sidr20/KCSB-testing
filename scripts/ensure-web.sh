@echo off
setlocal enabledelayedexpansion

REM Move to the project root directory
cd /d "%~dp0.."

set "WEB_DIR=apps\web"
set "MANIFEST_FILE=%WEB_DIR%\package.json"
set "LOCK_FILE=%WEB_DIR%\package-lock.json"
set "STAMP_FILE=%WEB_DIR%\node_modules\.install-state"

REM 1. Check if the frontend directory exists
if not exist "%WEB_DIR%\" (
    echo Error: expected frontend at %WEB_DIR%\.
    exit /b 1
)

REM 2. Check if npm is installed (using 'where' instead of 'command -v')
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm not found in PATH.
    exit /b 1
)

REM 3. Determine whether to use 'install' or 'ci' based on package-lock.json
set "INSTALL_CMD=npm --prefix "%WEB_DIR%" install"
set "HASH_TARGETS='%MANIFEST_FILE%'"

if exist "%LOCK_FILE%" (
    set "INSTALL_CMD=npm --prefix "%WEB_DIR%" ci"
    set "HASH_TARGETS='%MANIFEST_FILE%', '%LOCK_FILE%'"
)

REM 4. Calculate current state hash using PowerShell
powershell -NoProfile -Command "$files = @(%HASH_TARGETS%); $hash = ''; foreach ($f in $files) { $hash += (Get-FileHash -Algorithm SHA256 $f).Hash }; Write-Output $hash" > .temp_hash
set /p CURRENT_STATE=<.temp_hash
del .temp_hash

REM 5. Read the previously installed state
set "INSTALLED_STATE="
if exist "%STAMP_FILE%" (
    set /p INSTALLED_STATE=<%STAMP_FILE%
)

REM 6. Determine if installation is needed
set "NEEDS_INSTALL=0"
if not exist "%WEB_DIR%\node_modules\" set "NEEDS_INSTALL=1"
if "!CURRENT_STATE!" neq "!INSTALLED_STATE!" set "NEEDS_INSTALL=1"

REM 7. Install if necessary and update the stamp file
if "!NEEDS_INSTALL!"=="1" (
    echo Installing web dependencies in %WEB_DIR%\ ...
    %INSTALL_CMD%
    
    REM Ensure the node_modules directory exists before writing the stamp file
    if not exist "%WEB_DIR%\node_modules\" mkdir "%WEB_DIR%\node_modules"
    echo !CURRENT_STATE!>"%STAMP_FILE%"
)