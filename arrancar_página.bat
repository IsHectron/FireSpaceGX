
@echo off
title Iniciar FireSpace

echo ==================================
echo       INICIANDO FIRESPACE
echo ==================================

echo.
echo [1/2] Iniciando servidor Flask...

start "FireSpace - Flask" /D "%~dp0" cmd /k "python app.py"

echo Esperando a que Flask inicie...
timeout /t 3 /nobreak >nul

echo.
echo [2/2] Iniciando Cloudflare Tunnel...

start "FireSpace - Cloudflare" /D "%~dp0" cmd /k ""C:\Users\hectr\Downloads\cloudflared-windows-amd64.exe" tunnel --url http://localhost:5000"

echo.
echo FireSpace se esta iniciando.
echo Revisa la ventana de Cloudflare para obtener tu URL publica.
echo.
pause