from playwright.sync_api import sync_playwright

import json
import os
import time
import re
import unicodedata

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
# HELPERY MARKETÓW
# ===============================

def normalize_text(value):
    if not value:
        return ""

    value = str(value).lower().strip()
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return value


def get_first_existing(dct, keys):
    if not isinstance(dct, dict):
        return None

    for key in keys:
        if key in dct and dct.get(key) not in [None, ""]:
            return dct.get(key)

    return None


def get_price(odd):
    if not isinstance(odd, dict):
        return None

    price_keys = [
        "price", "odd", "odds", "value", "decimalPrice",
        "decimal", "rate", "course"
    ]

    for key in price_keys:
        value = odd.get(key)

        if isinstance(value, dict):
            nested = get_first_existing(value, ["price", "value", "decimal", "amount"])
            if nested not in [None, ""]:
                return nested

        if value not in [None, ""]:
            return value

    return None


def get_odd_name(odd):
    name_keys = [
        "name", "outcomeName", "selectionName", "label",
        "displayName", "shortName", "title", "caption"
    ]

    value = get_first_existing(odd, name_keys)

    if value is None:
        return ""

    return str(value).strip()


def get_market_name(market):
    market_keys = [
        "marketName", "marketTypeName", "bettingMarketName",
        "gameName", "name", "displayName", "label",
        "title", "caption", "typeName", "groupName"
    ]

    value = get_first_existing(market, market_keys)

    if value is None:
        return ""

    return str(value).strip()


def get_line(odd):
    if not isinstance(odd, dict):
        return None
        
    line_keys = ["specialBetValue", "line", "handicap"]
    for k in line_keys:
        if k in odd and odd[k] not in [None, ""]:
            return str(odd[k])
    return None


def extract_line(text):
    if not text:
        return None

    text = str(text).replace(",", ".")
    match = re.search(r"([-+]?\d+(?:\.\d+)?)", text)

    if match:
        return match.group(1)

    return None


def deep_merge_dict(target, source):
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            deep_merge_dict(target[key], value)
        else:
            target[key] = value


