@echo off
:: Wymuszenie zamknięcia procesu WireGuard
taskkill /f /im wireguard.exe

:: Wyłączenie interfejsu sieciowego VPN
netsh interface set interface "proton_eu-NL-FREE-197" disable