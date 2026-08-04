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
import requests

# Wymuszamy kodowanie UTF-8 dla konsoli
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# ==========================================
# 🌐 OBSŁUGA VPN
# ==========================================
def vpn_on():
    print("🔄 Uruchamianie VPN...")
    subprocess.run([r"C:\Users\mateu\Desktop\Programowanie\Projekt\start_vpn.bat"], shell=True)
    time.sleep(15)

def vpn_off():
    print("⏹️ Wyłączanie VPN...")
    subprocess.run([r"C:\Users\mateu\Desktop\Programowanie\Projekt\stop_vpn.bat"], shell=True)

def sprawdz_ip():
    try:
        ip_info = requests.get('https://ipinfo.io/json', timeout=5).json()
        if ip_info['country'] != 'NL':
            print("UWAGA: Nie masz połączenia z NL! Przerwanie działania.")
            exit()
        else:
            print(f"✅ Połączono z VPN. Zmiana IP na: {ip_info['ip']} ({ip_info['country']})")
    except:
        print("Nie można sprawdzić IP.")

# ==========================================
# ⚙️ USTAWIENIA I ZMIENNE
# ==========================================
SPORTY = {
    "Piłka nożna": "football",
    "Koszykówka": "basketball",
    "Tenis": "tennis",
    "Piłka ręczna": "handball",
    "Boks": "boxing"
}

WYKLUCZENI_BUKMACHERZY = [
    "sts", "fortuna", "superbet", "betclic", "fuksiarz", "lv bet", "lvbet", 
    "betfan", "etoto", "goplusbet", "totalbet", "betters", "comeon"
]

SMIECIOWE_FRAZY = [
    "18+", "onetrust", "logo", "data by", "cookie", "privacy", 
    "tomorrow", "live", "today", "yesterday", "vs", "-",
    "6", "8", "ie", "bg" 
]

# ==========================================
# 🛠️ FUNKCJE POMOCNICZE
# ==========================================
def parsuj_kurs(element):
    """Bezpieczny parser kursów z tekstów HTML"""
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

def wyciagnij_nazwe_buka(logo):
    zabronione = ["img", "logo", "bookmaker", ""]
    
    alt = logo.get('alt', '').strip()
    if alt and alt.lower() not in zabronione: return alt
        
    title = logo.get('title', '').strip()
    if title and title.lower() not in zabronione: return title
        
    parent = logo.parent
    if parent:
        p_title = parent.get('title', '').strip()
        if p_title and p_title.lower() not in zabronione: return p_title
            
        p_tag = parent.find('p')
        if p_tag:
            p_text = p_tag.text.strip()
            if p_text and p_text.lower() not in zabronione: return p_text
                
        p_text_direct = parent.text.strip()
        if p_text_direct and p_text_direct.lower() not in zabronione:
            return p_text_direct.split('\n')[0].strip()
            
    return ""

def parse_standard_odds(html_content, home="", away=""):
    soup = BeautifulSoup(html_content, "html.parser")
    wyniki = {}
    
    rows = soup.find_all('div', class_=re.compile(r'border-b|flex-row|table-row-item', re.IGNORECASE))
    
    for row in rows:
        odds_elements = row.find_all('a', class_=re.compile(r'odds-link|odds'))
        if not odds_elements: continue
            
        logo = row.find('img')
        if not logo: continue
            
        name = wyciagnij_nazwe_buka(logo)
        if not name: continue
        name_lower = name.lower()
        
        if any(fraz in name_lower for fraz in SMIECIOWE_FRAZY): continue
        if any(w in name_lower for w in WYKLUCZENI_BUKMACHERZY): continue
        if home and name_lower == home.lower(): continue
        if away and name_lower == away.lower(): continue
        if len(name) < 3 or len(name) > 30: continue

        kursy = [parsuj_kurs(odd) for odd in odds_elements if parsuj_kurs(odd) > 0]
        if kursy:
            wyniki[name] = kursy
            
    return wyniki

def wejdz_w_zakladke(page_obj, tab_name):
    tab = page_obj.locator(f'text="{tab_name}" >> visible=true').first
    if tab.count() > 0:
        tab.click(force=True)
        page_obj.wait_for_timeout(2000)
        return True
        
    more_btn = page_obj.locator('text="More" >> visible=true').first
    if more_btn.count() > 0:
        more_btn.click(force=True)
        page_obj.wait_for_timeout(1000)
        
        tab_in_more = page_obj.locator(f'text="{tab_name}" >> visible=true').first
        if tab_in_more.count() > 0:
            tab_in_more.click(force=True)
            page_obj.wait_for_timeout(2000)
            return True
            
    return False