def classify_and_save_market(result, market_name, odds_list, home="", away=""):
    if not market_name or not isinstance(odds_list, list):
        return

    market_norm = normalize_text(market_name)
    home_norm = normalize_text(home)
    away_norm = normalize_text(away)

    # -------------------------------
    # BTTS / Obie drużyny strzelą
    # -------------------------------
    if market_norm in ["obie druzyny strzela", "both teams to score", "btts", "obie druzyny strzela (btts)"]:
        valid_btts = True
        for odd in odds_list:
            n_norm = normalize_text(get_odd_name(odd))
            if any(x in n_norm for x in ["powyzej", "ponizej", "+", "-", " i ", "oraz", "1x", "x2", "12"]):
                valid_btts = False
                break
        
        if valid_btts:
            result.setdefault("btts", {})
            for odd in odds_list:
                name_norm = normalize_text(get_odd_name(odd))
                price = get_price(odd)
                if price is None:
                    continue
                if name_norm in ["tak", "yes", "gg"]:
                    result["btts"]["tak"] = str(price)
                elif name_norm in ["nie", "no", "ng"]:
                    result["btts"]["nie"] = str(price)
        return

    # -------------------------------
    # Podwójna szansa
    # -------------------------------
    if market_norm in ["podwojna szansa", "double chance"]:
        valid_dc = True
        for odd in odds_list:
            n_norm = normalize_text(get_odd_name(odd))
            if any(x in n_norm for x in ["powyzej", "ponizej", "btts", "obie", " i ", "oraz"]):
                valid_dc = False
                break

        if valid_dc:
            result.setdefault("podwojna_szansa", {})
            for odd in odds_list:
                name = get_odd_name(odd).upper().replace(" ", "").replace("/", "")
                price = get_price(odd)
                if price is None:
                    continue
                
                # Poprawne, bezpośrednie przypisanie
                if name in ["1X", "X1"]:
                    result["podwojna_szansa"]["1X"] = str(price)
                elif name in ["12", "21"]:
                    result["podwojna_szansa"]["12"] = str(price)
                elif name in ["X2", "2X"]:
                    result["podwojna_szansa"]["X2"] = str(price)
        return

    # -------------------------------
    # Over / Under (Gole w Piłce / Punkty w Koszykówce)
    # -------------------------------
    valid_ou_markets_exact = [
        "liczba goli", "total goals", "suma goli",
        "liczba punktow (z dogrywka)", "liczba punktow", "total points"
    ]
    
    # TWARDE DOPASOWANIE - eliminuje wyciąganie U23 i statystyk konkretnych drużyn
    if market_norm in valid_ou_markets_exact:
        for odd in odds_list:
            name = get_odd_name(odd)
            name_norm = normalize_text(name)
            price = get_price(odd)

            if price is None:
                continue

            if any(x in name_norm for x in [
                "dokladnie", "exact", "remis", "wynik", "strzeli", "tak", "nie",
                " i ", "oraz", "1x", "x2", "12", "gospodarz", "gosc", "polowa", "kwarta"
            ]):
                continue

            line_from_obj = get_line(odd)
            # Usunięto extract_line(market_name) bo powodowało łapanie "23" z "U23"
            line = line_from_obj or extract_line(name)

            if not line:
                continue

            line = line.replace("+", "").replace("-", "").strip()
            
            is_over = "powyzej" in name_norm or "over" in name_norm or "+" in name_norm
            is_under = "ponizej" in name_norm or "under" in name_norm or "-" in name_norm

            if not (is_over or is_under):
                continue

            result.setdefault("over_under", {})
            result["over_under"].setdefault(line, {})

            if is_over:
                result["over_under"][line]["over"] = str(price)
            elif is_under:
                result["over_under"][line]["under"] = str(price)
            
            if not result["over_under"][line]:
                del result["over_under"][line]

        return
        
    # -------------------------------
    # Handicap (Koszykówka)
    # -------------------------------
    valid_handicap_exact = [
        "handicap", "handicap (z dogrywka)", "handicap punktowy", "handicap punktowy (z dogrywka)"
    ]

    # TWARDE DOPASOWANIE
    if market_norm in valid_handicap_exact:
        for odd in odds_list:
            name = get_odd_name(odd)
            name_norm = normalize_text(name)
            price = get_price(odd)
            
            if price is None:
                continue
                
            line_from_obj = get_line(odd)
            line_str = line_from_obj or extract_line(name)
            
            if not line_str:
                continue
                
            try:
                val = float(line_str)
            except:
                continue

            result.setdefault("handicap", {})
            
            # Wyszukiwanie czy to linia gospodarza czy gościa
            is_home = name_norm == "1"
            if home_norm and (name_norm == home_norm or home_norm in name_norm):
                is_home = True
                
            is_away = name_norm == "2"
            if away_norm and (name_norm == away_norm or away_norm in name_norm):
                is_away = True
            
            # Zawsze układamy strukturę pod linię gospodarza.
            if is_home:
                line_key = f"+{val}" if val > 0 else str(val)
                if line_key.endswith(".0"): line_key = line_key[:-2]
                
                result["handicap"].setdefault(line_key, {})
                result["handicap"][line_key]["home"] = str(price)
                
            elif is_away:
                home_val = -val
                line_key = f"+{home_val}" if home_val > 0 else str(home_val)
                if line_key.endswith(".0"): line_key = line_key[:-2]
                
                result["handicap"].setdefault(line_key, {})
                result["handicap"][line_key]["away"] = str(price)

        return


def extract_side_markets(obj, home="", away=""):
    side_markets = {
        "btts": {},
        "podwojna_szansa": {},
        "over_under": {},
        "handicap": {}
    }

    odds_container_keys = [
        "odds", "selections", "outcomes", "bets",
        "items", "prices", "choices"
    ]

    def walk(node, inherited_market_name=""):
        if isinstance(node, dict):
            current_market_name = get_market_name(node) or inherited_market_name

            for key in odds_container_keys:
                value = node.get(key)

                if isinstance(value, list):
                    odds_with_prices = [
                        x for x in value
                        if isinstance(x, dict) and get_price(x) is not None
                    ]

                    if odds_with_prices:
                        classify_and_save_market(
                            side_markets,
                            current_market_name,
                            odds_with_prices,
                            home,
                            away
                        )

            for value in node.values():
                walk(value, current_market_name)

        elif isinstance(node, list):
            for item in node:
                walk(item, inherited_market_name)

    walk(obj)
    return {k: v for k, v in side_markets.items() if v}


def parse_event_id_from_url(url):
    match = re.search(r"/wydarzenie/([^/?#]+)", url)
    if match:
        return match.group(1)
    return None

