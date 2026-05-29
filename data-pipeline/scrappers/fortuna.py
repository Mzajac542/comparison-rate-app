from playwright.sync_api import sync_playwright
import json
import time
import os
import re
from datetime import datetime, timezone, timedelta

print("### FORTUNA FINAL (WORKING ODDS + SPORTS ✅) ###")

# ===============================
# DATES
# ===============================

def get_target_dates():
    today = datetime.now()
    return [
        (today + timedelta(days=1)).strftime("%Y-%m-%d"),
        (today + timedelta(days=2)).strftime("%Y-%m-%d")
    ]

TARGET_DATES = get_target_dates()

SPORT_URLS = {
    "pilka-nozna": "https://www.efortuna.pl/zaklady-bukmacherskie/pilka-nozna",
    "koszykowka": "https://www.efortuna.pl/zaklady-bukmacherskie/koszykowka",
    "tenis": "https://www.efortuna.pl/zaklady-bukmacherskie/tenis",
}

SPORT_MAP = {
    "football": "Pilka nozna",
    "soccer": "Pilka nozna",
    "piłka": "Pilka nozna",
    "nozna": "Pilka nozna",

    "tennis": "Tenis",
    "tenis": "Tenis",

    "basketball": "Koszykowka",
    "koszyk": "Koszykowka",

    "handball": "Pilka reczna",
    "reczna": "Pilka reczna",

    "boxing": "Boks",
    "boks": "Boks",
}

extracted_matches = {}
CURRENT_SPORT = None

# ===============================
# TIME
# ===============================

def timestamp_to_date_str(ts_ms):
    if not ts_ms:
        return ""
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")

def timestamp_to_iso(ts_ms):
    if not ts_ms:
        return ""
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).isoformat()

# ===============================
# ✅ ODDS FIX
# ===============================

def extract_odds_from_match(match):

    try:
        markets = (
            match.get("markets")
            or match.get("betOffers")
            or match.get("offer", {}).get("markets")
            or []
        )

        # ===============================
        # ✅ 1X2 (piłka / ręczna)
        # ===============================
        for m in markets:
            name = (m.get("name") or "").lower()

            if any(x in name for x in ["mecz", "match", "1x2"]):

                selections = (
                    m.get("selections")
                    or m.get("outcomes")
                    or m.get("bets")
                    or []
                )

                odds_map = {"1": None, "X": None, "2": None}

                for s in selections:
                    label = str(
                        s.get("name")
                        or s.get("label")
                        or s.get("outcome")
                        or ""
                    )

                    value = (
                        s.get("odds")
                        or s.get("oddsValue")
                        or s.get("price")
                    )

                    if label in odds_map and value:
                        odds_map[label] = float(value)

                return odds_map["1"], odds_map["X"], odds_map["2"]

        # ===============================
        # ✅ 2-WAY (tenis, kosz, boks)
        # ===============================
        for m in markets:
            selections = (
                m.get("selections")
                or m.get("outcomes")
                or m.get("bets")
                or []
            )

            if len(selections) == 2:
                v1 = selections[0].get("odds")
                v2 = selections[1].get("odds")

                if v1 and v2:
                    return float(v1), None, float(v2)

    except:
        pass

    return None, None, None


# ===============================
# RESPONSE
# ===============================

def handle_response(response):
    if response.status != 200:
        return

    try:
        data = response.json()

        fixtures = []
        if isinstance(data, dict):
            fixtures = data.get("fixtures", []) or data.get("data", {}).get("fixtures", [])

        for match in fixtures:
            match_id = match.get("id")

            if not match_id or not match_id.startswith("ufo:mtch"):
                continue

            ts = match.get("startDatetime")
            date = timestamp_to_date_str(ts)

            if date not in TARGET_DATES:
                continue

            if match_id in extracted_matches:
                continue

            # ===============================
            # SPORT
            # ===============================

            sport_api = str(match.get("sportName") or match.get("sport") or "").lower()

            matched_sport = None

            for key, value in SPORT_MAP.items():
                if key in sport_api:
                    matched_sport = value
                    break

            if not matched_sport:
                if CURRENT_SPORT == "pilka-nozna":
                    matched_sport = "Pilka nozna"
                elif CURRENT_SPORT == "koszykowka":
                    matched_sport = "Koszykowka"
                elif CURRENT_SPORT == "tenis":
                    matched_sport = "Tenis"
                else:
                    continue

            # ===============================
            # ODDS
            # ===============================

            k1, kx, k2 = extract_odds_from_match(match)

            name = match.get("name", "")
            teams = name.split(" - ")

            extracted_matches[match_id] = {
                "id": match_id,
                "dyscyplina": matched_sport,
                "dzien": date,
                "home": teams[0] if len(teams) > 0 else "",
                "away": teams[1] if len(teams) > 1 else "",
                "startTime": timestamp_to_iso(ts),
                "kurs_1": k1,
                "kurs_X": kx,
                "kurs_2": k2,
                "bukmacher": "fortuna",
            }

    except:
        pass

# ===============================
# PLAYWRIGHT
# ===============================

os.makedirs("data", exist_ok=True)

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir="pw_fortuna_profile",
        headless=False
    )

    page = context.new_page()
    page.on("response", handle_response)

    for sport, base_url in SPORT_URLS.items():
        CURRENT_SPORT = sport

        before = len(extracted_matches)

        print(f"\n🏀 SPORT: {sport}")

        try:
            page.goto(base_url, wait_until="networkidle")
            time.sleep(4)

            links = page.evaluate("""
                () => Array.from(document.querySelectorAll('a[href*="/zaklady-bukmacherskie/"]'))
                    .map(a => a.href)
            """)

            urls = list(set([
                l.split("?")[0]
                for l in links
                if "/live" not in l
            ]))

            print(f"✅ Sekcje: {len(urls)}")

            for url in urls:
                try:
                    page.goto(url + "?filter=all&tab=matches", wait_until="networkidle")

                    for _ in range(6):
                        page.mouse.wheel(0, 3000)
                        time.sleep(1)

                    time.sleep(2)

                except:
                    continue

        except:
            print(f"⚠️ błąd sportu: {sport}")

        after = len(extracted_matches)
        print(f"✅ Mecze: +{after - before}")

    context.close()

# ===============================
# SAVE
# ===============================

with open("data/fortuna.json", "w", encoding="utf-8") as f:
    json.dump(list(extracted_matches.values()), f, indent=4, ensure_ascii=False)

print("\n✅ GOTOWE")
print("📊 Mecze:", len(extracted_matches))
