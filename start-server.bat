@echo off
title Tiger Locker - Real Backend & Master Server
echo ========================================================
echo        🐅 TIGER LOCKER MASTER SYSTEM LAUNCHER
echo ========================================================
echo.
echo Starting Backend API & WebSocket Server on Port 3000...
echo.

cd /d "%~dp0backend"
start cmd /k "node server.js"

timeout /t 2 /nobreak >nul

echo Opening Web Control Dashboard...
start http://localhost:3000

echo.
echo ========================================================
echo  Server is Running!
echo  APK Location: %~dp0apk\TigerLocker-v1.0.apk
echo ========================================================
pause
