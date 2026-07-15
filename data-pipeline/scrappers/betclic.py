import undetected_chromedriver as uc
import os
import time
import json
import re
import shutil
import subprocess
import random 
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from datetime import datetime, timedelta

DISCIPLINES = {
    "pilka_nozna": "https://www.betclic.pl/pilka-nozna-s1",
    "koszykowka": "https://www.betclic.pl/koszykowka-s4",
    "tenis": "https://www.betclic.pl/tenis-s2",
    "pilka_reczna": "https://www.betclic.pl/pilka-reczna-s9",
    "boks": "https://www.betclic.pl/boks-s16",
}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTPUT_JSON_PATH = os.path.join(BASE_DIR, "data", "betclic.json")

def force_kill_zombie_chromes():
    """Agresywne usuwanie procesów Chrome"""
    if os.name == 'nt':
        print("[SYSTEM] Czyszczenie wiszących procesów...", flush=True)
        try:
            subprocess.run("taskkill /F /IM chrome.exe /T", capture_output=True, shell=True)
            subprocess.run("taskkill /F /IM chromedriver.exe /T", capture_output=True, shell=True)
            time.sleep(2)
        except Exception:
            pass

def setup_driver(max_retries=3):
    profile = os.path.join(BASE_DIR, "data", "betclic_profile")

    for attempt in range(max_retries):
        try:
            print(f"[SYSTEM] Próba uruchomienia przeglądarki ({attempt + 1}/{max_retries})...")
            
            force_kill_zombie_chromes()

            if attempt > 0 and os.path.exists(profile):
                print("[SYSTEM] Twardy reset folderu profilu...")
                shutil.rmtree(profile, ignore_errors=True)
                time.sleep(1)

            if os.path.exists(profile):
                lock_files = ["SingletonLock", "SingletonCookie", "SingletonSocket", "Local State", "DevToolsActivePort"]
                for lf in lock_files:
                    lf_path = os.path.join(profile, lf)
                    if os.path.exists(lf_path):
                        try: os.remove(lf_path)
                        except: pass

            options = uc.ChromeOptions()
            options.add_argument(f"--user-data-dir={profile}")
            options.add_argument("--lang=pl-PL")
            options.add_argument("--disable-gpu")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-popup-blocking")
            options.add_argument("--log-level=3") 
            options.page_load_strategy = 'eager' 

            options.add_argument("--disable-background-timer-throttling")
            options.add_argument("--disable-backgrounding-occluded-windows")
            options.add_argument("--disable-renderer-backgrounding")
            options.add_argument("--disable-ipc-flooding-protection")
            
            options.add_argument("--block-new-web-contents")
            
            options.add_argument("--window-size=1920,1080")
            options.add_argument("--window-position=-2000,-2000")

            driver = uc.Chrome(options=options, use_subprocess=True, version_main=149)
            driver.get("about:blank") 
            
            try:
                driver.switch_to.window(driver.current_window_handle)
            except:
                pass
            
            print("[SYSTEM] Chrome uruchomiony stabilnie w tle (Ukryte okno Off-Screen).")
            return driver

        except Exception as e:
            print(f"[SYSTEM] Odrzucono sesję Chrome: {e}")
            try:
                driver.quit()
            except:
                pass
            
            if attempt == max_retries - 1:
                print("[SYSTEM] BŁĄD KRYTYCZNY: Nie udało się uruchomić Chrome.")
                return None
            
            time.sleep(3) 
    return driver

def handle_cookies(driver):
    try:
        btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "onetrust-accept-btn-handler"))
        )
        driver.execute_script("arguments[0].click();", btn)
        print("[INFO] Zaakceptowano pliki cookies.")
        time.sleep(1)
    except:
        try:
            btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Zaakceptuj')]")
            driver.execute_script("arguments[0].click();", btn)
            print("[INFO] Zaakceptowano pliki cookies (metoda alternatywna).")
            time.sleep(1)
        except:
            pass

