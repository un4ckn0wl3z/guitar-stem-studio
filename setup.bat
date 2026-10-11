@echo off
REM First-time setup (Windows)
cd /d "%~dp0"
python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install --no-deps basic-pitch==0.4.0
echo.
echo Setup complete. Run run.bat
pause