def absolutize_superbet_url(href):
    if not href:
        return None

    href = str(href).strip()
    if href.startswith("https://superbet.pl"):
        return href
    if href.startswith("/"):
        return "https://superbet.pl" + href
    return None


def parse_event_id_from_any_url(url):
    if not url:
        return None

    url = str(url)
    m = re.search(r"[?&]eventId=(\d+)", url)
    if m:
        return m.group(1)

    m = re.search(r"(\d+)(?:[/?#]|$)", url)
    if m:
        return m.group(1)

    return None


def collect_event_links_from_page(page):
    links = []

    try:
        hrefs = page.eval_on_selector_all(
            "a[href*='/kursy/'], a[href*='/zaklady-bukmacherskie/wydarzenie/'], a[href*='/wydarzenie/']",
            """
            els => els
                .map(a => a.getAttribute('href'))
                .filter(Boolean)
            """
        )

        for href in hrefs:
            full_url = absolutize_superbet_url(href)
            if not full_url:
                continue

            event_id = parse_event_id_from_any_url(full_url)
            if not event_id:
                continue

            links.append({
                "event_id": str(event_id),
                "url": full_url
            })

    except Exception as e:
        print(f"⚠️ [LINKI] Nie udało się zebrać linków z DOM: {e}")

    unique = {}
    for item in links:
        unique[item["event_id"]] = item["url"]

    return unique


def iter_events_by_id(obj, target_id):
    if isinstance(obj, dict):
        if str(obj.get("eventId", "")) == str(target_id):
            yield obj
        for v in obj.values():
            yield from iter_events_by_id(v, target_id)
    elif isinstance(obj, list):
        for item in obj:
            yield from iter_events_by_id(item, target_id)


# ===============================
# SCRAPER
# ===============================

