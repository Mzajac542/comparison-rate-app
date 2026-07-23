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

# HELPER DO SZYBKIEGO PARSOWANIA TABEL (1X2, BTTS, DC)
def parse_standard_odds(html_content):
    soup = BeautifulSoup(html_content, "html.parser")
    logos = soup.find_all('img')
    wyniki = {}
    
    for logo in logos:
        name = logo.get('alt', '').strip().lower()
        src = logo.get('src', '').strip().lower()
        
        buk = None
        if "sts" in name or "sts" in src: buk = "STS"
        elif "betfan" in name or "betfan" in src: buk = "BETFAN"
        elif "lv bet" in name or "lvbet" in name or "lvbet" in src: buk = "LV BET"
        
        if not buk: continue
        
        # Wspinaczka po drzewie DOM, aby znaleźć wiersz z kursami przypisany do logo
        row = None
        parent = logo.parent
        for _ in range(8):
            if not parent: break
            if parent.find_all('a', class_=re.compile(r'odds-link|odds')):
                row = parent
                break
            parent = parent.parent
            
        if not row: continue
        
        odds_elements = row.find_all('a', class_=re.compile(r'odds-link|odds'))
        if odds_elements:
            # Pobieramy tylko te, które są większe od zera (omijamy puste elementy)
            kursy = [parsuj_kurs(odd) for odd in odds_elements if parsuj_kurs(odd) > 0]
            if kursy:
                wyniki[buk] = kursy
            
    return wyniki

