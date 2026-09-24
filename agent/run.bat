@echo off
setlocal
cd /d "%~dp0"
if "%CONTROL_AGENT_TOKEN%"=="" set "CONTROL_AGENT_TOKEN=change-me"
python -m pip install -r requirements.txt
python agent.py
pause
