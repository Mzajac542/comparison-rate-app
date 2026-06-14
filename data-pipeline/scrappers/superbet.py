from playwright.sync_api import sync_playwright

import json

import os

import time

from datetime import datetime, timedelta, timezone

from zoneinfo import ZoneInfo

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



    teraz_pl = datetime.now(ZoneInfo("Europe/Warsaw"))

    string_dzis = teraz_pl.strftime("%Y-%m-%d")

    string_jutro = (teraz_pl + timedelta(days=1)).strftime("%Y-%m-%d")

    string_pojutrze = (teraz_pl + timedelta(days=2)).strftime("%Y-%m-%d")



    data_dzis = teraz_pl.strftime("%d.%m.%Y")

    data_jutro = (teraz_pl + timedelta(days=1)).strftime("%d.%m.%Y")

    data_pojutrze = (teraz_pl + timedelta(days=2)).strftime("%d.%m.%Y")



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

                raw_utc_date = str(event.get("utcDate"))



                if not name or not odds or not raw_utc_date:

                    continue



                try:

                    date_clean = raw_utc_date.replace("T", " ").replace("Z", "")

                    date_clean = date_clean.split("+")[0].split(".")[0].strip()

                    dt_utc = datetime.strptime(date_clean, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)

                    dt_local = dt_utc.astimezone(ZoneInfo("Europe/Warsaw"))

                    godzina = dt_local.strftime("%H:%M")

                    match_date_str = dt_local.strftime("%Y-%m-%d")

                except Exception as e:

                    print(f"⚠️ [DATA INFO] Pomijam dziwny format daty: {raw_utc_date} ({e})")

                    godzina = "00:00"

                    match_date_str = raw_utc_date.split("T")[0].split(" ")[0]



                # Tłumaczymy string na format DD.MM.YYYY

                if match_date_str == string_dzis:

                    dzien = data_dzis

                elif match_date_str == string_jutro:

                    dzien = data_jutro

                elif match_date_str == string_pojutrze:

                    dzien = data_pojutrze

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

                    "godzina": godzina,

                    "home": teams[0].strip(),

                    "away": teams[1].strip(),

                    "kurs_1": str(odd_1) if odd_1 else "N/A",

                    "kurs_X": str(odd_X) if odd_X else "N/A",

                    "kurs_2": str(odd_2) if odd_2 else "N/A",

                    "url": f"https://superbet.pl/zaklady-bukmacherskie/wydarzenie/{event.get('eventId','')}"

                })



        except Exception as e:

            pass



    # ===============================

    # PLAYWRIGHT

    # ===============================



    with sync_playwright() as p:

        browser = p.chromium.launch(headless=True)



        context = browser.new_context(

            user_agent="Mozilla/5.0",

            viewport={"width": 1280, "height": 800},

            timezone_id="Europe/Warsaw",

            locale="pl-PL"

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

        key = f"{r['dyscyplina']}_{r['home']}_{r['away']}_{r['godzina']}"



        if key not in seen:

            seen.add(key)

            unique.append(r)



    filtered = [m for m in unique if m["dzien"] in [data_jutro, data_pojutrze]]



    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    DATA_DIR = os.path.join(BASE_DIR, "data")

    FILE_PATH = os.path.join(DATA_DIR, "superbet.json")



    os.makedirs(DATA_DIR, exist_ok=True)



    with open(FILE_PATH, "w", encoding="utf-8") as f:

        json.dump(filtered, f, indent=2, ensure_ascii=False)



    print(f"\n[OK] Zapisano {len(filtered)} meczy")



    return filtered



# ===============================

# DIAGNOSTYKA

# ===============================



def run_diagnostics(data):

    print("\n==========================")

    print("[DIAGNOSTYKA] SUPERBET")

    print("==========================")

    print(f"Łącznie meczy: {len(data)}")



    days = Counter([m["dzien"] for m in data])

    print("Dni:")

    for k, v in days.items():

        print(f"{k}: {v}")



    sports = Counter([m["dyscyplina"] for m in data])

    print("\nDyscypliny:")

    for k, v in sports.items():

        print(f"{k}: {v}")

    print("==========================\n")



if __name__ == "__main__":

    print("[START] SUPERBET")

    data = scrape_superbet()

    run_diagnostics(data)