def scrape_superbet():
    results_by_key = {}
    order_keys = []
    detail_event_urls = {}
    event_id_to_key = {}

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
        SPORT_URLS.append((SPORTS_MAP[sport_slug], f"https://superbet.pl/zaklady-bukmacherskie/{sport_slug}?day={jutro}"))
        SPORT_URLS.append((SPORTS_MAP[sport_slug], f"https://superbet.pl/zaklady-bukmacherskie/{sport_slug}?day={pojutrze}"))

    teraz_pl = datetime.now(ZoneInfo("Europe/Warsaw"))
    string_dzis = teraz_pl.strftime("%Y-%m-%d")
    string_jutro = (teraz_pl + timedelta(days=1)).strftime("%Y-%m-%d")
    string_pojutrze = (teraz_pl + timedelta(days=2)).strftime("%Y-%m-%d")

    data_dzis = teraz_pl.strftime("%d.%m.%Y")
    data_jutro = (teraz_pl + timedelta(days=1)).strftime("%d.%m.%Y")
    data_pojutrze = (teraz_pl + timedelta(days=2)).strftime("%d.%m.%Y")

    current_sport_hint = None
    current_detail_event_id = None

    def upsert_result(result):
        event_id = str(result.get("_event_id", "") or "")

        if event_id:
            key = f"id_{event_id}"
        else:
            key = f"{result['dyscyplina']}_{result['home']}_{result['away']}_{result['godzina']}"

        if key not in results_by_key:
            results_by_key[key] = result
            order_keys.append(key)
        else:
            existing = results_by_key[key]
            for k in ["kurs_1", "kurs_X", "kurs_2", "url"]:
                if result.get(k) and result.get(k) is not None:
                    existing[k] = result[k]

            if result.get("dyscyplina") in ["Piłka nożna", "Koszykówka"]:
                existing.setdefault("rynki_poboczne", {})
                deep_merge_dict(existing["rynki_poboczne"], result.get("rynki_poboczne", {}))

        if event_id:
            event_id_to_key[event_id] = key

    def detect_sport_from_page_url(url):
        for slug, name_pl in SPORTS_MAP.items():
            if slug in url:
                return name_pl
        return current_sport_hint or "Inne"

    def parse_basic_event(event, detected_sport):
        name = event.get("matchName")
        odds = event.get("odds")
        raw_utc_date = str(event.get("utcDate"))
        event_id = event.get("eventId")

        if not name or not odds or not raw_utc_date:
            return

        try:
            date_clean = raw_utc_date.replace("T", " ").replace("Z", "")
            date_clean = date_clean.split("+")[0].split(".")[0].strip()
            dt_utc = datetime.strptime(date_clean, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            dt_local = dt_utc.astimezone(ZoneInfo("Europe/Warsaw"))
            godzina = dt_local.strftime("%H:%M")
            match_date_str = dt_local.strftime("%Y-%m-%d")
        except:
            godzina = "00:00"
            match_date_str = raw_utc_date.split("T")[0].split(" ")[0]

        if match_date_str == string_dzis:
            dzien = data_dzis
        elif match_date_str == string_jutro:
            dzien = data_jutro
        elif match_date_str == string_pojutrze:
            dzien = data_pojutrze
        else:
            return

        teams = name.split("·")
        if len(teams) != 2:
            return
            
        home_team = teams[0].strip()
        away_team = teams[1].strip()

        odd_1 = odd_X = odd_2 = None
        if len(odds) == 2:
            odd_1 = odds[0].get("price")
            odd_2 = odds[1].get("price")
        elif len(odds) >= 3:
            odd_1 = odds[0].get("price")
            odd_X = odds[1].get("price")
            odd_2 = odds[2].get("price")

        event_id_str = str(event_id or "")
        result = {
            "dyscyplina": detected_sport,
            "dzien": dzien,
            "godzina": godzina,
            "home": home_team,
            "away": away_team,
            "kurs_1": str(odd_1) if odd_1 else None,
            "kurs_X": str(odd_X) if odd_X else None,
            "kurs_2": str(odd_2) if odd_2 else None,
            "url": f"https://superbet.pl/zaklady-bukmacherskie/wydarzenie/{event_id_str}",
            "_event_id": event_id_str
        }

        if detected_sport in ["Piłka nożna", "Koszykówka"]:
            result["rynki_poboczne"] = extract_side_markets(event, home=home_team, away=away_team)

        upsert_result(result)

    def iter_event_candidates(obj):
        if isinstance(obj, dict):
            if obj.get("matchName") and obj.get("odds") and obj.get("utcDate"):
                yield obj
            for value in obj.values():
                yield from iter_event_candidates(value)
        elif isinstance(obj, list):
            for item in obj:
                yield from iter_event_candidates(item)

    def handle_response(response):
        try:
            url = response.url.lower()
            if "superbet" not in url or not any(x in url for x in ["offer", "event", "market", "odds", "sb-api"]):
                return

            try:
                json_data = response.json()
            except:
                return

            detected_sport = detect_sport_from_page_url(page.url)

            for event in iter_event_candidates(json_data):
                parse_basic_event(event, detected_sport)

            def process_side_markets_dynamically(obj):
                if isinstance(obj, dict):
                    ev_id = obj.get("eventId") or obj.get("id")
                    if not ev_id and current_detail_event_id:
                        ev_id = current_detail_event_id
                        
                    if ev_id:
                        key = event_id_to_key.get(str(ev_id))
                        if key and key in results_by_key and results_by_key[key].get("dyscyplina") in ["Piłka nożna", "Koszykówka"]:
                            home_team = results_by_key[key].get("home", "")
                            away_team = results_by_key[key].get("away", "")
                            
                            side_markets = extract_side_markets(obj, home=home_team, away=away_team)
                            if side_markets:
                                results_by_key[key].setdefault("rynki_poboczne", {})
                                deep_merge_dict(results_by_key[key]["rynki_poboczne"], side_markets)
                    
                    for val in obj.values():
                        process_side_markets_dynamically(val)
                elif isinstance(obj, list):
                    for item in obj:
                        process_side_markets_dynamically(item)

            process_side_markets_dynamically(json_data)
        except:
            pass

    # ===============================
    # PLAYWRIGHT RUN
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

        for sport_name, url in SPORT_URLS:
            current_sport_hint = sport_name
            current_detail_event_id = None
            print(f"-> {url}")

            try:
                page.goto(url, wait_until="domcontentloaded")
                page.wait_for_timeout(2000)

                if sport_name in ["Piłka nożna", "Koszykówka"]:
                    print(f"[SCROLL] Ładowanie API i dynamiczne zbieranie linków dla: {sport_name}...")
                    try:
                        page.mouse.click(1100, 300)
                        page.wait_for_timeout(500)
                    except:
                        pass

                    for _ in range(50):
                        page.mouse.wheel(0, 800)
                        page.evaluate("window.scrollBy(0, 800);")
                        page.wait_for_timeout(800)
                        
                        current_links = collect_event_links_from_page(page)
                        detail_event_urls.update(current_links)

                    print(f"[LINKI] Zebranych unikalnych linków do tej pory: {len(detail_event_urls)}")

                    for event_id, real_url in detail_event_urls.items():
                        key = event_id_to_key.get(str(event_id))
                        if key and key in results_by_key:
                            results_by_key[key]["url"] = real_url
                else:
                    scroll_to_bottom(page)
            except Exception as e:
                print(f"⚠️ [LISTA] Błąd wejścia w {url}: {e}")

            page.wait_for_timeout(1000)

        print(f"\n[SUPERBET] Szczegóły: {len(detail_event_urls)} eventów do sprawdzenia głębiej")

        for event_id, event_url in list(detail_event_urls.items()):
            key = event_id_to_key.get(str(event_id))
            sport_val = results_by_key.get(key, {}).get("dyscyplina") if key else "Inne"
            
            current_sport_hint = sport_val
            current_detail_event_id = event_id
            print(f"--> DETAIL {event_url} ({sport_val})")

            try:
                page.goto(event_url, wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(3500)
                scroll_to_bottom(page)
                try:
                    page.mouse.wheel(0, 1000)
                    page.wait_for_timeout(1000)
                except:
                    pass
            except Exception as e:
                print(f"⚠️ [DETAIL] Błąd wejścia w {event_url}: {e}")

            page.wait_for_timeout(500)

        context.close()
        browser.close()

    # ===============================
    # FILTR I FORMATOWANIE JSONA
    # ===============================

    unique = [results_by_key[key] for key in order_keys]
    filtered = [m for m in unique if m["dzien"] in [data_jutro, data_pojutrze]]

    for match in filtered:
        # Usuwanie tymczasowych zmiennych z prefixem "_"
        keys_to_remove = [k for k in match.keys() if k.startswith("_")]
        for key in keys_to_remove:
            del match[key]
            
        # Standaryzacja kursów na wypadek starych zmiennych i zablokowanie X dla Kosza
        for k in ["kurs_1", "kurs_X", "kurs_2"]:
            if match.get(k) == "N/A" or match.get(k) is None:
                match[k] = None
        
        if match.get("dyscyplina") == "Koszykówka":
            match["kurs_X"] = None
            
        rynki = match.pop("rynki_poboczne", {})
        
        # Odrzucamy rynki poboczne dla sportów innych niż piłka i koszykówka
        if match.get("dyscyplina") not in ["Piłka nożna", "Koszykówka"]:
            continue

        # Dynamiczne generowanie struktury na podstawie dyscypliny
        if match.get("dyscyplina") == "Piłka nożna":
            # Piłka nożna: btts, over_under i podwójna szansa (brak handicapu)
            match["btts_tak"] = None
            match["btts_nie"] = None
            match["dc_1x"] = None
            match["dc_12"] = None
            match["dc_x2"] = None
            match["over_under"] = {}
            
            if "btts" in rynki:
                match["btts_tak"] = rynki["btts"].get("tak")
                match["btts_nie"] = rynki["btts"].get("nie")
                
            if "podwojna_szansa" in rynki:
                match["dc_1x"] = rynki["podwojna_szansa"].get("1X")
                match["dc_12"] = rynki["podwojna_szansa"].get("12")
                match["dc_x2"] = rynki["podwojna_szansa"].get("X2")
                
            if "over_under" in rynki and rynki["over_under"]:
                match["over_under"] = rynki["over_under"]
                
        elif match.get("dyscyplina") == "Koszykówka":
            # Koszykówka: over_under i handicap (brak btts i podwójnej szansy)
            match["over_under"] = {}
            match["handicap"] = {}
            
            if "over_under" in rynki and rynki["over_under"]:
                match["over_under"] = rynki["over_under"]
                
            if "handicap" in rynki and rynki["handicap"]:
                match["handicap"] = rynki["handicap"]

    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DATA_DIR = os.path.join(BASE_DIR, "data")
    FILE_PATH = os.path.join(DATA_DIR, "superbet.json")

    os.makedirs(DATA_DIR, exist_ok=True)

    with open(FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=4, ensure_ascii=False)

    print(f"\n[OK] Zapisano {len(filtered)} meczy do {FILE_PATH}")
    return filtered


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