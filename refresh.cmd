@echo off
REM career-ops freshness refresh — wrapper for Windows Task Scheduler.
REM Runs the scan + bounded liveness sweep and appends a summary to data\refresh.log.
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" refresh.mjs --max-age-days 30 --liveness-limit 15 >> "data\refresh.log" 2>&1