def safe(x):
    return str(x) if x else None

def smart_scroll_block(driver, blok):
    last_count = 0
    no_change = 0

    for i in range(120):
        cards = blok.find_elements(By.CSS_SELECTOR, "[class*='event'], a")
        current = len(cards)
        if current == last_count:
            no_change += 1
        else:
            no_change = 0
        last_count = current

        if cards:
            driver.execute_script(
                "arguments[0].scrollIntoView({block:'center'});",
                cards[-1]
            )
        time.sleep(1.2)
        if no_change == 5:
            print("[WAIT] doczytywanie...")
            time.sleep(3)

        if no_change == 8:
            time.sleep(5)

        if no_change >= 12:
            break

    for _ in range(8):
        try:
            cards = blok.find_elements(By.CSS_SELECTOR, "[class*='event'], a")
            if cards:
                driver.execute_script(
                    "arguments[0].scrollIntoView({block:'center'});",
                    cards[-1]
                )
            time.sleep(1)
        except:
            pass

def scrape_current_page(driver, discipline):
    # Zabezpieczenie przed brakiem dyscypliny w ofercie (np. wycofana piłka ręczna)
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div.groupEvents"))
        )
    except TimeoutException:
        print(f"[OSTRZEŻENIE] Brak oferty dla: {discipline}. Prawdopodobnie dyscyplina jest chwilowo ukryta przez bukmachera. Pomijam.")
        return []

    matches = []
    seen = set()
    today = datetime.now()
    jutro_date = (today + timedelta(days=1)).strftime("%d.%m.%Y")
    pojutrze_date = (today + timedelta(days=2)).strftime("%d.%m.%Y")

    # =======================================================
    # KROK 1: Dynamiczne znalezienie i skanowanie bloku JUTRO
    # =======================================================
    blok_jutro = None
    for _ in range(40):
        bloki = driver.find_elements(By.CSS_SELECTOR, "div.groupEvents")
        for b in bloki:
            try:
                text = b.find_element(By.CSS_SELECTOR, "h2").get_attribute("textContent").lower()
                if "jutro" in text:
                    blok_jutro = b
                    break
            except:
                continue
        if blok_jutro:
            break
        driver.execute_script("window.scrollBy(0, 1200)")
        time.sleep(1.2)

    if blok_jutro:
        try:
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", blok_jutro)
            time.sleep(2)
            print(f"[SKAN] {jutro_date}")
            smart_scroll_block(driver, blok_jutro)
            
            cards = blok_jutro.find_elements(By.CSS_SELECTOR, "[class*='event'], a")
            print(f"[DEBUG] kart (jutro): {len(cards)}")
            for karta in cards:
                try:
                    teams = karta.find_elements(By.CSS_SELECTOR, ".scoreboard_contestantLabel")
                    if len(teams) != 2: continue
                    
                    home = teams[0].get_attribute("innerText").strip()
                    away = teams[1].get_attribute("innerText").strip()
                    key = f"{home}-{away}"
                    if key in seen: continue
                    
                    link = karta.get_attribute("href")
                    if not link:
                        try: link = karta.find_element(By.TAG_NAME, "a").get_attribute("href")
                        except: pass
                    
                    karta_text = karta.get_attribute("innerText")
                    time_match = re.search(r"\d{2}:\d{2}", karta_text)
                    godzina = time_match.group(0) if time_match else "00:00"
                    
                    kursy = re.findall(r"\d+\.\d{2}", karta_text.replace(",", "."))
                    kursy = [k for k in kursy if 1.01 <= float(k) <= 1000]
                    
                    k1 = kx = k2 = None
                    if discipline == "pilka_nozna":
                        if len(kursy) >= 3: k1, kx, k2 = kursy[:3]
                        elif len(kursy) == 2: k1, kx = kursy[0], kursy[1]
                    else:
                        if len(kursy) >= 3: k1, kx, k2 = kursy[:3]
                        elif len(kursy) == 2: k1, k2 = kursy
                    
                    if not k1 and not k2: continue
                    
                    matches.append({
                        "dyscyplina": discipline, "dzien": jutro_date, "czas": godzina,
                        "home": safe(home), "away": safe(away), "kurs_1": safe(k1), "kurs_X": safe(kx), "kurs_2": safe(k2),
                        "link": link, "btts_tak": None, "btts_nie": None, "dc_1x": None, "dc_12": None, "dc_x2": None, "over_under": {}
                    })
                    seen.add(key)
                except:
                    continue
        except Exception as e:
            print(f"[BŁĄD] Problem podczas skanowania bloku 'jutro': {e}")

    # =======================================================
    # KROK 2: Dynamiczne znalezienie POJUTRZE na świeżym DOM-ie
    # =======================================================
    blok_pojutrze = None
    for _ in range(40):
        bloki = driver.find_elements(By.CSS_SELECTOR, "div.groupEvents")
        found_jutro = False
        for b in bloki:
            try:
                text = b.find_element(By.CSS_SELECTOR, "h2").get_attribute("textContent").lower()
            except:
                continue
            if "jutro" in text:
                found_jutro = True
                continue
            if "pojutrze" in text or found_jutro:
                blok_pojutrze = b
                break
        if blok_pojutrze:
            break
        driver.execute_script("window.scrollBy(0, 800)")
        time.sleep(1.2)

    if blok_pojutrze:
        try:
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", blok_pojutrze)
            time.sleep(2)
            print(f"[SKAN] {pojutrze_date}")
            smart_scroll_block(driver, blok_pojutrze)
            
            cards = blok_pojutrze.find_elements(By.CSS_SELECTOR, "[class*='event'], a")
            print(f"[DEBUG] kart (pojutrze): {len(cards)}")
            for karta in cards:
                try:
                    teams = karta.find_elements(By.CSS_SELECTOR, ".scoreboard_contestantLabel")
                    if len(teams) != 2: continue
                    
                    home = teams[0].get_attribute("innerText").strip()
                    away = teams[1].get_attribute("innerText").strip()
                    key = f"{home}-{away}"
                    if key in seen: continue
                    
                    link = karta.get_attribute("href")
                    if not link:
                        try: link = karta.find_element(By.TAG_NAME, "a").get_attribute("href")
                        except: pass
                    
                    karta_text = karta.get_attribute("innerText")
                    time_match = re.search(r"\d{2}:\d{2}", karta_text)
                    godzina = time_match.group(0) if time_match else "00:00"
                    
                    kursy = re.findall(r"\d+\.\d{2}", karta_text.replace(",", "."))
                    kursy = [k for k in kursy if 1.01 <= float(k) <= 1000]
                    
                    k1 = kx = k2 = None
                    if discipline == "pilka_nozna":
                        if len(kursy) >= 3: k1, kx, k2 = kursy[:3]
                        elif len(kursy) == 2: k1, kx = kursy[0], kursy[1]
                    else:
                        if len(kursy) >= 3: k1, kx, k2 = kursy[:3]
                        elif len(kursy) == 2: k1, k2 = kursy
                    
                    if not k1 and not k2: continue
                    
                    matches.append({
                        "dyscyplina": discipline, "dzien": pojutrze_date, "czas": godzina,
                        "home": safe(home), "away": safe(away), "kurs_1": safe(k1), "kurs_X": safe(kx), "kurs_2": safe(k2),
                        "link": link, "btts_tak": None, "btts_nie": None, "dc_1x": None, "dc_12": None, "dc_x2": None, "over_under": {}
                    })
                    seen.add(key)
                except:
                    continue
        except Exception as e:
            print(f"[BŁĄD] Problem podczas skanowania bloku 'pojutrze': {e}")

    # =======================================================
    # KROK 3: FAZA 2 (Rynki poboczne) CAŁKOWICIE POZA PĘTLAMI SKANOWANIA STRONY GŁÓWNEJ
    # =======================================================
    if discipline == "pilka_nozna" and len(matches) > 0:
        print(f"\n[FAZA 2] Pobieranie rynków pobocznych dla {len(matches)} meczów piłki nożnej (to potrwa chwilę)...")
        
        JS_GET_MARKET_TEXT = """
            var marketName = arguments[0];
            var allElements = document.querySelectorAll('h2, h3, p, span, div');
            var targetNode = null;

            for (var i = 0; i < allElements.length; i++) {
                var text = allElements[i].innerText;
                if (!text) continue;
                var cleanText = text.replace(/ⓘ/g, '').replace(/\\n/g, '').trim();
                if (cleanText === marketName && text.length < marketName.length + 10) {
                    targetNode = allElements[i];
                    break;
                }
            }

            if (!targetNode) return "";

            // Metoda 1: Szukamy dedykowanego kontenera rynku na Betclic
            var container = targetNode.closest('app-market, .marketBox, .card');
            if (container) {
                return container.innerText || "";
            }

            // Metoda 2: Fallback (idziemy do góry, ale ostrożnie by nie wziąć innych rynków)
            var current = targetNode;
            var lastValid = current;
            for (var j = 0; j < 6; j++) {
                var parent = current.parentElement;
                if (!parent) break;
                
                // Liczymy nagłówki H2. Jeśli jest ich więcej niż 1, to znaczy, 
                // że wyszliśmy za wysoko i łapiemy sąsiednie rynki. Przerywamy wspinaczkę.
                var h2s = Array.from(parent.querySelectorAll('h2')).filter(function(h) { 
                    return h.innerText.trim().length > 0; 
                });
                
                if (h2s.length > 1) {
                    break; 
                }
                
                lastValid = parent;
                current = parent;
            }
            return lastValid.innerText || "";
        """

        JS_EXPAND_MARKET = """
            var marketName = arguments[0];
            var allElements = document.querySelectorAll('h2, h3, p, span, div');
            var targetNode = null;

            for (var i = 0; i < allElements.length; i++) {
                var text = allElements[i].innerText;
                if (!text) continue;
                var cleanText = text.replace(/ⓘ/g, '').replace(/\\n/g, '').trim();
                if (cleanText === marketName && text.length < marketName.length + 10) {
                    targetNode = allElements[i];
                    break;
                }
            }

            if (targetNode) {
                var current = targetNode.closest('app-market, .marketBox, .card') || targetNode;
                
                // Jeśli nie mamy kontenera, szukamy go fallbackiem
                if (!targetNode.closest('app-market, .marketBox, .card')) {
                    for (var j = 0; j < 5; j++) {
                        var parent = current.parentElement;
                        if (!parent) break;
                        var h2s = Array.from(parent.querySelectorAll('h2')).filter(function(h) { return h.innerText.trim().length > 0; });
                        if (h2s.length > 1) break;
                        current = parent;
                    }
                }
                
                // Wewnątrz wyznaczonego kontenera szukamy przycisku rozwijania
                var btns = current.querySelectorAll('div[role="button"], button');
                for (var k = btns.length - 1; k >= 0; k--) {
                    var btnText = btns[k].innerText || "";
                    if (!btnText.match(/\\d+[.,]\\d{2}/)) {
                        var svg = btns[k].querySelector('svg');
                        if (svg || btnText === '' || btnText.toLowerCase().includes('pokaż')) {
                            var clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                            btns[k].dispatchEvent(clickEvent);
                            return true;
                        }
                    }
                }
            }
            return false;
        """

        for idx, match in enumerate(matches):
            if not match.get("link"):
                continue
            
            try:
                driver.get(match["link"])
                
                WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'marketBox') or contains(@class, 'card')]"))
                )
                time.sleep(0.5) 
                
                # 1. BTTS
                try:
                    btts_text = driver.execute_script(JS_GET_MARKET_TEXT, 'Oba zespoły strzelą gola')
                    if btts_text:
                        btts_kursy = re.findall(r"\d+[.,]\d{2}", btts_text)
                        if len(btts_kursy) >= 2:
                            match["btts_tak"] = btts_kursy[0].replace(",", ".")
                            match["btts_nie"] = btts_kursy[1].replace(",", ".")
                except: pass

                # 2. Podwójna Szansa
                try:
                    dc_text = driver.execute_script(JS_GET_MARKET_TEXT, 'Podwójna Szansa')
                    if dc_text:
                        dc_kursy = re.findall(r"\d+[.,]\d{2}", dc_text)
                        if len(dc_kursy) >= 3:
                            match["dc_1x"] = dc_kursy[0].replace(",", ".")
                            match["dc_12"] = dc_kursy[1].replace(",", ".")
                            match["dc_x2"] = dc_kursy[2].replace(",", ".")
                except: pass

                # 3. Over / Under
                try:
                    driver.execute_script(JS_EXPAND_MARKET, 'Gole Powyżej/Poniżej')
                    time.sleep(0.5) 
                    
                    ou_text = driver.execute_script(JS_GET_MARKET_TEXT, 'Gole Powyżej/Poniżej')
                    if ou_text:
                        ou_pattern = r"Powyżej\s*(\d+[.,]\d+)\s*(\d+[.,]\d{2})\s*Poniżej\s*\d+[.,]\d+\s*(\d+[.,]\d{2})"
                        found_lines = re.findall(ou_pattern, ou_text, re.IGNORECASE)
                        
                        for linia, k_over, k_under in found_lines:
                            linia_norm = linia.replace(",", ".")
                            match["over_under"][linia_norm] = {
                                "over": k_over.replace(",", "."),
                                "under": k_under.replace(",", ".")
                            }
                except: pass

                print(f"  -> [{idx+1}/{len(matches)}] Zaktualizowano pomyślnie: {match['home']} vs {match['away']}")
                
            except Exception as e:
                print(f"  -> [{idx+1}/{len(matches)}] Błąd wczytywania detali: {match['home']} vs {match['away']}")

        print("[FAZA 2] Zakończono pobieranie detali.\n")

    print(f"[SUKCES] {len(matches)} meczów wyodrębnionych do zapisu.")
    for m in matches:
        m.pop("link", None) 
        
    return matches

