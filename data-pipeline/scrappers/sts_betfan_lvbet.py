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
        browser = p.chromium.launch(headless=False)  # Widoczne okno developerskie do analizy
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
                        
                        # ULTRABEZPIECZNY MECHANIZM OCZEKIWANIA:
                        # Zamiast polegać na kruchych klasach CSS, sprawdzamy dynamicznie w pętli, 
                        # czy w kodzie źródłowym wyrenderowały się już linki odpowiadające strukturze spotkań.
                        max_prob = 6
                        dzienne_linki_count = 0
                        soup = None
                        
                        for proba in range(max_prob):
                            # Przewijanie stymulujące hydration / lazy loading skryptów frameworka JS
                            page.evaluate("window.scrollBy(0, 800);")
                            time.sleep(1.5)
                            
                            soup = BeautifulSoup(page.content(), "html.parser")
                            
                            # Test integracyjny: sprawdzamy dostępność linków meczowych specyficznych dla dyscypliny
                            test_links_count = 0
                            for a in soup.find_all('a', href=True):
                                href = a['href']
                                href_clean = href.split('?')[0].strip('/')
                                parts = href_clean.split('/')
                                if len(parts) >= 4 and parts[0] == sciezka_sportu:
                                    if not any(x in parts for x in ['results', 'standings', 'teams', 'archive']):
                                        test_links_count += 1
                            
                            # Jeśli mecze się pojawiły lub strona jawnie informuje o braku spotkań
                            if test_links_count > 0 or "no matches" in soup.text.lower() or "brak spotkań" in soup.text.lower():
                                break
                            print(f"    [INFO] Brak wyrenderowanych meczów w próbie {proba+1}/{max_prob}. Przewijam dalej...")

                        # Wykończenie przewijania i pobranie ostatecznego drzewa DOM
                        page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                        time.sleep(1.0)
                        soup = BeautifulSoup(page.content(), "html.parser")
                        
                        # STRATEGIA A: Parsowanie oparte na tradycyjnych wierszach eventRow (jeśli występują)
                        rows = soup.find_all('div', class_=re.compile(r'eventRow'))
                        if rows:
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
                        
                        # STRATEGIA B (FALLBACK): Jeśli rows jest puste (standard w nowym szablonie dla tenisa i boksu)
                        if dzienne_linki_count == 0:
                            for a in soup.find_all('a', href=True):
                                href = a['href']
                                href_clean = href.split('?')[0].strip('/')
                                parts = href_clean.split('/')
                                
                                if len(parts) >= 4 and parts[0] == sciezka_sportu:
                                    if not any(x in parts for x in ['results', 'standings', 'teams', 'archive']):
                                        match_url = "https://www.oddsportal.com/" + href_clean + "/"
                                        
                                        # Inteligentne poszukiwanie godziny w głąb rodziców (wspinaczka do 3 poziomów wyżej)
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
                            print("      [SYSTEM] Przechwycono zamkniętą kartę. Otwieram nową...")
                            page = context.new_page()

                        print(f"    [{idx}/{len(unikalne)}] Ładowanie szczegółów meczu: {link}")
                        page.goto(link, wait_until="domcontentloaded", timeout=25000)
                        
                        # Dynamiczne oczekiwanie na pełne wyrenderowanie kursów/bukmacherów wewnątrz podstrony meczu
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
                            print("      [!] Nie znaleziono nagłówka H1 z nazwą zespołów. Pomijam.")
                            continue
                        
                        title_raw = h1.text.strip()
                        title_clean = re.sub(r'\s*-\s*Odds,\s*Predictions.*$', '', title_raw, flags=re.IGNORECASE)
                        title_clean = title_clean.replace(" vs ", " - ")
                        
                        if " - " in title_clean:
                            home, away = title_clean.split(" - ", 1)
                        else:
                            home, away = title_clean, "Brak"

                        # Pobieramy globalnie tagi img, aby uniezależnić się od zmieniających się klas CSS
                        logos = soup.find_all('img')
                        
                        total_books_found = 0
                        polish_books_saved = 0
                        
                        for logo in logos:
                            try:
                                name = logo.get('alt', '').strip().lower()
                                src = logo.get('src', '').strip().lower()
                                class_str = " ".join(logo.get('class', [])).lower()
                                
                                # Walidacja czy dany element graficzny reprezentuje szukanego bukmachera
                                if not ("bookmaker" in class_str or "provider" in class_str or any(b in name or b in src for b in ["sts", "betfan", "lvbet", "lv bet"])):
                                    continue
                                    
                                bukmacher_nazwa = None
                                if "sts" in name or "sts" in src: bukmacher_nazwa = "STS"
                                elif "betfan" in name or "betfan" in src: bukmacher_nazwa = "BETFAN"
                                elif "lv bet" in name or "lvbet" in name or "lvbet" in src: bukmacher_nazwa = "LV BET"
                                else: 
                                    if "bookmaker" in class_str or "provider" in class_str:
                                        total_books_found += 1
                                    continue 

                                total_books_found += 1

                                # Dynamiczne poszukiwanie kontenera wiersza kursów (wspinaczka po drzewie DOM)
                                row = None
                                parent = logo.parent
                                for _ in range(5):
                                    if not parent: break
                                    if parent.find_all('a', class_=re.compile(r'odds-link|odds')):
                                        row = parent
                                        break
                                    parent = parent.parent
                                    
                                if not row: continue
                                odds = row.find_all('a', class_=re.compile(r'odds-link|odds'))

                                # Dla sportów 3-drogowych (Remis)
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

                                # Dla sportów 2-drogowych (Koszykówka, Tenis, Boks)
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
                            
                            except Exception:
                                continue
                            
                        if polish_books_saved > 0:
                            print(f"      [INFO] Sukces: Na {total_books_found} ogólnych bukmacherów, zebrano dane z {polish_books_saved} polskich.")
                        else:
                            print(f"      [INFO] Pomiń: Tabela przetworzona (ogółem ofert: {total_books_found}), ale brak linii od STS/BETFAN/LVBET.")

                        time.sleep(1.0)  # Ochrona sesji przed agresywnym odpytywaniem podstron

                    except Exception as e:
                        print(f"    [!] Krytyczny błąd przy przetwarzaniu meczu {link}: {e}")
                        if "closed" in str(e).lower() or page.is_closed():
                            try: page.close() 
                            except: pass
                        continue

                time.sleep(2.0)  # Przerwa techniczna pomiędzy zmianą dyscyplin sportowych

        finally:
            print("\n-> Zamykanie przeglądarki...")
            try: browser.close()
            except: pass

    # Zapis końcowy danych do struktury JSON
    with open(output, "w", encoding="utf-8") as f:
        json.dump(wszystkie_mecze, f, indent=4, ensure_ascii=False)
    print(f"\n[OK] PROCES ZAKOŃCZONY - Zapisano łącznie {len(wszystkie_mecze)} rekordów kursów do pliku: {output}")

if __name__ == "__main__":
    pobierz_polskich_z_oddsportal()