from playwright.sync_api import sync_playwright
import json
import os
import time
from datetime import datetime, timedelta
from collections import Counter

# ===============================
# DNI
# ===============================

def get_superbet_days():
    dni_tygodnia = {
        0: "poniedzialek", 1: "wtorek", 2: "sroda",
        3: "czwartek", 4: "piatek", 5: "sobota", 6: "niedziela"
    }

    teraz = datetime.now()
    jutro_dt = teraz + timedelta(days=1)
    pojutrze_dt = teraz + timedelta(days=2)

    return dni_tygodnia[jutro_dt.weekday()], dni_tygodnia[pojutrze_dt.weekday()]

# ===============================
# SCROLL
# ===============================

def scroll_to_bottom(page):
    print("[SCROLL] API loading...")

    try:
        page.mouse.click(1100, 300)
        time.sleep(0.5)
    except:
        pass

    for _ in range(20):
        page.mouse.wheel(0, 2500)
        page.evaluate("window.scrollBy(0, 2500);")
        time.sleep(1)

# ===============================
# SCRAPER
# ===============================

def scrape_superbet():

    all_results = []

    jutro, pojutrze = get_superbet_days()
    print(f"[SUPERBET] dni: {jutro}, {pojutrze}")

    SPORTS_MAP = {
        "pilka-nozna": "Piłka nożna",
        "koszykowka": "Koszykówka",
        "tenis": "Tenis",
        "pilka-reczna": "Piłka ręczna",
        "boks": "Boks"
    }

    SPORT_URLS = []
    for sport_slug in SPORTS_MAP:
        SPORT_URLS.append(f"https://superbet.pl/zaklady-bukmacherskie/{sport_slug}?day={jutro}")
        SPORT_URLS.append(f"https://superbet.pl/zaklady-bukmacherskie/{sport_slug}?day={pojutrze}")

    teraz = datetime.now()
    string_dzis = teraz.strftime("%Y-%m-%d")
    string_jutro = (teraz + timedelta(days=1)).strftime("%Y-%m-%d")
    string_pojutrze = (teraz + timedelta(days=2)).strftime("%Y-%m-%d")

    def handle_response(response):
        try:
            url = response.url

            if "offer" not in url:
                return

            json_data = response.json()

            if "data" not in json_data:
                return

            current_page_url = page.url

            detected_sport = "Inne"
            for slug, name_pl in SPORTS_MAP.items():
                if slug in current_page_url:
                    detected_sport = name_pl
                    break

            for event in json_data["data"]:

                name = event.get("matchName")
                odds = event.get("odds")
                date = event.get("utcDate")

                if not name or not odds or not date:
                    continue

                match_date_str = date.split("T")[0]

                if match_date_str == string_dzis:
                    dzien = "Dzisiaj"
                elif match_date_str == string_jutro:
                    dzien = "Jutro"
                elif match_date_str == string_pojutrze:
                    dzien = "Pojutrze"
                else:
                    continue

                teams = name.split("·")
                if len(teams) != 2:
                    continue

                odd_1 = odd_X = odd_2 = None

                if len(odds) == 2:
                    odd_1 = odds[0].get("price")
                    odd_2 = odds[1].get("price")
                elif len(odds) >= 3:
                    odd_1 = odds[0].get("price")
                    odd_X = odds[1].get("price")
                    odd_2 = odds[2].get("price")

                all_results.append({
                    "dyscyplina": detected_sport,
                    "dzien": dzien,
                    "home": teams[0].strip(),
                    "away": teams[1].strip(),
                    "startTime": date,
                    "kurs_1": str(odd_1) if odd_1 else "N/A",
                    "kurs_X": str(odd_X) if odd_X else "N/A",
                    "kurs_2": str(odd_2) if odd_2 else "N/A",
                    "url": f"https://superbet.pl/zaklady-bukmacherskie/wydarzenie/{event.get('eventId','')}"
                })

        except:
            pass

    # ===============================
    # PLAYWRIGHT
    # ===============================

    with sync_playwright() as p:
        # headless=True sprawia, że przeglądarka działa w tle i się nie odpala "wizualnie"
        browser = p.chromium.launch(headless=True)

        context = browser.new_context(
            user_agent="Mozilla/5.0",
            viewport={"width": 1280, "height": 800}
        )

        page = context.new_page()
        page.on("response", handle_response)

        for url in SPORT_URLS:
            print(f"-> {url}")
            try:
                page.goto(url, wait_until="domcontentloaded")
                time.sleep(2)
                scroll_to_bottom(page)
            except:
                pass
            time.sleep(1)

        context.close()
        browser.close()

    # ===============================
    # DEDUPE I ZAPIS
    # ===============================

    unique = []
    seen = set()

    for r in all_results:
        key = f"{r['dyscyplina']}_{r['home']}_{r['away']}_{r['startTime']}"

        if key not in seen:
            seen.add(key)
            unique.append(r)

    # filtr tylko jutro + pojutrze
    filtered = [m for m in unique if m["dzien"] in ["Jutro", "Pojutrze"]]

    # BEZWZGLĘDNA ŚCIEŻKA DO FOLDERU DATA
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(BASE_DIR, "data")
    FILE_PATH = os.path.join(DATA_DIR, "superbet.json")

    os.makedirs(DATA_DIR, exist_ok=True)

    with open(FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=2, ensure_ascii=False)

    print(f"\n[OK] Zapisano {len(filtered)} meczy")

    return filtered


# ===============================
# DIAGNOSTYKA (WBUDOWANA)
# ===============================

def run_diagnostics(data):

    print("\n==========================")
    print("[DIAGNOSTYKA] SUPERBET")
    print("==========================")

    print(f"Łącznie meczy: {len(data)}")

    days = Counter([m["dzien"] for m in data])
    print("Dni:")
    print("Jutro:", days.get("Jutro", 0))
    print("Pojutrze:", days.get("Pojutrze", 0))

    sports = Counter([m["dyscyplina"] for m in data])
    print("\nDyscypliny:")
    for k, v in sports.items():
        print(f"{k}: {v}")

    print("==========================\n")


# ===============================
# MAIN
# ===============================

if __name__ == "__main__":
    print("[START] SUPERBET")

    data = scrape_superbet()

    run_diagnostics(data)