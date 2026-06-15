import undetected_chromedriver as uc
import os
import time
import json
import re
import shutil
import subprocess
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from datetime import datetime, timedelta

DISCIPLINES = {
    "pilka_nozna": "https://www.betclic.pl/pilka-nozna-s1",
    "koszykowka": "https://www.betclic.pl/koszykowka-s4",
    "tenis": "https://www.betclic.pl/tenis-s2",
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

            # Flagi zapobiegające zamrażaniu kart
            options.add_argument("--disable-background-timer-throttling")
            options.add_argument("--disable-backgrounding-occluded-windows")
            options.add_argument("--disable-renderer-backgrounding")
            options.add_argument("--disable-ipc-flooding-protection")
            
            # KLUCZOWE USTAWIENIE: Wymuszenie dużego okna i wyrzucenie go poza widoczny ekran (-2000, -2000)
            options.add_argument("--window-size=1920,1080")
            options.add_argument("--window-position=-2000,-2000")

            # Usunięto parametr headless=True, aby strona ładowała się prawidłowo
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
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "div.groupEvents"))
    )

    matches = []
    seen = set()
    today = datetime.now()
    jutro_date = (today + timedelta(days=1)).strftime("%d.%m.%Y")
    pojutrze_date = (today + timedelta(days=2)).strftime("%d.%m.%Y")
    blok_jutro = None
    blok_pojutrze = None

    for _ in range(40):
        bloki = driver.find_elements(By.CSS_SELECTOR, "div.groupEvents")
        for blok in bloki:
            try:
                text = blok.find_element(By.CSS_SELECTOR, "h2").get_attribute("textContent").lower()
                if "jutro" in text:
                    blok_jutro = blok
                    break
            except:
                continue
        if blok_jutro:
            break
        driver.execute_script("window.scrollBy(0, 1200)")
        time.sleep(1.2)

    for _ in range(40):
        bloki = driver.find_elements(By.CSS_SELECTOR, "div.groupEvents")
        found_jutro = False
        for blok in bloki:
            try:
                text = blok.find_element(By.CSS_SELECTOR, "h2").get_attribute("textContent").lower()
            except:
                continue
            if "jutro" in text:
                found_jutro = True
                continue
            if "pojutrze" in text or found_jutro:
                blok_pojutrze = blok
                break
        if blok_pojutrze:
            break
        driver.execute_script("window.scrollBy(0, 800)")
        time.sleep(1.2)
        
    blocks = []
    if blok_jutro:
        blocks.append((blok_jutro, jutro_date))
    if blok_pojutrze:
        blocks.append((blok_pojutrze, pojutrze_date))
    if not blocks:
        return []
        
    for blok, dzien in blocks:
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", blok)
        time.sleep(2)
        print(f"[SKAN] {dzien}")
        smart_scroll_block(driver, blok)
        cards = blok.find_elements(By.CSS_SELECTOR, "[class*='event'], a")
        print(f"[DEBUG] kart: {len(cards)}")
        for karta in cards:
            try:
                teams = karta.find_elements(By.CSS_SELECTOR, ".scoreboard_contestantLabel")
                if len(teams) != 2:
                    continue
                
                home = teams[0].get_attribute("textContent").strip()
                away = teams[1].get_attribute("textContent").strip()
                key = f"{home}-{away}"
                if key in seen:
                    continue
                
                karta_text = karta.get_attribute("textContent")
                time_match = re.search(r"\d{2}:\d{2}", karta_text)
                godzina = time_match.group(0) if time_match else "00:00"
                
                kursy = re.findall(r"\d+\.\d{2}", karta_text.replace(",", "."))
                kursy = [k for k in kursy if 1.01 <= float(k) <= 20]
                k1 = kx = k2 = None
                if len(kursy) >= 3:
                    k1, kx, k2 = kursy[:3]
                elif len(kursy) == 2:
                    k1, k2 = kursy
                if not k1 and not k2:
                    continue
                
                matches.append({
                    "dyscyplina": discipline,
                    "dzien": dzien,
                    "czas": godzina,
                    "home": safe(home),
                    "away": safe(away),
                    "kurs_1": safe(k1),
                    "kurs_X": safe(kx),
                    "kurs_2": safe(k2)
                })
                seen.add(key)
            except:
                continue
    print(f"[SUKCES] {len(matches)} meczów")
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
                    result = scrape_current_page(driver, discipline)
                    if len(result) > len(best_result):
                        best_result = result
                    print(f"[TRY {attempt+1}] {len(result)} meczów")
                    
                    if len(best_result) > 0:
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