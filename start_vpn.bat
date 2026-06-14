@echo off
:: 1. Najpierw ubijamy tunel (jeśli istnieje, by uniknąć błędu "Odmowa dostępu")
"C:\Program Files\WireGuard\wireguard.exe" /uninstalltunnelservice proton_eu-NL-FREE-197 >nul 2>&1

:: 2. Uruchamiamy na czysto (tutaj cudzysłowy obejmujące całą ścieżkę MUSZĄ być)
"C:\Program Files\WireGuard\wireguard.exe" /installtunnelservice "C:\Users\mateu\Desktop\Programowanie\Projekt\proton_eu-NL-FREE-197.conf"