# HELPER DO KLIKANIA ZAKŁADEK (obsługa "More")
def wejdz_w_zakladke(page_obj, tab_name):
    # Najpierw sprawdzamy, czy zakładka jest bezpośrednio widoczna na głównym pasku
    tab = page_obj.locator(f'text="{tab_name}" >> visible=true').first
    if tab.count() > 0:
        tab.click(force=True)
        page_obj.wait_for_timeout(2000)
        return True
        
    # Jeśli jej nie ma, rozwijamy listę "More" (o ile istnieje)
    more_btn = page_obj.locator('text="More" >> visible=true').first
    if more_btn.count() > 0:
        more_btn.click(force=True)
        page_obj.wait_for_timeout(1000) # czekamy na animację rozwinięcia
        
        # Szukamy zakładki wewnątrz otwartej listy
        tab_in_more = page_obj.locator(f'text="{tab_name}" >> visible=true').first
        if tab_in_more.count() > 0:
            tab_in_more.click(force=True)
            page_obj.wait_for_timeout(2000)
            return True
            
    return False

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
        browser = p.chromium.launch(headless=True)
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
                        if page.is_closed():
                            page = context.new_page()

                        print(f" -> Pobieranie listy spotkań dla dnia: {dzien} | URL: {url}")
                        page.goto(url, wait_until="domcontentloaded", timeout=30000)
                        
                        max_prob = 6
                        dzienne_linki_count = 0
                        soup = None
                        
                        for proba in range(max_prob):
                            page.evaluate("window.scrollBy(0, 800);")
                            time.sleep(1.5)
                            soup = BeautifulSoup(page.content(), "html.parser")
                            
                            test_links_count = 0
                            for a in soup.find_all('a', href=True):
                                href_clean = a['href'].split('?')[0].strip('/')
                                parts = href_clean.split('/')
                                if len(parts) >= 4 and parts[0] == sciezka_sportu:
                                    if not any(x in parts for x in ['results', 'standings', 'teams', 'archive']):
                                        test_links_count += 1
                            
                            if test_links_count > 0 or "no matches" in soup.text.lower() or "brak spotkań" in soup.text.lower():
                                break
                            print(f"    [INFO] Brak wyrenderowanych meczów w próbie {proba+1}/{max_prob}. Przewijam dalej...")

                        page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                        time.sleep(1.0)
                        soup = BeautifulSoup(page.content(), "html.parser")
                        
                        rows = soup.find_all('div', class_=re.compile(r'eventRow'))
                        if rows:
                            for row in rows:
                                time_elem = row.find('div', class_=re.compile(r'time'))
                                godzina = time_elem.text.strip() if time_elem else "00:00"
                                
                                for a in row.find_all('a', href=True):
                                    href_clean = a['href'].split('?')[0].strip('/')
                                    parts = href_clean.split('/')
                                    
                                    if len(parts) >= 4 and parts[0] == sciezka_sportu:
                                        if not any(x in parts for x in ['results', 'standings', 'teams', 'archive']):
                                            match_url = "https://www.oddsportal.com/" + href_clean + "/"
                                            linki_z_danymi.append((match_url, dzien, godzina))
                                            dzienne_linki_count += 1
                        
                        if dzienne_linki_count == 0:
                            for a in soup.find_all('a', href=True):
                                href_clean = a['href'].split('?')[0].strip('/')
                                parts = href_clean.split('/')
                                
                                if len(parts) >= 4 and parts[0] == sciezka_sportu:
                                    if not any(x in parts for x in ['results', 'standings', 'teams', 'archive']):
                                        match_url = "https://www.oddsportal.com/" + href_clean + "/"
                                        godzina = "00:00"
                                        parent = a.parent
                                        for _ in range(3):
                                            if not parent: break
                                            parent_text = parent.text if parent else ""
                                            time_match = re.search(r'\b\d{2}:\d{2}\b', parent_text)
                                            if time_match:
                                                godzina = time_match.group(0)
                                                break
                                            parent = parent.parent
                                        
                                        linki_z_danymi.append((match_url, dzien, godzina))
                                        dzienne_linki_count += 1
                                        
                        print(f"    [*] Wykryto {dzienne_linki_count} surowych odnośników do meczów na dzień {dzien}")
                        time.sleep(1.5)
                                        
                    except Exception as e:
                        print(f"    [!] Błąd podczas parsowania listy głównej: {e}")

                unikalne = list({(l[0], l[1], l[2]): l for l in linki_z_danymi}.values())
                print(f" -> Znaleziono {len(unikalne)} unikalnych meczów dla dyscypliny {nazwa_sportu}. Przechodzę do pobierania kursów...")

                for idx, (link, dzien, godzina) in enumerate(unikalne, start=1):
                    try:
                        if page.is_closed():
                            page = context.new_page()

                        print(f"\n    [{idx}/{len(unikalne)}] Ładowanie szczegółów meczu: {link}")
                        page.goto(link, wait_until="domcontentloaded", timeout=25000)
                        
                        tabela_zaladowana = False
                        for _ in range(6):
                            page.evaluate("window.scrollBy(0, 200);")
                            time.sleep(1.0)
                            soup = BeautifulSoup(page.content(), "html.parser")
                            
                            ma_logo = soup.find('img', class_=re.compile(r'bookmaker-logo|provider-logo', re.IGNORECASE))
                            ma_kursy = soup.find('a', class_=re.compile(r'odds-link|odds'))
                            if ma_logo or ma_kursy:
                                tabela_zaladowana = True
                                break
                        
                        if not tabela_zaladowana:
                            print(f"      [!] Timeout: Tabela kursów nie wyrenderowała się na czas. Pomijam.")
                            continue
                        
                        h1 = soup.find('h1')
                        if not h1:
                            continue
                        
                        title_raw = h1.text.strip()
                        title_clean = re.sub(r'\s*-\s*Odds,\s*Predictions.*$', '', title_raw, flags=re.IGNORECASE).replace(" vs ", " - ")
                        
                        if " - " in title_clean:
                            home, away = title_clean.split(" - ", 1)
                        else:
                            home, away = title_clean, "Brak"

                        match_data = {}

                        def get_match_data(buk_name):
                            if buk_name not in match_data:
                                match_data[buk_name] = {
                                    "id": f"{buk_name.lower()}_{home.strip()}_{away.strip()}",
                                    "mecz": f"{home.strip()} - {away.strip()}",
                                    "dyscyplina": nazwa_sportu,
                                    "dzien": dzien,
                                    "godzina": godzina,
                                    "home": home.strip(),
                                    "away": away.strip(),
                                    "bukmacher": buk_name,
                                    "kurs_1": 0.0,
                                    "kurs_X": None,
                                    "kurs_2": 0.0,
                                    "btts": {},
                                    "podwojna_szansa": {},
                                    "over_under": {}
                                }
                            return match_data[buk_name]

                        # --- 1. POBIERANIE GŁÓWNEGO RYNKU (1X2 / ZWYCIĘZCA) ---
                        wyniki_1x2 = parse_standard_odds(page.content())
                        for buk, kursy_list in wyniki_1x2.items():
                            if nazwa_sportu in ["Piłka nożna", "Piłka ręczna"] and len(kursy_list) >= 3:
                                d = get_match_data(buk)
                                d["kurs_1"] = kursy_list[0]
                                d["kurs_X"] = kursy_list[1]
                                d["kurs_2"] = kursy_list[2]
                            elif len(kursy_list) >= 2:
                                d = get_match_data(buk)
                                d["kurs_1"] = kursy_list[0]
                                d["kurs_2"] = kursy_list[-1]

                        # --- 2. POBIERANIE BTTS (Tylko Piłka nożna) ---
                        if nazwa_sportu == "Piłka nożna":
                            try:
                                if wejdz_w_zakladke(page, "Both Teams to Score"):
                                    wyniki_btts = parse_standard_odds(page.content())
                                    for buk, kursy_list in wyniki_btts.items():
                                        if len(kursy_list) >= 2:
                                            d = get_match_data(buk)
                                            d["btts"]["tak"] = str(kursy_list[0])
                                            d["btts"]["nie"] = str(kursy_list[1])
                            except Exception as e:
                                print(f"      [!] Błąd ładowania BTTS: {e}")

                       # --- 3. POBIERANIE PODWÓJNEJ SZANSY ---
                        if nazwa_sportu in ["Piłka nożna", "Piłka ręczna"]:
                            try:
                                if wejdz_w_zakladke(page, "Double Chance"):
                                    wyniki_dc = parse_standard_odds(page.content())
                                    for buk, kursy_list in wyniki_dc.items():
                                        if len(kursy_list) >= 3:
                                            d = get_match_data(buk)
                                            d["podwojna_szansa"]["1X"] = str(kursy_list[0])
                                            d["podwojna_szansa"]["12"] = str(kursy_list[1])
                                            d["podwojna_szansa"]["X2"] = str(kursy_list[2])
                            except Exception as e:
                                print(f"      [!] Błąd ładowania Double Chance: {e}")

                        # --- 4. POBIERANIE OVER / UNDER ---
                        try:
                            if wejdz_w_zakladke(page, "Over/Under"):
                                page.evaluate("window.scrollBy(0, 300);")
                                page.wait_for_timeout(500)
                                
                                # Funkcja wewnętrzna pozwalająca na wyciąganie danych dla otwartych linii.
                                def parse_ou(html_content):
                                    soup_ou = BeautifulSoup(html_content, "html.parser")
                                    logos = soup_ou.find_all('img')
                                    
                                    for logo in logos:
                                        name = logo.get('alt', '').strip().lower()
                                        src = logo.get('src', '').strip().lower()
                                        
                                        buk = None
                                        if "sts" in name or "sts" in src: buk = "STS"
                                        elif "betfan" in name or "betfan" in src: buk = "BETFAN"
                                        elif "lv bet" in name or "lvbet" in name or "lvbet" in src: buk = "LV BET"
                                        if not buk: continue
                                        
                                        row = None
                                        p = logo.parent
                                        for _ in range(8):
                                            if not p: break
                                            if p.find_all('a', class_=re.compile(r'odds-link|odds')):
                                                row = p
                                                break
                                            p = p.parent
                                            
                                        if not row: continue
                                        
                                        line_val = None
                                        p = row.parent
                                        for _ in range(8):
                                            if not p: break
                                            tekst_kontenera = p.get_text(separator=" ")
                                            
                                            # Ten regex to idealne zabezpieczenie - pobiera TYLKO połówki (.5)
                                            matches = re.findall(r'(?:Over/Under|Total)\s*\+([0-9]+\.5)', tekst_kontenera, re.IGNORECASE)
                                            unikalne_linie = list(set(matches))
                                            
                                            if len(unikalne_linie) == 1:
                                                line_val = unikalne_linie[0] 
                                                break
                                            elif len(unikalne_linie) > 1:
                                                break 
                                                
                                            p = p.parent
                                            
                                        if not line_val: continue
                                        
                                        odds_elements = row.find_all('a', class_=re.compile(r'odds-link|odds'))
                                        kursy = [parsuj_kurs(odd) for odd in odds_elements if parsuj_kurs(odd) > 0]
                                        
                                        if len(kursy) >= 2:
                                            d = get_match_data(buk)
                                            d["over_under"][line_val] = {"over": str(kursy[0]), "under": str(kursy[-1])}

                                # PRZEJŚCIE 1: Zapisujemy dane dla domyślnie rozwniętej linii
                                parse_ou(page.content())
                                
                                # KLUCZOWA POPRAWKA: Sprawdzamy co już zebraliśmy, żeby nie zamknąć domyślnie otwartej linii
                                zebrane_linie = set()
                                for b_data in match_data.values():
                                    if "over_under" in b_data:
                                        zebrane_linie.update(b_data["over_under"].keys())
                                
                                # PRZEJŚCIE 2: Wymuszamy otwarcie tylko tych połówek, których brakuje
                                try:
                                    for i in range(0, 16):
                                        linia_str = f"{i}.5"
                                        
                                        # Jeśli mamy już pobraną tę linię (np. domyślne 1.5), pominie klikanie, zapobiegając zwinięciu!
                                        if linia_str in zebrane_linie:
                                            continue
                                            
                                        # Poprawiony regex (dodane \\. aby uciec kropkę w Playwright, co łapie DOKŁADNIE 1.5, a nie np. 1.55)
                                        regex_locator = f'text=/Over\\/Under \\+{i}\\.5/i'
                                        elements = page.locator(regex_locator).all()
                                        
                                        for el in elements:
                                            try: 
                                                # Limit podniesiony do 60 na wypadek zmian w DOM OddsPortal
                                                if el.is_visible() and len(el.inner_text().strip()) < 60:
                                                    el.click(force=True, timeout=800) 
                                                    page.wait_for_timeout(150)
                                            except: pass
                                except: pass
                                
                                page.wait_for_timeout(1500) 
                                
                                # PRZEJŚCIE 3: Parsujemy drugi raz, by dołożyć ręcznie otwarte linie
                                parse_ou(page.content())
                                
                        except Exception as e:
                            print(f"      [!] Błąd ładowania O/U: {e}")

                        # Zapis finalnych danych do struktury z całego meczu
                        if match_data:
                            for d in match_data.values():
                                if d["kurs_1"] > 0 or d["over_under"]: # Zapisujemy, jeśli ma choć główne kursy lub O/U
                                    wszystkie_mecze.append(d)
                                    print(f"      [+] Zapisano: {d['bukmacher']:<8} | O/U: {len(d['over_under'])} linii | BTTS: {bool(d['btts'])} | DC: {bool(d['podwojna_szansa'])}")
                        else:
                            print("      [INFO] Brak linii dla STS/BETFAN/LVBET w tym spotkaniu.")

                    except Exception as e:
                        print(f"    [!] Krytyczny błąd przy przetwarzaniu meczu {link}: {e}")
                        if "closed" in str(e).lower() or page.is_closed():
                            try: page.close() 
                            except: pass
                        continue

                time.sleep(2.0) 

        finally:
            print("\n-> Zamykanie przeglądarki...")
            try: browser.close()
            except: pass

    with open(output, "w", encoding="utf-8") as f:
        json.dump(wszystkie_mecze, f, indent=4, ensure_ascii=False)
    print(f"\n[OK] PROCES ZAKOŃCZONY - Zapisano łącznie {len(wszystkie_mecze)} rekordów kursów do pliku: {output}")

if __name__ == "__main__":
    pobierz_polskich_z_oddsportal()