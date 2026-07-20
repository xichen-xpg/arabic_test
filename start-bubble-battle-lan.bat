@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run Bubble Battle LAN.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)
start "" "http://localhost:8787/games/bubble-battle.html"
echo Bubble Battle LAN server starting...
echo Local page: http://localhost:8787/games/bubble-battle.html
echo Share the LAN address printed below with other devices on the same network.
echo Keep this window open while playing.
echo.
node tools\bubble_battle_lan.js
pause
