from playwright.sync_api import sync_playwright

import time

import json

import os

import re

from bs4 import BeautifulSoup

from datetime import datetime, timedelta

import sys

import io

import subprocess

import time

import requests



def vpn_on():

    print("🔄 Uruchamianie VPN...")

    # Ścieżka do Twojego pliku start_vpn.bat

    subprocess.run([r"C:\Users\mateu\Desktop\Programowanie\Projekt\start_vpn.bat"], shell=True)

    time.sleep(15) # Czekamy 15 sekund, aż karta sieciowa "wstanie" i złapie IP



def vpn_off():

    print("⏹️ Wyłączanie VPN...")

    subprocess.run([r"C:\Users\mateu\Desktop\Programowanie\Projekt\stop_vpn.bat"], shell=True)



def sprawdz_ip():

    try:

        ip_info = requests.get('https://ipinfo.io/json', timeout=5).json()

        if ip_info['country'] != 'NL':

            print("UWAGA: Nie masz połączenia z NL! Przerwanie działania.")

            exit()

    except:

        print("Nie można sprawdzić IP.")



# UTF-8

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')



SPORTY = {

    "Piłka nożna": "football",

    "Koszykówka": "basketball",

    "Tenis": "tennis",

    "Piłka ręczna": "handball",

    "Boks": "boxing"

}



def hurtowy_odkurzacz():

    vpn_on()

    sprawdz_ip()



    print("-> [ODDSPORTAL] START (Wersja PLAYWRIGHT)")



    baza_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    output = os.path.join(baza_dir, "data", "zagraniczni.json")

    os.makedirs(os.path.dirname(output), exist_ok=True)



    wszystkie_mecze = []



    data_dzis = datetime.now()

    data_jutro_url = (data_dzis + timedelta(days=1)).strftime("%Y%m%d")

    data_pojutrze_url = (data_dzis + timedelta(days=2)).strftime("%Y%m%d")



    data_jutro_str = (data_dzis + timedelta(days=1)).strftime("%d.%m.%Y")

    data_pojutrze_str = (data_dzis + timedelta(days=2)).strftime("%d.%m.%Y")



    wykluczeni = ["sts", "fortuna", "superbet", "betclic", "fuksiarz"]



    # ===============================

    # PLAYWRIGHT ZAMIAST UNDETECTED

    # ===============================

    with sync_playwright() as p:

        # headless=False odpali przeglądarkę z widocznym oknem

        browser = p.chromium.launch(headless=True)

       

        # Tworzymy kontekst imitujący normalnego użytkownika

        context = browser.new_context(

            viewport={"width": 1920, "height": 1080},

            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

        )

        page = context.new_page()



        try:

            page.goto("https://www.oddsportal.com/matches/football/tomorrow/")

            time.sleep(5)



            for nazwa_sportu, sciezka_sportu in SPORTY.items():



                print(f"\n=== {nazwa_sportu} ===")



                strony = {

                    data_jutro_str: f"https://www.oddsportal.com/matches/{sciezka_sportu}/tomorrow/",

                    data_pojutrze_str: f"https://www.oddsportal.com/matches/{sciezka_sportu}/{data_pojutrze_url}/"

                }



                linki_z_danymi = []



                for dzien, url in strony.items():



                    try:

                        page.goto(url)

                        time.sleep(5)



                        # Scrollowanie w Playwright

                        page.evaluate("window.scrollTo(0, document.body.scrollHeight);")

                        time.sleep(2)



                        # Pobieramy kod strony i parsujemy tak jak wcześniej

                        soup = BeautifulSoup(page.content(), "html.parser")

                        rows = soup.find_all('div', class_='eventRow')



                        for row in rows:

                            try:

                                godzina = None

                                time_elem = row.find('div', class_='eventRow__time')

                                if time_elem:

                                    godzina = time_elem.text.strip()

                                else:

                                    txt = row.get_text(" ", strip=True)

                                    m = re.search(r"\d{2}:\d{2}", txt)

                                    if m:

                                        godzina = m.group(0)



                                for a in row.find_all('a', href=True):

                                    href = a['href']

                                    if f'/{sciezka_sportu}/' in href and '/h2h/' in href:

                                        full = "https://www.oddsportal.com" + href

                                        linki_z_danymi.append((full, dzien, godzina))

                            except:

                                continue

                    except Exception as e:

                        print(f"Błąd ładowania strony głównej sportu: {e}")



                # ✅ deduplikacja

                unikalne = []

                seen = set()



                for link, dzien, godzina in linki_z_danymi:

                    if link not in seen:

                        seen.add(link)

                        unikalne.append((link, dzien, godzina))



                print(f"Znalazłem {len(unikalne)} meczów")



                for i, (link, dzien, godzina) in enumerate(unikalne, 1):

                    print(f"[{i}] {link}")



                    try:

                        page.goto(link)

                        time.sleep(4)



                        soup = BeautifulSoup(page.content(), "html.parser")



                        h1 = soup.find('h1')

                        if not h1:

                            continue



                        title = h1.text.replace(" - Odds, Predictions and H2H Results", "")

                        title = title.replace(" vs ", " - ")



                        if " - " in title:

                            home, away = title.split(" - ", 1)

                        else:

                            home, away = title, "Brak"



                        logos = soup.find_all('img', class_='bookmaker-logo')



                        for logo in logos:

                            name = logo.get('alt', '').strip().lower()



                            if any(p in name for p in wykluczeni):

                                continue



                            row = logo.parent.parent.parent

                            if not row:

                                continue



                            odds = row.find_all('a', class_='odds-link')



                            if nazwa_sportu in ["Piłka nożna", "Piłka ręczna"] and len(odds) >= 3:

                                wszystkie_mecze.append({

                                    "id": f"oddsportal_{home}_{away}_{name}",

                                    "dyscyplina": nazwa_sportu,

                                    "dzien": dzien,

                                    "godzina": godzina if godzina else "00:00",

                                    "home": home.strip(),

                                    "away": away.strip(),

                                    "kurs_1": float(odds[0].text or 0),

                                    "kurs_X": float(odds[1].text or 0),

                                    "kurs_2": float(odds[2].text or 0),

                                    "bukmacher": name

                                })



                            elif nazwa_sportu in ["Koszykówka", "Tenis", "Boks"] and len(odds) >= 2:

                                wszystkie_mecze.append({

                                    "id": f"oddsportal_{home}_{away}_{name}",

                                    "dyscyplina": nazwa_sportu,

                                    "dzien": dzien,

                                    "godzina": godzina if godzina else "00:00",

                                    "home": home.strip(),

                                    "away": away.strip(),

                                    "kurs_1": float(odds[0].text or 0),

                                    "kurs_X": None,

                                    "kurs_2": float(odds[-1].text or 0),

                                    "bukmacher": name

                                })



                    except Exception as e:

                        print("Błąd pobierania meczu:", e)



        finally:

            # Upewniamy się, że przeglądarka się zamknie

            browser.close()

    vpn_off()

    # Zapis danych

    with open(output, "w", encoding="utf-8") as f:

        json.dump(wszystkie_mecze, f, indent=4, ensure_ascii=False)



    print("\n[OK] GOTOWE - Zapisano do zagraniczni.json")



if __name__ == "__main__":

    hurtowy_odkurzacz()

