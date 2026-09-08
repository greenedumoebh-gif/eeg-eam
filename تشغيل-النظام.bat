@echo off
chcp 65001 >nul
title نظام الخدمات المساندة المطور - عرض تجريبي
cd /d "%~dp0"

echo ============================================
echo   نظام الخدمات المساندة المطور - عرض تجريبي
echo ============================================
echo.

where deno >nul 2>nul
if errorlevel 1 (
  echo » تثبيت Deno لاول مرة ^(مرة واحدة فقط^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://deno.land/install.ps1 | iex"
  set "PATH=%USERPROFILE%\.deno\bin;%PATH%"
)

set INSECURE_COOKIES=true
set DEMO_MODE=true
set KV_PATH=%CD%\data\demo.db
if not exist "%CD%\data" mkdir "%CD%\data"

echo » تشغيل الخادم على http://localhost:8000
echo » لايقاف النظام: اغلق هذه النافذة او اضغط Ctrl+C
echo.

start "" http://localhost:8000
deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv src/main.ts
pause
