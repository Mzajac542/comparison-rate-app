@echo off
setlocal

set "WIREGUARD=C:\Program Files\WireGuard\wireguard.exe"
set "TUNNEL_NAME=scraper_nl_new"

echo [VPN] Wylaczanie tunelu %TUNNEL_NAME%...
"%WIREGUARD%" /uninstalltunnelservice "%TUNNEL_NAME%" >nul 2>&1

if errorlevel 1 (
    echo [VPN] Tunel byl juz wylaczony albo usluga nie istniala.
    exit /b 0
)

echo [VPN] Tunel zostal wylaczony.
exit /b 0