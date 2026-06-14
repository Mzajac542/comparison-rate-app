from playwright.sync_api import sync_playwright

import json

import time

import os

import sys

from datetime import datetime, timezone, timedelta

from zoneinfo import ZoneInfo



print("### FORTUNA OMNI-RADAR V18 (H2H ONLY + PERFECT-MATCH) ###")



teraz_pl = datetime.now(ZoneInfo("Europe/Warsaw"))



def get_target_dates():

    return [

        (teraz_pl + timedelta(days=1)).strftime("%Y-%m-%d"), # JUTRO

        (teraz_pl + timedelta(days=2)).strftime("%Y-%m-%d")  # POJUTRZE

    ]



TARGET_DATES = get_target_dates()



SPORT_URLS = {

    "Pilka nozna": "https://www.efortuna.pl/zaklady-bukmacherskie/pilka-nozna",

    "Koszykowka": "https://www.efortuna.pl/zaklady-bukmacherskie/koszykowka",

    "Tenis": "https://www.efortuna.pl/zaklady-bukmacherskie/tenis",

    "Pilka reczna": "https://www.efortuna.pl/zaklady-bukmacherskie/pilka-reczna",

    "Boks": "https://www.efortuna.pl/zaklady-bukmacherskie/mma-boks"

}



SPORT_MAP = {

    "football": "Pilka nozna", "soccer": "Pilka nozna", "piłka": "Pilka nozna", "nozna": "Pilka nozna",

    "tennis": "Tenis", "tenis": "Tenis",

    "basketball": "Koszykowka", "koszyk": "Koszykowka",

    "handball": "Pilka reczna", "reczna": "Pilka reczna",

    "boxing": "Boks", "boks": "Boks", "mma": "Boks"

}



PL_NAMES = {

    "Pilka nozna": "Piłka nożna",

    "Koszykowka": "Koszykówka",

    "Tenis": "Tenis",

    "Pilka reczna": "Piłka ręczna",

    "Boks": "Boks",

    "Inne": "Inne"

}



ALLOWED_SPORTS = ["Pilka nozna", "Koszykowka", "Tenis", "Pilka reczna", "Boks"]



INTERCEPTED_FIXTURES = {}

INTERCEPTED_MARKETS = {}



def extract_json_objects(data):

    fixtures = []

    markets = []

   

    def _scan(node, current_fixture_id=None):

        if isinstance(node, dict):

            node_id = str(node.get("id", ""))

           

            if node_id.startswith("ufo:mtch"):

                current_fixture_id = node_id

                fixtures.append(node)

            elif "marketTypeIds" in node:

                fixtures.append(node)

               

            if node_id.startswith("ufo:mkt") or any(k in node for k in ["outcomes", "selections", "bets", "marketOutcomes"]):

                if not node.get("fixtureId") and not node.get("matchId") and current_fixture_id:

                    node["_injected_fixture_id"] = current_fixture_id

                markets.append(node)

               

            for k, v in node.items():

                _scan(v, current_fixture_id)

               

        elif isinstance(node, list):

            for item in node:

                _scan(item, current_fixture_id)

               

    _scan(data)

    return fixtures, markets



def get_match_id_from_market(market):

    if market.get("_injected_fixture_id"): return market.get("_injected_fixture_id")

    if market.get("fixtureId"): return market.get("fixtureId")

    if market.get("matchId"): return market.get("matchId")

    if market.get("eventId"): return market.get("eventId")

   

    m_id = str(market.get("id", ""))

    if m_id.startswith("ufo:mkt:"):

        parts = m_id.split(":")[-1].split("-")

        if len(parts) >= 2:

            return f"ufo:mtch:{parts[0]}-{parts[1]}"

    return None



def parse_match_date(match_obj):

    for key in ["startDatetime", "startDate", "matchTime", "date"]:

        val = match_obj.get(key)

        if val:

            try:

                if isinstance(val, (int, float)):

                    if val > 9999999999: val /= 1000.0

                    dt_utc = datetime.fromtimestamp(val, tz=timezone.utc)

                    return dt_utc.astimezone(ZoneInfo("Europe/Warsaw"))

                else:

                    s = str(val).replace("T", " ").replace("Z", "").split(".")[0].split("+")[0]

                    dt_utc = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)

                    return dt_utc.astimezone(ZoneInfo("Europe/Warsaw"))

            except: continue

    return None



