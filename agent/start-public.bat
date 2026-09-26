@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if "%CONTROL_AGENT_TOKEN%"=="" (
  set /p CONTROL_AGENT_TOKEN=Enter a strong token for this session: 
)

echo.
echo [1/3] Installing Python dependencies...
py -m pip install -r requirements.txt
if errorlevel 1 (
  echo Python installation/dependencies failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Starting the Windows agent...
start "Control Agent Windows" cmd /k "set CONTROL_AGENT_TOKEN=%CONTROL_AGENT_TOKEN%&& cd /d "%~dp0"&& py agent.py"

echo.
echo [3/3] Preparing Cloudflare Quick Tunnel...
set "CF=%~dp0cloudflared.exe"

if not exist "%CF%" (
  echo Downloading cloudflared...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'; Invoke-WebRequest -Uri $u -OutFile '%CF%'"
  if errorlevel 1 (
    echo Could not download cloudflared.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo  PUBLIC WSS TUNNEL
echo  Keep this window open while controlling the PC.
echo ============================================================
echo.
echo Wait for a line containing:
echo   https://xxxxx.trycloudflare.com
echo.
echo In Control Agent, use:
echo   wss://xxxxx.trycloudflare.com
echo.
echo Token:
echo   %CONTROL_AGENT_TOKEN%
echo.
echo ============================================================
echo.

"%CF%" tunnel --url http://127.0.0.1:8765

pause
