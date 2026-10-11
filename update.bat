@echo off
cd /d "%~dp0"
call .venv\Scripts\activate.bat
pip install -U "yt-dlp[default]" deno imageio-ffmpeg pdfplumber pyguitarpro
echo.
echo Update complete.
pause