# ==========================================
# 🚀 GŁÓWNY PROCES SCRAPOWANIA
# ==========================================
def pobierz_zagranicznych_z_oddsportal():
    vpn_on()
    sprawdz_ip()
    
    print("\n-> [ZAGRANICZNI BUKMACHERZY - ODDSPORTAL] START (Jutro + Pojutrze)")

    baza_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    output = os.path.join(baza_dir, "data", "zagraniczni.json")
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

                        print(f"\n    [{idx}/{len(unikalne)}] Ładowanie meczu: {link}")
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
                        if not h1: continue
                        
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
                                    "id": f"oddsportal_{home.strip()}_{away.strip()}_{buk_name}",
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
                                    "over_under": {},
                                    "handicap": {}
                                }
                            return match_data[buk_name]

                        wyniki_1x2 = parse_standard_odds(page.content(), home, away)
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

                        # ==========================================
                        # NOWE FUNKCJE PARSUJĄCE O/U I HANDICAP
                        # ==========================================
                        def parse_ou(html_content):
                            soup_ou = BeautifulSoup(html_content, "html.parser")
                            regex_ou = re.compile(r'(?:Over/Under|Total)\s*\+?([0-9]+(?:\.[0-9]+)?)', re.IGNORECASE)
                            
                            rows = soup_ou.find_all('div', class_=re.compile(r'border-b|flex-row|table-row-item', re.IGNORECASE))
                            seen_rows = set()
                            
                            for row in rows:
                                if row in seen_rows: continue
                                seen_rows.add(row)
                                
                                logo = row.find('img')
                                if not logo: continue
                                
                                odds_elements = row.find_all('a', class_=re.compile(r'odds-link|odds'))
                                if len(odds_elements) < 2: continue
                                
                                # Skanowanie wstecz w poszukiwaniu najbliższego nagłówka
                                header_str = row.find_previous(string=regex_ou)
                                if not header_str: continue
                                    
                                match = regex_ou.search(header_str)
                                if not match: continue
                                line_val = match.group(1)
                                
                                name = wyciagnij_nazwe_buka(logo)
                                if not name: continue
                                name_lower = name.lower()
                                
                                if any(w in name_lower for w in WYKLUCZENI_BUKMACHERZY): continue
                                if any(fraz in name_lower for fraz in SMIECIOWE_FRAZY): continue
                                if home and name_lower == home.lower(): continue
                                if away and name_lower == away.lower(): continue
                                if len(name) < 3 or len(name) > 30: continue
                                
                                kursy = [parsuj_kurs(odd) for odd in odds_elements if parsuj_kurs(odd) > 0]
                                if len(kursy) >= 2:
                                    d = get_match_data(name)
                                    if line_val not in d["over_under"]:
                                        d["over_under"][line_val] = {"over": str(kursy[0]), "under": str(kursy[-1])}

                        def parse_handicap(html_content):
                            soup_hc = BeautifulSoup(html_content, "html.parser")
                            # Dodane AH do ulepszonego wychwytywania
                            regex_hc = re.compile(r'(?:Asian Handicap|Handicap|AH)\s*([+-]?[0-9]+(?:\.[0-9]+)?)', re.IGNORECASE)
                            
                            rows = soup_hc.find_all('div', class_=re.compile(r'border-b|flex-row|table-row-item', re.IGNORECASE))
                            seen_rows = set()
                            
                            for row in rows:
                                if row in seen_rows: continue
                                seen_rows.add(row)
                                
                                logo = row.find('img')
                                if not logo: continue
                                
                                odds_elements = row.find_all('a', class_=re.compile(r'odds-link|odds'))
                                if len(odds_elements) < 2: continue
                                
                                header_str = row.find_previous(string=regex_hc)
                                if not header_str: continue
                                    
                                match = regex_hc.search(header_str)
                                if not match: continue
                                line_val = match.group(1)
                                
                                name = wyciagnij_nazwe_buka(logo)
                                if not name: continue
                                name_lower = name.lower()
                                
                                if any(w in name_lower for w in WYKLUCZENI_BUKMACHERZY): continue
                                if any(fraz in name_lower for fraz in SMIECIOWE_FRAZY): continue
                                if home and name_lower == home.lower(): continue
                                if away and name_lower == away.lower(): continue
                                if len(name) < 3 or len(name) > 30: continue
                                
                                kursy = [parsuj_kurs(odd) for odd in odds_elements if parsuj_kurs(odd) > 0]
                                if len(kursy) >= 2:
                                    d = get_match_data(name)
                                    if line_val not in d["handicap"]:
                                        d["handicap"][line_val] = {"1": str(kursy[0]), "2": str(kursy[-1])}

                        # --- RYNKI POBOCZNE DLA PIŁKI NOŻNEJ ---
                        if nazwa_sportu == "Piłka nożna":
                            try:
                                if wejdz_w_zakladke(page, "Both Teams to Score"):
                                    wyniki_btts = parse_standard_odds(page.content(), home, away)
                                    for buk, kursy_list in wyniki_btts.items():
                                        if len(kursy_list) >= 2:
                                            d = get_match_data(buk)
                                            d["btts"]["tak"] = str(kursy_list[0])
                                            d["btts"]["nie"] = str(kursy_list[1])
                            except Exception as e:
                                print(f"      [!] Błąd ładowania BTTS: {e}")

                            try:
                                if wejdz_w_zakladke(page, "Double Chance"):
                                    wyniki_dc = parse_standard_odds(page.content(), home, away)
                                    for buk, kursy_list in wyniki_dc.items():
                                        if len(kursy_list) >= 3:
                                            d = get_match_data(buk)
                                            d["podwojna_szansa"]["1X"] = str(kursy_list[0])
                                            d["podwojna_szansa"]["12"] = str(kursy_list[1])
                                            d["podwojna_szansa"]["X2"] = str(kursy_list[2])
                            except Exception as e:
                                print(f"      [!] Błąd ładowania Double Chance: {e}")

                            try:
                                if wejdz_w_zakladke(page, "Over/Under"):
                                    page.evaluate("window.scrollBy(0, 300);")
                                    page.wait_for_timeout(1000)
                                    parse_ou(page.content())
                                    
                                    zebrane_linie = set()
                                    for b_data in match_data.values():
                                        if "over_under" in b_data:
                                            zebrane_linie.update(b_data["over_under"].keys())
                                    
                                    try:
                                        for i in range(0, 16):
                                            linia_str = f"{i}.5"
                                            if linia_str in zebrane_linie: continue
                                                
                                            regex_locator = f'text=/(Over\\/Under|Total)\\s*\\+{i}\\.5/i'
                                            elements = page.locator(regex_locator).all()
                                            
                                            clicked_any = False
                                            for el in elements:
                                                try: 
                                                    if el.is_visible() and len(el.inner_text().strip()) < 60:
                                                        el.click(force=True, timeout=1000) 
                                                        clicked_any = True
                                                        break 
                                                except: pass
                                            
                                            if clicked_any:
                                                page.wait_for_timeout(200)
                                    except: pass
                                    
                                    page.wait_for_timeout(1500) 
                                    parse_ou(page.content())
                            except Exception as e:
                                print(f"      [!] Błąd ładowania O/U: {e}")

                        # --- RYNKI POBOCZNE DLA KOSZYKÓWKI ---
                        elif nazwa_sportu == "Koszykówka":
                            # 1. OVER / UNDER
                            try:
                                if wejdz_w_zakladke(page, "Over/Under") or wejdz_w_zakladke(page, "Over/Under Incl. OT"):
                                    page.evaluate("window.scrollBy(0, 300);")
                                    page.wait_for_timeout(1500)
                                    
                                    # Parsujemy linię otwartą domyślnie
                                    parse_ou(page.content())
                                    
                                    try:
                                        accordions = page.locator('div[class*="cursor-pointer"]:has-text("Over/Under"), div[class*="cursor-pointer"]:has-text("Total")').all()
                                        for acc in accordions:
                                            try:
                                                if acc.is_visible():
                                                    acc.click(force=True, timeout=1000)
                                                    page.wait_for_timeout(200)
                                            except: pass
                                            
                                        page.wait_for_timeout(2000) # Wydłużony czas po naklikaniu reszty
                                        parse_ou(page.content())
                                    except: pass
                            except Exception as e:
                                print(f"      [!] Błąd ładowania O/U dla koszykówki: {e}")

                            # 2. HANDICAP
                            try:
                                if wejdz_w_zakladke(page, "Asian Handicap") or wejdz_w_zakladke(page, "Handicap") or wejdz_w_zakladke(page, "Handicap Incl. OT"):
                                    page.evaluate("window.scrollBy(0, 300);")
                                    page.wait_for_timeout(1500)
                                    
                                    # Parsujemy linię otwartą domyślnie
                                    parse_handicap(page.content())
                                    
                                    try:
                                        accordions = page.locator('div[class*="cursor-pointer"]:has-text("Handicap"), div[class*="cursor-pointer"]:has-text("AH")').all()
                                        for acc in accordions:
                                            try:
                                                if acc.is_visible():
                                                    acc.click(force=True, timeout=1000)
                                                    page.wait_for_timeout(200)
                                            except: pass
                                            
                                        page.wait_for_timeout(2000) # Wydłużony czas po naklikaniu reszty
                                        parse_handicap(page.content())
                                    except: pass
                            except Exception as e:
                                print(f"      [!] Błąd ładowania Handicap dla koszykówki: {e}")

                        # Zapis finalnych danych
                        if match_data:
                            for d in match_data.values():
                                if d["kurs_1"] > 0 or d["over_under"] or d["handicap"]: 
                                    wszystkie_mecze.append(d)
                                    print(f"      [+] Zapisano: {d['bukmacher']:<12} | O/U: {len(d['over_under'])} linii | HC: {len(d['handicap'])} linii | BTTS: {bool(d['btts'])} | DC: {bool(d['podwojna_szansa'])}")
                        else:
                            print("      [INFO] Brak zagranicznych kursów dla tego spotkania.")

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
            
            vpn_off()

    with open(output, "w", encoding="utf-8") as f:
        json.dump(wszystkie_mecze, f, indent=4, ensure_ascii=False)
    print(f"\n[OK] PROCES ZAKOŃCZONY - Zapisano łącznie {len(wszystkie_mecze)} rekordów kursów do pliku: {output}")

if __name__ == "__main__":
    pobierz_zagranicznych_z_oddsportal()