def handle_response(response):

    if response.status != 200: return

    try:

        if "application/json" not in response.headers.get("content-type", ""): return

        data = response.json()

    except: return



    fixtures, markets = extract_json_objects(data)



    for f in fixtures:

        f_id = f.get("id")

        if f_id and str(f_id).startswith("ufo:mtch"):

            INTERCEPTED_FIXTURES[f_id] = f



    for m in markets:

        f_id = get_match_id_from_market(m)

        if f_id:

            if f_id not in INTERCEPTED_MARKETS:

                INTERCEPTED_MARKETS[f_id] = []

            INTERCEPTED_MARKETS[f_id].append(m)



def run_deep_scraper():

    # POPRAWKA: Dynamiczne obliczanie ścieżki do głównego folderu 'data' projektu

    current_dir = os.path.dirname(os.path.abspath(__file__))

    target_data_dir = os.path.abspath(os.path.join(current_dir, "../../data"))

    os.makedirs(target_data_dir, exist_ok=True)



    with sync_playwright() as p:

        context = p.chromium.launch_persistent_context(

            user_data_dir="pw_fortuna_profile",

            headless=True

        )

        page = context.new_page()

        page.on("response", handle_response)



        for sport, base_url in SPORT_URLS.items():

            print(f"\n-> SPORT: {sport} - Skanowanie pelnej bazy lig...")

            try:

                page.goto(base_url, wait_until="domcontentloaded", timeout=20000)

                time.sleep(3)

               

                for _ in range(4):

                    page.evaluate("""

                        () => {

                            document.querySelectorAll('aside [class*="expand"], aside [class*="arrow"], aside [class*="chevron"], aside i').forEach(el => {

                                if (!el.closest('a') || !el.closest('a').href.includes('/zaklady-bukmacherskie/')) {

                                    try { el.click(); } catch(e) {}

                                }

                            });

                        }

                    """)

                    time.sleep(0.5)



                links = page.evaluate("() => Array.from(document.querySelectorAll('a[href*=\"/zaklady-bukmacherskie/\"]')).map(a => a.href)")

                urls = list(set([l.split("?")[0] for l in links if "/live" not in l and base_url in l]))

                print(f"[OK] Odkryto {len(urls)} lig. Zbieram dane hybrydowo (SSR + XHR)...")



                for url in urls:

                    try:

                        target_url = url + "?filter=all&tab=matches"

                        page.goto(target_url, wait_until="domcontentloaded", timeout=12000)

                        time.sleep(1.0)

                       

                        next_data = page.evaluate("""

                            () => {

                                let script = document.querySelector('script#__NEXT_DATA__');

                                return script ? script.textContent : null;

                            }

                        """)

                        if next_data:

                            try:

                                parsed_html_json = json.loads(next_data)

                                html_fixtures, html_markets = extract_json_objects(parsed_html_json)

                                for f in html_fixtures:

                                    f_id = f.get("id")

                                    if f_id and str(f_id).startswith("ufo:mtch"):

                                        INTERCEPTED_FIXTURES[f_id] = f

                                for mk in html_markets:

                                    f_id = get_match_id_from_market(mk)

                                    if f_id:

                                        if f_id not in INTERCEPTED_MARKETS:

                                            INTERCEPTED_MARKETS[f_id] = []

                                        INTERCEPTED_MARKETS[f_id].append(mk)

                            except: pass



                        for _ in range(3):

                            page.evaluate("window.scrollBy(0, 2500);")

                            page.evaluate("const btn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.toLowerCase().includes('więcej')); if(btn) btn.click();")

                            time.sleep(0.4)

                       

                        sys.stdout.write(".")

                        sys.stdout.flush()

                    except: continue

                print()

            except Exception as e:

                print(f"[UWAGA] Blad w strukturze lig: {e}")

               

        context.close()



    print("\n-> Parowanie rynkow H2H z bazy danych...")

    final_json_data = []

   

    unique_fixtures = {f["id"]: f for f in INTERCEPTED_FIXTURES.values() if str(f.get("id", "")).startswith("ufo:mtch")}



    for match_id, f in unique_fixtures.items():

        dt_local = parse_match_date(f)

        if not dt_local: continue

       

        dzien = dt_local.strftime("%Y-%m-%d")

        if dzien not in TARGET_DATES: continue
           
        home, away = "", ""
        for par in f.get("participants", []):
            if par.get("type") == "HOME": home = par.get("name", "")
            elif par.get("type") == "AWAY": away = par.get("name", "")
        if not home or not away:
            name = f.get("name", "")
            if " - " in name:
                teams = name.split(" - ", 1)
                home, away = teams[0].strip(), teams[1].strip()

        sport_api = str(f.get("sportSeoName") or f.get("sportName") or "").lower()
        m_sport = "Inne"

        for key, val in SPORT_MAP.items():

            if key in sport_api:

                m_sport = val

                break
                
        if m_sport not in ALLOWED_SPORTS: continue

        if dzien == TARGET_DATES[0]: dzien_str = (teraz_pl + timedelta(days=1)).strftime("%d.%m.%Y")
        elif dzien == TARGET_DATES[1]: dzien_str = (teraz_pl + timedelta(days=2)).strftime("%d.%m.%Y")
        else: dzien_str = dzien
        match_obj = {
            "id": match_id,
            "dyscyplina": PL_NAMES.get(m_sport, m_sport),
            "dzien": dzien_str,
            "godzina": dt_local.strftime("%H:%M"),
            "home": home,
            "away": away,
            "kurs_1": None,
            "kurs_X": None,
            "kurs_2": None,
            "bukmacher": "fortuna"
        }
        markets_list = INTERCEPTED_MARKETS.get(match_id, [])
        home_upper = home.upper()
        away_upper = away.upper()

        for market in markets_list:
            name = str(market.get("name") or market.get("marketTypeName") or market.get("marketName") or "").lower()
            outcomes = market.get("outcomes") or market.get("selections") or market.get("bets") or market.get("marketOutcomes") or market.get("odds") or []
            block_keywords = [
                "połowa", "1.", "2.", "kwarta", "set", "gem", "handicap",
                "gole", "powyżej", "poniżej", "rzuty", "rożne", "kartki",
                "obie", "dokładny", "liczba", "zawodnik", "awans", "przedział",
                "hc ", "podwójna", "szansa"
            ]
            if m_sport == "Pilka nozna":

                block_keywords.extend(["zakład bez", "dnb", "bez remisu"])

            if any(kw in name for kw in block_keywords): continue

            if isinstance(outcomes, dict): outcomes = list(outcomes.values())

            if m_sport in ["Koszykowka", "Tenis", "Boks"]:

                ma_remis = False

                for o in outcomes:

                    if not isinstance(o, dict): continue

                    lbl = str(o.get("name") or o.get("label") or o.get("shortName") or o.get("betName") or o.get("selectionName") or "").upper().strip()

                    if lbl in ["X", "0", "REMIS", "DRAW"]:

                        ma_remis = True

                        break

                if ma_remis: continue

            for o in outcomes:

                if not isinstance(o, dict): continue

                label = str(o.get("name") or o.get("label") or o.get("shortName") or o.get("betName") or o.get("selectionName") or "").upper().strip()

                val_raw = o.get("odds") or o.get("oddsValue") or o.get("price") or o.get("value")

                if isinstance(val_raw, dict):

                    val_raw = val_raw.get("value") or val_raw.get("oddsValue") or val_raw.get("price")

                if val_raw is None: continue

                try: val = float(val_raw)

                except: continue

                if label in ["1", "HOME"] and match_obj["kurs_1"] is None:

                    match_obj["kurs_1"] = val

                elif label in ["X", "0", "REMIS", "DRAW"] and match_obj["kurs_X"] is None:

                    if m_sport in ["Pilka nozna", "Pilka reczna"]:

                        match_obj["kurs_X"] = val

                elif label in ["2", "AWAY"] and match_obj["kurs_2"] is None:

                    match_obj["kurs_2"] = val

                elif label == home_upper or (len(home_upper) > 3 and home_upper in label):

                    if match_obj["kurs_1"] is None: match_obj["kurs_1"] = val

                elif label == away_upper or (len(away_upper) > 3 and away_upper in label):

                    if match_obj["kurs_2"] is None: match_obj["kurs_2"] = val

        if match_obj["kurs_1"] or match_obj["kurs_2"]:

            if m_sport in ["Koszykowka", "Tenis", "Boks"]:

                match_obj["kurs_X"] = None

            final_json_data.append(match_obj)

    # POPRAWKA: Zapis z użyciem absolutnej ścieżki do głównego folderu projektu
    output_file_path = os.path.join(target_data_dir, "fortuna.json")

    with open(output_file_path, "w", encoding="utf-8") as f:

        json.dump(final_json_data, f, indent=4, ensure_ascii=False)

    print("\n[OK] PROCES ZAKONCZONY SUKCESEM")
    print(f"[WYNIK] Zapisano H2H dla {len(final_json_data)} przetworzonych meczow.")

if __name__ == "__main__":
    run_deep_scraper() 