if __name__ == '__main__':
    force_kill_zombie_chromes()
    
    driver = setup_driver()
    if driver:
        try:
            data = {}
            for discipline, url in DISCIPLINES.items():
                print(f"\n===== {discipline} =====")
                best_result = []
                for attempt in range(3):
                    driver.get(url)
                    driver.execute_script("document.body.focus();")
                    time.sleep(1)
                    driver.execute_script("window.scrollTo(0, 1);")
                    time.sleep(1)
                    time.sleep(5)
                    handle_cookies(driver)
                    time.sleep(1)
                    
                    # Dodatkowe zabezpieczenie pętli głównej
                    try:
                        result = scrape_current_page(driver, discipline)
                        if len(result) > len(best_result):
                            best_result = result
                        print(f"[TRY {attempt+1}] {len(result)} meczów")
                        
                        if len(best_result) > 0:
                            break 
                        elif len(result) == 0:
                            # Jeśli nie ma meczów dla dyscypliny, przerywa kolejne próby, by nie marnować czasu na ukryte oferty.
                            break
                            
                    except Exception as e:
                        print(f"[BŁĄD KRYTYCZNY] Wystąpił niespodziewany błąd przy skanowaniu {discipline}: {e}")
                        break
                        
                data[discipline] = best_result
                
            with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print("\nGOTOWE", flush=True)

        finally:
            print("[SYSTEM] Zamykanie...", flush=True)
            try:
                driver.quit() 
            except:
                pass
            force_kill_zombie_chromes()