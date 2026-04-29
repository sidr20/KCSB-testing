@echo off

REM Move to the project root directory
cd /d "%~dp0.."

REM Make sure Python and Web dependencies are set up
call scripts\ensure-python.bat
call scripts\ensure-web.bat

echo Running API checks...
.venv\Scripts\python.exe -c "import apps.api.__main__"
.venv\Scripts\python.exe -m unittest discover -s apps\api\tests -v

echo Running Web tests...
node apps\web\tests\evidenceNavigation.test.mjs
node apps\web\tests\pbpAdvancedFilters.test.mjs

echo Building Web project...
npm --prefix apps\web run build

echo All CI checks completed!