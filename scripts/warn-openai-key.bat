@echo off

REM Move to the project root directory
cd /d "%~dp0.."

REM 1. Check if the .env file exists at all
if not exist ".env" (
    echo Warning: .env not found. Insight generation will fail until OPENAI_API_KEY is configured.
    exit /b 0
)

REM 2. Search the .env file for the API key using findstr (Windows equivalent of grep)
REM The regex "^OPENAI_API_KEY=." ensures the line starts with the key and has at least one character after the equals sign
findstr /R "^OPENAI_API_KEY=." ".env" >nul

if %errorlevel% neq 0 (
    echo Warning: OPENAI_API_KEY is not configured in .env. /api/insights will fail.
)