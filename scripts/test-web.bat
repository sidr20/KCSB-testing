@echo off

REM Move to the project root directory
cd /d "%~dp0.."

REM Make sure Web dependencies are set up
call scripts\ensure-web.bat

REM Run the Web tests
node apps\web\tests\evidenceNavigation.test.mjs
node apps\web\tests\pbpAdvancedFilters.test.mjs