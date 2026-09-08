@echo off
setlocal

set "WIREGUARD=C:\Program Files\WireGuard\wireguard.exe"
set "TUNNEL_NAME=scraper_nl_new"
set "CONFIG_PATH=C:\Users\mateu\Desktop\Programowanie\Projekt\scraper_nl_new.conf"

echo [VPN] Usuwanie poprzedniej instancji tunelu...
"%WIREGUARD%" /uninstalltunnelservice "%TUNNEL_NAME%" >nul 2>&1

timeout /t 2 /nobreak >nul

if not exist "%CONFIG_PATH%" (
    echo [VPN ERROR] Nie znaleziono konfiguracji:
    echo %CONFIG_PATH%
    exit /b 1
)

echo [VPN] Uruchamianie tunelu %TUNNEL_NAME%...
"%WIREGUARD%" /installtunnelservice "%CONFIG_PATH%"

if errorlevel 1 (
    echo [VPN ERROR] Nie udalo sie uruchomic tunelu.
    exit /b 1
)

echo [VPN] Tunel zostal uruchomiony.
exit /b 0