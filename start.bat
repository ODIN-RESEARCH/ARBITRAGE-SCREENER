@echo off
title ODIN RESEARCH - Arbitrage Screener
cd /d "%~dp0"

echo ========================================================
echo   ODIN RESEARCH (odinresearch.com)
echo   Cross-Venue Arbitrage Screener and Backtester
echo ========================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not found in system PATH.
    echo Please install Python 3.10+ and re-run start.bat.
    echo.
    pause
    exit /b 1
)

echo Checking dependencies...
python -c "import fastapi, uvicorn, requests, pandas, numpy" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing dependencies from requirements.txt...
    pip install -r requirements.txt --quiet
)

echo Starting Arbitrage Screener...
python server.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server exited with an error code.
    pause
)
