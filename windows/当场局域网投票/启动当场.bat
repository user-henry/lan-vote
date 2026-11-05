@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 当场 · 局域网投票
echo 正在启动当场...
"%~dp0node.exe" "%~dp0server.mjs"
echo.
echo 当场已停止。
pause
