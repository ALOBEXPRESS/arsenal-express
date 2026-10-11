@echo off
title Conector SyncExpress - CapCut
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)
node "%~dp0syncexpress-bridge.mjs"
pause
