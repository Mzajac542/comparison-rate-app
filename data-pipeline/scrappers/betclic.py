import undetected_chromedriver as uc
import os
import time
import json
import re
import subprocess
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ===============================
# DYSCYPLINY
# ===============================
DISCIPLINES = {
    "pilka_nozna": "https://www.betclic.pl/pilka-nozna-s1",
    "koszykowka": "https://www.betclic.pl/koszykowka-s4",
    "tenis": "https://www.betclic.pl/tenis-s2",
    "pilka_reczna": "https://www.betclic.pl/pilka-reczna-s9",
    "boks": "https://www.betclic.pl/boks-s16",
}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_JSON_PATH = os.path.join(BASE_DIR, "data", "betclic.json")

# ===============================
# KONFIGURACJA PRZEGLĄDARKI
# ===============================
def setup_driver():
    print("[BETCLIC] Konfiguracja opcji...")
    options = uc.ChromeOptions()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--start-maximized")
    options.add_argument("--disable-background-timer-throttling")
    options.add_argument("--disable-renderer-backgrounding")
    options.add_argument("--disable-backgrounding-occluded-windows")
    options.add_argument("--headless=new")
    options.add_argument("--disable-features=CalculateNativeWinOcclusion")
    options.add_argument("--disable-features=VizDisplayCompositor")
    
    print("[BETCLIC] Próba uruchomienia drivera...")
    try:
        # Dodano use_subprocess=True dla stabilności
        driver = uc.Chrome(options=options, version_main=148, use_subprocess=True)
        print("[BETCLIC] Driver gotowy!")
        return driver
    except Exception as e:
        print(f"[BETCLIC] BŁĄD startu: {e}")
        return None

# ===============================
# SCRAPER
# ===============================
def handle_cookies(driver):
    try:
        btn = WebDriverWait(driver, 6).until(
            EC.element_to_be_clickable((By.ID, "onetrust-accept-btn-handler"))
        )
        btn.click()
    except:
        driver.execute_script("""
            document.querySelector('#onetrust-banner-sdk')?.remove();
            document.querySelector('.onetrust-pc-dark-filter')?.remove();
            document.body.style.overflow = 'auto';
        """)

def smart_scroll(driver):
    last_count = 0
    for _ in range(12):
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.END)
        time.sleep(1)
        current_count = len(driver.find_elements(By.CSS_SELECTOR, "sports-events-event-card"))
        if current_count == last_count: break
        last_count = current_count

def scrape_current_page(driver, discipline):
    wait = WebDriverWait(driver, 20)
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "verticalScroller_list")))
    time.sleep(2)
    smart_scroll(driver)
    time.sleep(2)

    zapisane_mecze = []
    bloki_dni = driver.find_elements(By.CSS_SELECTOR, "div.groupEvents")
    znaleziono_jutro = False
    licznik_dni = 0

    for blok in bloki_dni:
        try:
            naglowek = blok.find_element(By.CSS_SELECTOR, "h2.groupEvents_headTitle").text.strip()
        except: continue
        if "jutro" in naglowek.lower(): znaleziono_jutro = True
        if not znaleziono_jutro: continue
        if licznik_dni >= 2: break
        dzien = "Jutro" if licznik_dni == 0 else "Pojutrze"
        licznik_dni += 1

        karty = blok.find_elements(By.CSS_SELECTOR, "sports-events-event-card")
        for karta in karty:
            try:
                # Regex do wyciągnięcia godziny z całej karty
                match = re.search(r'\d{2}:\d{2}', karta.text)
                godzina = match.group(0) if match else "00:00"

                teams = karta.find_elements(By.CSS_SELECTOR, "div.scoreboard_contestantLabel")
                if len(teams) < 2: continue
                
                home = teams[0].text.strip()
                away = teams[1].text.strip()
                odds = karta.find_elements(By.CSS_SELECTOR, "button.is-odd")
                kurs_1 = kurs_X = kurs_2 = None
                if len(odds) >= 3:
                    kurs_1 = odds[0].text.strip().split("\n")[-1]
                    kurs_X = odds[1].text.strip().split("\n")[-1]
                    kurs_2 = odds[2].text.strip().split("\n")[-1]
                elif len(odds) == 2:
                    kurs_1 = odds[0].text.strip().split("\n")[-1]
                    kurs_2 = odds[1].text.strip().split("\n")[-1]

                zapisane_mecze.append({"dyscyplina": discipline, "dzien": dzien, "godzina": godzina, "home": home, "away": away, "kurs_1": kurs_1, "kurs_X": kurs_X, "kurs_2": kurs_2})
            except: continue
    return zapisane_mecze

# ===============================
# MAIN
# ===============================
driver = setup_driver()
if driver:
    try:
        all_data = {}
        for discipline, url in DISCIPLINES.items():
            print(f"[BETCLIC] Przetwarzam: {discipline}")
            driver.get(url)
            time.sleep(4)
            handle_cookies(driver)
            all_data[discipline] = scrape_current_page(driver, discipline)
        
        os.makedirs(os.path.dirname(OUTPUT_JSON_PATH), exist_ok=True)
        with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(all_data, f, indent=4, ensure_ascii=False)
        print(f"[SUKCES] Zapisano -> {OUTPUT_JSON_PATH}")
    finally:
        # Grzeczne zamknięcie
        try: 
            driver.quit()
        except: 
            pass
        # Brutalne sprzątanie "zombie" procesów
        subprocess.run(["taskkill", "/f", "/im", "chrome.exe"], capture_output=True)
else:
    print("[BŁĄD] Nie udało się uruchomić przeglądarki.")
    # Sprzątanie nawet przy błędzie startu
    subprocess.run(["taskkill", "/f", "/im", "chrome.exe"], capture_output=True)