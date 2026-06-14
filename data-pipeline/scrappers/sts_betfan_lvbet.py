from playwright.sync_api import sync_playwright

import time

import json

import os

import re

from bs4 import BeautifulSoup

from datetime import datetime, timedelta

import sys

import io



# Wymuszamy kodowanie UTF-8 dla konsoli

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')



SPORTY = {

    "Piłka nożna": "football",

    "Koszykówka": "basketball",

    "Tenis": "tennis",

    "Piłka ręczna": "handball",

    "Boks": "boxing"

}



# BEZPIECZNY PARSER KURSÓW

def parsuj_kurs(element):

    if not element:

        return 0.0

    tekst = element.text.strip()

    if not tekst or tekst == "-":

        return 0.0

    try:

        oczyszczony = re.sub(r'[^\d.]', '', tekst)

        return float(oczyszczony) if oczyszczony else 0.0

    except ValueError:

        return 0.0



def pobierz_polskich_z_oddsportal():

    print("-> [POLSCY BUKMACHERZY - ODDSPORTAL] START (Jutro + Pojutrze)")



    baza_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    output = os.path.join(baza_dir, "data", "polscy_bukmacherzy.json")

    os.makedirs(os.path.dirname(output), exist_ok=True)



    wszystkie_mecze = []

    data_dzis = datetime.now()

    data_jutro_url = (data_dzis + timedelta(days=1)).strftime("%Y%m%d")

    data_jutro_str = (data_dzis + timedelta(days=1)).strftime("%d.%m.%Y")

    data_pojutrze_url = (data_dzis + timedelta(days=2)).strftime("%Y%m%d")

    data_pojutrze_str = (data_dzis + timedelta(days=2)).strftime("%d.%m.%Y")



    with sync_playwright() as p:

        browser = p.chromium.launch(headless=False)  # Widoczne okno, ułatwia debugowanie wizualne

        context = browser.new_context(

            viewport={"width": 1920, "height": 1080},

            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

        )

        page = context.new_page()



        try:

            for nazwa_sportu, sciezka_sportu in SPORTY.items():

                print(f"\n=== ROZPOCZĘTO SKANOWANIE SPORTU: {nazwa_sportu} ===")

                strony = {

                    data_jutro_str: f"https://www.oddsportal.com/matches/{sciezka_sportu}/{data_jutro_url}/",

                    data_pojutrze_str: f"https://www.oddsportal.com/matches/{sciezka_sportu}/{data_pojutrze_url}/"

                }



                linki_z_danymi = []

                for dzien, url in strony.items():

                    try:

                        print(f" -> Pobieranie listy spotkań dla dnia: {dzien} | URL: {url}")

                        page.goto(url, wait_until="networkidle")

                        time.sleep(2)

                       

                        # Stopniowe przewijanie listy głównej

                        for i in range(4):

                            page.evaluate("window.scrollBy(0, 1500);")

                            time.sleep(0.8)

                        page.evaluate("window.scrollTo(0, document.body.scrollHeight);")

                        time.sleep(1.5)

                       

                        soup = BeautifulSoup(page.content(), "html.parser")

                        rows = soup.find_all('div', class_=re.compile(r'eventRow'))

                       

                        dzienne_linki_count = 0

                        for row in rows:

                            time_elem = row.find('div', class_=re.compile(r'time'))

                            godzina = time_elem.text.strip() if time_elem else "00:00"

                           

                            for a in row.find_all('a', href=True):

                                href = a['href']

                                href_clean = href.split('?')[0].strip('/')

                                parts = href_clean.split('/')

                               

                                if len(parts) >= 4 and parts[0] == sciezka_sportu:

                                    if not any(x in parts for x in ['results', 'standings', 'teams', 'archive']):

                                        match_url = "https://www.oddsportal.com/" + href_clean + "/"

                                        linki_z_danymi.append((match_url, dzien, godzina))

                                        dzienne_linki_count += 1

                                       

                        print(f"    [*] Wykryto {dzienne_linki_count} surowych odnośników do meczów na dzień {dzien}")

                                       

                    except Exception as e:

                        print(f"    [!] Błąd podczas parsowania listy głównej: {e}")



                # Usuwanie duplikatów linków

                unikalne = list({(l[0], l[1], l[2]): l for l in linki_z_danymi}.values())

                print(f" -> Znaleziono {len(unikalne)} unikalnych meczów dla dyscypliny {nazwa_sportu}. Przechodzę do pobierania kursów...")



                for idx, (link, dzien, godzina) in enumerate(unikalne, start=1):

                    try:

                        print(f"    [{idx}/{len(unikalne)}] Ładowanie szczegółów meczu: {link}")

                       

                        # Zmiana na networkidle pozwala wczytać asynchroniczne skrypty w tle

                        page.goto(link, wait_until="networkidle", timeout=25000)

                       

                        # Lekkie przewinięcie, aby wymusić Lazy Loading tabeli z kursami

                        page.evaluate("window.scrollBy(0, 350);")

                        time.sleep(1)

                       

                        # JAWNE OCZEKIWANIE NA LOGOTYP: Zabezpieczenie przed "loading skeleton" (pustymi szarymi paskami)

                        try:

                            page.wait_for_selector("img[class*='bookmaker-logo']", timeout=7000)

                        except Exception:

                            print(f"      [!] Timeout: Tabela kursów nie wyrenderowała się na czas (Pusta strona / Brak kursów). Pomijam.")

                            continue

                       

                        # Pobieramy drzewo DOM dopiero po upewnieniu się, że logotypy fizycznie istnieją

                        soup = BeautifulSoup(page.content(), "html.parser")

                        h1 = soup.find('h1')

                        if not h1:

                            print("      [!] Nie znaleziono nagłówka H1 z nazwą zespołów. Pomijam.")

                            continue

                       

                        title_raw = h1.text.strip()

                        title_clean = re.sub(r'\s*-\s*Odds,\s*Predictions.*$', '', title_raw, flags=re.IGNORECASE)

                        title_clean = title_clean.replace(" vs ", " - ")

                       

                        if " - " in title_clean:

                            home, away = title_clean.split(" - ", 1)

                        else:

                            home, away = title_clean, "Brak"



                        logos = soup.find_all('img', class_=re.compile(r'bookmaker-logo'))

                       

                        total_books_found = len(logos)

                        polish_books_saved = 0

                       

                        # Jeśli wykryto logotypy, parsujemy wiersze

                        for logo in logos:

                            try:

                                name = logo.get('alt', '').strip().lower()

                                bukmacher_nazwa = None

                               

                                if "sts" in name: bukmacher_nazwa = "STS"

                                elif "betfan" in name: bukmacher_nazwa = "BETFAN"

                                elif "lv bet" in name or "lvbet" in name: bukmacher_nazwa = "LV BET"

                                else: continue # Jeśli to zagraniczny buk, pomijamy go bez logowania błędu



                                row = logo.parent.parent.parent

                                if not row: continue

                               

                                odds = row.find_all('a', class_=re.compile(r'odds-link'))



                                # LOGIKA 3-DROGOWA (Piłka nożna, Piłka ręczna)

                                if nazwa_sportu in ["Piłka nożna", "Piłka ręczna"] and len(odds) >= 3:

                                    kursy = {

                                        "id": f"{bukmacher_nazwa.lower()}_{home.strip()}_{away.strip()}",

                                        "mecz": f"{home.strip()} - {away.strip()}",

                                        "dyscyplina": nazwa_sportu,

                                        "dzien": dzien,

                                        "godzina": godzina,

                                        "home": home.strip(),

                                        "away": away.strip(),

                                        "kurs_1": parsuj_kurs(odds[0]),

                                        "kurs_X": parsuj_kurs(odds[1]),

                                        "kurs_2": parsuj_kurs(odds[2]),

                                        "bukmacher": bukmacher_nazwa

                                    }

                                    wszystkie_mecze.append(kursy)

                                    polish_books_saved += 1

                                    print(f"       [+] {bukmacher_nazwa}: {home.strip()} - {away.strip()} ({kursy['kurs_1']} | {kursy['kurs_X']} | {kursy['kurs_2']})")



                                # LOGIKA 2-DROGOWA (Koszykówka, Tenis, Boks)

                                elif nazwa_sportu in ["Koszykówka", "Tenis", "Boks"] and len(odds) >= 2:

                                    kursy = {

                                        "id": f"{bukmacher_nazwa.lower()}_{home.strip()}_{away.strip()}",

                                        "mecz": f"{home.strip()} - {away.strip()}",

                                        "dyscyplina": nazwa_sportu,

                                        "dzien": dzien,

                                        "godzina": godzina,

                                        "home": home.strip(),

                                        "away": away.strip(),

                                        "kurs_1": parsuj_kurs(odds[0]),

                                        "kurs_X": None,

                                        "kurs_2": parsuj_kurs(odds[-1]),

                                        "bukmacher": bukmacher_nazwa

                                    }

                                    wszystkie_mecze.append(kursy)

                                    polish_books_saved += 1

                                    print(f"       [+] {bukmacher_nazwa}: {home.strip()} - {away.strip()} ({kursy['kurs_1']} | {kursy['kurs_2']})")

                           

                            except Exception as row_err:

                                continue

                               

                        # Log podsumowujący parsowanie konkretnego meczu

                        if polish_books_saved > 0:

                            print(f"      [INFO] Sukces: Na {total_books_found} znalezionych bukmacherów, zapisano {polish_books_saved} polskich.")

                        else:

                            print(f"      [INFO] Pomiń: Tabela załadowana (ogółem bukmacherów: {total_books_found}), ale brak oferty od STS/BETFAN/LVBET dla tego meczu.")



                    except Exception as e:

                        print(f"    [!] Krytyczny błąd przy przetwarzaniu meczu {link}: {e}")

                        continue

        finally:

            print("\n-> Zamykanie przeglądarki...")

            browser.close()



    # Zapis końcowy danych

    with open(output, "w", encoding="utf-8") as f:

        json.dump(wszystkie_mecze, f, indent=4, ensure_ascii=False)

    print(f"\n[OK] PROCES ZAKOŃCZONY - Zapisano łącznie {len(wszystkie_mecze)} rekordów kursów do pliku: {output}")



if __name__ == "__main__":

    pobierz_polskich_z_oddsportal()