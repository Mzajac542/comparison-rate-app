from playwright.sync_api import sync_playwright, Error as PlaywrightError
import json
import os
import sys
import re
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

print("### FORTUNA OMNI-RADAR V24 (OPTIMIZED TAB-CLICKER & PERFECT-MATCH) ###")

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
    "Pilka ręczna": "Piłka ręczna",
    "Boks": "Boks",
    "Inne": "Inne"
}

ALLOWED_SPORTS = ["Pilka nozna", "Koszykowka", "Tenis", "Pilka reczna", "Boks"]

INTERCEPTED_FIXTURES = {}
INTERCEPTED_MARKETS = {}
GLOBAL_MARKET_MAP = {}
GLOBAL_NODES = {}
ALL_MATCH_URLS = set()
CURRENT_MATCH_ID = None


def extract_json_objects(data):
    fixtures = []
    markets = []
    
    def _scan(node, current_fixture_id=None):
        if isinstance(node, dict):
            node_id = str(node.get("id", ""))

            if node_id:
                GLOBAL_NODES[node_id] = node
            
            if node_id.startswith("ufo:mtch"):
                current_fixture_id = node_id
                fixtures.append(node)
            elif "marketTypeIds" in node:
                fixtures.append(node)
                
            if node_id.startswith("ufo:mkt") or any(k in node for k in ["outcomes", "selections", "bets", "marketOutcomes"]):
                if not node.get("fixtureId") and not node.get("matchId") and current_fixture_id:
                    node["_injected_fixture_id"] = current_fixture_id
                markets.append(node)
                
            # Zbieranie relacji z tablic znormalizowanego stanu (Redux/Apollo)
            if current_fixture_id:
                for k, v in node.items():
                    if isinstance(v, list):
                        for item in v:
                            if isinstance(item, str) and item.startswith("ufo:mkt"):
                                GLOBAL_MARKET_MAP[item] = current_fixture_id
                    elif isinstance(v, str) and v.startswith("ufo:mkt"):
                        GLOBAL_MARKET_MAP[v] = current_fixture_id
                        
            for k, v in node.items():
                if isinstance(v, str) and "/zaklady-bukmacherskie/" in v:
                    clean_url = v.split('?')[0]
                    url_parts = clean_url.split('/')
                    if len(url_parts) >= 6 and "-" in url_parts[-1] and "/live" not in clean_url:
                        full_url = clean_url if clean_url.startswith("http") else "https://www.efortuna.pl" + clean_url
                        ALL_MATCH_URLS.add(full_url)
                _scan(v, current_fixture_id)
                
        elif isinstance(node, list):
            for item in node:
                if isinstance(item, str) and "/zaklady-bukmacherskie/" in item:
                    clean_url = item.split('?')[0]
                    url_parts = clean_url.split('/')
                    if len(url_parts) >= 6 and "-" in url_parts[-1] and "/live" not in clean_url:
                        full_url = clean_url if clean_url.startswith("http") else "https://www.efortuna.pl" + clean_url
                        ALL_MATCH_URLS.add(full_url)
                _scan(item, current_fixture_id)
                
    _scan(data)
    return fixtures, markets


def get_match_id_from_market(market):
    m_id = str(market.get("id", ""))
    
    if m_id in GLOBAL_MARKET_MAP: 
        return GLOBAL_MARKET_MAP[m_id]
        
    if market.get("_injected_fixture_id"): return market.get("_injected_fixture_id")
    if market.get("fixtureId"): return market.get("fixtureId")
    if market.get("matchId"): return market.get("matchId")
    if market.get("eventId"): return market.get("eventId")
    
    for f_id in INTERCEPTED_FIXTURES.keys():
        core_f_id = f_id.split(":")[-1]
        if core_f_id and core_f_id in m_id:
            return f_id
            
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
            except Exception: 
                continue
    return None


def handle_response(response):
    if response.status != 200: return
    try:
        if "application/json" not in response.headers.get("content-type", ""): return
        data = response.json()
    except Exception: 
        return

    fixtures, markets = extract_json_objects(data)

    for f in fixtures:
        f_id = f.get("id")
        if f_id and str(f_id).startswith("ufo:mtch"):
            INTERCEPTED_FIXTURES[f_id] = f

    for m in markets:
        f_id = get_match_id_from_market(m) or CURRENT_MATCH_ID
        if f_id:
            if f_id not in INTERCEPTED_MARKETS:
                INTERCEPTED_MARKETS[f_id] = []
            INTERCEPTED_MARKETS[f_id].append(m)


def run_deep_scraper():
    global ALL_MATCH_URLS
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

        # FAZA 1: Skanowanie struktur ligowych i zbieranie linków
        for sport, base_url in SPORT_URLS.items():
            print(f"\n-> SPORT: {sport} - Skanowanie pelnej bazy lig...")
            try:
                page.goto(base_url, wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(3000) # Zamiana time.sleep na wait_for_timeout!
                
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
                    page.wait_for_timeout(500)

                links = page.evaluate("() => Array.from(document.querySelectorAll('a[href*=\"/zaklady-bukmacherskie/\"]')).map(a => a.href)")
                urls = list(set([l.split("?")[0] for l in links if "/live" not in l and base_url in l]))
                print(f"[OK] Odkryto {len(urls)} lig. Zbieram dane struktur...")

                for url in urls:
                    try:
                        target_url = url + "?filter=all&tab=all"
                        page.goto(target_url, wait_until="domcontentloaded", timeout=12000)
                        page.wait_for_timeout(1000)
                        
                        next_data = page.evaluate("() => { let script = document.querySelector('script#__NEXT_DATA__'); return script ? script.textContent : null; }")
                        if next_data:
                            try:
                                parsed_html_json = json.loads(next_data)
                                html_fixtures, html_markets = extract_json_objects(parsed_html_json)
                                for f in html_fixtures:
                                    f_id = f.get("id")
                                    if f_id and str(f_id).startswith("ufo:mtch"):
                                        INTERCEPTED_FIXTURES[f_id] = f
                            except Exception: 
                                pass

                        for _ in range(3):
                            page.evaluate("window.scrollBy(0, 2500);")
                            page.evaluate("const btn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.toLowerCase().includes('więcej')); if(btn) btn.click();")
                            page.wait_for_timeout(400)
                        
                        discovered_matches = page.evaluate("""
                            () => {
                                const matchLinks = [];
                                document.querySelectorAll('a[href*="/zaklady-bukmacherskie/"]').forEach(a => {
                                    const href = a.href.split('?')[0];
                                    const parts = href.split('/');
                                    if (parts.length >= 7 && parts[parts.length-1].includes('-') && !href.includes('/live')) {
                                        matchLinks.push(href);
                                    }
                                });
                                return matchLinks;
                            }
                        """)
                        for link in discovered_matches:
                            ALL_MATCH_URLS.add(link)

                        sys.stdout.write(".")
                        sys.stdout.flush()
                    except PlaywrightError:
                        continue 
                print()
            except Exception as e:
                print(f"[UWAGA] Blad w strukturze lig: {e}")

        # FAZA 2: DEEP DIVE
        filtered_match_urls = []
        for m_url in ALL_MATCH_URLS:
            if any(key in m_url.lower() for key in SPORT_MAP.keys()):
                filtered_match_urls.append(m_url)

        print(f"\n-> Wykryto łącznie {len(filtered_match_urls)} unikalnych wydarzeń sportowych.")
        print("-> Uruchamiam proces głębokiej ekstrakcji rynków pobocznych (Deep Dive)...")

        for idx, m_url in enumerate(filtered_match_urls, 1):
            try:
                match_slug = m_url.split('/')[-1]
                sys.stdout.write(f"\r[Deep Dive {idx}/{len(filtered_match_urls)}] Odpytuję: {match_slug[:30]}...")
                sys.stdout.flush()

                # --- USTAWIANIE AKTUALNEGO ID MECZU Z URL ---
                global CURRENT_MATCH_ID
                id_search = re.search(r'ufo-mtch-([a-zA-Z0-9\-]+)', m_url)
                if id_search:
                    CURRENT_MATCH_ID = f"ufo:mtch:{id_search.group(1)}"
                else:
                    CURRENT_MATCH_ID = None
                # ---------------------------------------------

                full_url = f"{m_url}?tab=all&filter=all"
                try:
                    page.goto(full_url, wait_until="domcontentloaded", timeout=15000)
                except PlaywrightError:
                    continue # Pomijamy uszkodzony/zbyt wolny URL

                page.wait_for_timeout(1000)
                
                # Zoptymalizowany klikacz zakładek: szuka priorytetowo "Wszystkie"
                page.evaluate("""
                    () => {
                        const tabs = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
                        const wszystkoTab = tabs.find(el => {
                            const txt = (el.textContent || "").trim().toLowerCase();
                            return txt === "wszystkie" || txt === "wszystko" || txt.includes("wszystkie rynki");
                        });
                        if (wszystkoTab) {
                            try { wszystkoTab.click(); } catch(e) {}
                        } else {
                            tabs.forEach(el => {
                                const txt = (el.textContent || "").trim().toLowerCase();
                                if (txt.includes('bramki') || txt.includes('dokładny') || txt.includes('dokladny')) {
                                    try { el.click(); } catch(e) {}
                                }
                            });
                        }
                    }
                """)
                page.wait_for_timeout(1500)

                for _ in range(4):
                    page.evaluate("window.scrollBy(0, 1200);")
                    page.wait_for_timeout(300)
                
                page.evaluate("""
                    () => {
                        document.querySelectorAll('[aria-expanded="false"]').forEach(el => {
                            try { el.click(); } catch(e) {}
                        });
                        
                        const downArrows = document.querySelectorAll('i[class*="down"], i[class*="chevron-down"], [class*="arrow-down"], svg[class*="down"]');
                        downArrows.forEach(arrow => {
                            const btn = arrow.closest('button') || arrow.closest('[role="button"]') || arrow.closest('div');
                            if (btn) {
                                try { btn.click(); } catch(e) {}
                            }
                        });
                    }
                """)
                
                # Zwiększony czas oczekiwania na rozwiązanie eventów i XHR po kliknięciach
                page.wait_for_timeout(2500) 
                
                m_next_data = page.evaluate("() => { let s = document.querySelector('script#__NEXT_DATA__'); return s ? s.textContent : null; }")
                if m_next_data:
                    try:
                        parsed_m_json = json.loads(m_next_data)
                        m_fixtures, m_markets = extract_json_objects(parsed_m_json)
                        for f in m_fixtures:
                            f_id = f.get("id")
                            if f_id and str(f_id).startswith("ufo:mtch"):
                                INTERCEPTED_FIXTURES[f_id] = f
                        for mk in m_markets:
                            f_id = get_match_id_from_market(mk)
                            if f_id:
                                if f_id not in INTERCEPTED_MARKETS:
                                    INTERCEPTED_MARKETS[f_id] = []
                                INTERCEPTED_MARKETS[f_id].append(mk)
                    except Exception: 
                        pass
            except Exception:
                continue
                
        print("\n[OK] Skanowanie głębokie zakończone.")
        context.close()


    # FAZA 3: Parowanie danych i budowa finalnego JSON
    print("\n-> Budowanie bazy danych H2H...")
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

        dzien_str = dt_local.strftime("%d.%m.%Y")
        home_lower = home.lower()
        away_lower = away.lower()

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
            "btts_tak": None,
            "btts_nie": None,
            "over_under": {},
            "podwojna_1X": None,
            "podwojna_12": None,
            "podwojna_X2": None,
            "bukmacher": "fortuna"
        }

        markets_list = INTERCEPTED_MARKETS.get(match_id, [])
        home_upper = home.upper()
        away_upper = away.upper()

        def extract_val(o):
            if not isinstance(o, dict): return None
            val_raw = o.get("odds") or o.get("oddsValue") or o.get("price") or o.get("value") or o.get("rate") or o.get("odd")
            if isinstance(val_raw, dict): 
                val_raw = val_raw.get("value") or val_raw.get("oddsValue") or val_raw.get("price") or val_raw.get("rate") or val_raw.get("odd")
            if val_raw is not None:
                try: return float(val_raw)
                except Exception: return None
            return None

        def extract_label(o):
            if not isinstance(o, dict): return ""
            val = o.get("longName") or o.get("name") or o.get("label") or o.get("shortName") or o.get("betName") or o.get("selectionName") or o.get("outcomeName") or o.get("oddsName") or o.get("desc") or ""
            return str(val).upper().strip()

        def is_team_specific(market_name, team_name):
            if not team_name: return False
            t_lower = team_name.lower()
            if t_lower in market_name: return True
            parts = t_lower.split()
            for p in parts:
                if len(p) > 3 and p in market_name: return True
            return False

        for market in markets_list:
            name = str(
                market.get("name") or 
                market.get("marketTypeName") or 
                market.get("marketName") or 
                market.get("title") or 
                market.get("shortName") or 
                ""
            ).lower()
            
            raw_outcomes = market.get("outcomes") or market.get("selections") or market.get("bets") or market.get("marketOutcomes") or market.get("odds") or []
            if isinstance(raw_outcomes, dict): 
                raw_outcomes = list(raw_outcomes.values())

            outcomes = []
            for o in raw_outcomes:
                if isinstance(o, str):
                    if o in GLOBAL_NODES: 
                        outcomes.append(GLOBAL_NODES[o])
                    else:
                        for nid, nval in GLOBAL_NODES.items():
                            if isinstance(nval, dict) and o in str(nval.get("id", "")):
                                outcomes.append(nval)
                                break
                elif isinstance(o, dict) and "__ref" in o and o["__ref"] in GLOBAL_NODES: 
                    outcomes.append(GLOBAL_NODES[o["__ref"]])
                elif isinstance(o, dict) and "id" in o and o["id"] in GLOBAL_NODES: 
                    outcomes.append(GLOBAL_NODES[o["id"]])
                elif isinstance(o, dict): 
                    outcomes.append(o)

            if not outcomes:
                continue

            if m_sport == "Pilka nozna":
                # 1. BTTS
                if any(k in name for k in ["obie drużyny", "obie druzyny", "btts", "druz.strz.gola", "druż.strz.gola"]): 
                    if any(k in name for k in ["połowa", "polowa", "1.", "2."]): continue
                    for o in outcomes:
                        lbl = extract_label(o)
                        val = extract_val(o)
                        if val:
                            if lbl in ["TAK", "YES", "1"] or "TAK" in lbl: match_obj["btts_tak"] = val
                            elif lbl in ["NIE", "NO", "2", "0"] or "NIE" in lbl: match_obj["btts_nie"] = val
                    continue
                    
                # 2. Over/Under
                is_over_under = False
                if any(k in name for k in ["liczba goli", "liczba bramek", "ilość goli", "ilosc goli", "suma goli", "suma bramek", "gole powyżej", "gole poniżej", "bramki", "under/over", "over/under", "powyżej/poniżej", "powyzej/ponizej"]):
                    if "handicap" not in name and "hc" not in name:
                        is_over_under = True
                
                if not is_over_under:
                    for o in outcomes[:3]:
                        lbl_test = extract_label(o)
                        if any(k in lbl_test for k in ["POW", "PON", "OVER", "UNDER", "WIĘC", "MNIE"]) or lbl_test.startswith("+") or lbl_test.startswith("-"):
                            is_over_under = True
                            break

                if is_over_under:
                    if (is_team_specific(name, home) or is_team_specific(name, away)) and not (" - " in name or ":" in name or (home.lower() in name and away.lower() in name)):
                        continue

                    if any(k in name for k in [
                        "połowa", "polowa", "1. połowa", "2. połowa", "1. poł", "2. poł", "kwarta", "set", "kartki", "rożne", "rozne", 
                        "drużyna", "druzyna", "goście", "gospodarze", "handicap", "hc", "szansa", 
                        "wynik i", "faule", "fauli", "strzały", "strzaly", "strzałów", 
                        "spalone", "spalonych", "celne", "podań", "podania", "asysty", "interwencje",
                        "słupki", "poprzeczki", "wznowienia", "rzuty wolne"
                    ]):
                        continue 

                    market_line = None
                    specifiers = market.get("specifiers", {})
                    if isinstance(specifiers, str):
                        try: specifiers = json.loads(specifiers)
                        except Exception: specifiers = {}
                        
                    if isinstance(specifiers, dict):
                        sp_val = specifiers.get("total") or specifiers.get("line") or specifiers.get("handicap")
                        if sp_val: market_line = str(sp_val).replace(',', '.')
                    
                    if not market_line:
                        for k in ["line", "total", "handicap", "attr", "specialOddsValue"]:
                            if market.get(k):
                                mlm = re.search(r'(\d+(?:[\.,]\d+)?)', str(market.get(k)))
                                if mlm:
                                    market_line = mlm.group(1).replace(',', '.')
                                    break
                                    
                    if not market_line:
                        market_line_match = re.search(r'(\d+[\.,]\d+)', name)
                        market_line = market_line_match.group(1).replace(',', '.') if market_line_match else None

                    for o in outcomes:
                        lbl = extract_label(o)
                        val = extract_val(o)
                        if not val: continue
                        
                        line_match = re.search(r'(\d+(?:[\.,]\d+)?)', lbl)
                        line = line_match.group(1).replace(',', '.') if line_match else market_line
                        
                        if not line:
                            for k in ["line", "total", "specialOddsValue", "oddsName", "name", "label"]:
                                if isinstance(o.get(k), (str, int, float)):
                                    om = re.search(r'(\d+(?:[\.,]\d+)?)', str(o.get(k)))
                                    if om:
                                        line = om.group(1).replace(',', '.')
                                        break

                        if line:
                            try:
                                if float(line) > 8.5: continue
                            except ValueError: continue

                            if '.' not in line: line = f"{line}.0"
                            if line not in match_obj["over_under"]:
                                match_obj["over_under"][line] = {}
                            if any(k in lbl for k in ["+", "POWYŻEJ", "POWYZEJ", "OVER", "WIĘCEJ", "WIECEJ", "POW", "WIE"]):
                                match_obj["over_under"][line]["over"] = val
                            elif any(k in lbl for k in ["-", "PONIŻEJ", "PONIZEJ", "UNDER", "MNIEJ", "PON", "MNI"]):
                                match_obj["over_under"][line]["under"] = val
                    continue

            # Rynki główne (1X2 i Podwójna Szansa)
            block_keywords = [
                "1. połowa", "2. połowa", "1. poł", "2. poł", "kwarta", "set", "gem", "handicap", "kartki", "rożne", "rozne",
                "zawodnik", "awans", "przedział", "przedzial", "hc ", "zakład bez", "zaklad bez", "dnb", "bez remisu"
            ]

            if any(kw in name for kw in block_keywords): 
                continue

            for o in outcomes:
                if not isinstance(o, dict): continue
                label = extract_label(o)
                val = extract_val(o)
                if val is None: continue

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
                    
                elif m_sport == "Pilka nozna":
                    if label in ["10", "1X", "1-X"] and match_obj["podwojna_1X"] is None:
                        match_obj["podwojna_1X"] = val
                    elif label in ["02", "X2", "X-2", "20"] and match_obj["podwojna_X2"] is None:
                        match_obj["podwojna_X2"] = val
                    elif label in ["12", "1-2"] and match_obj["podwojna_12"] is None:
                        match_obj["podwojna_12"] = val

        if match_obj["kurs_1"] or match_obj["kurs_2"]:
            if m_sport in ["Koszykowka", "Tenis", "Boks"]:
                match_obj["kurs_X"] = None
            final_json_data.append(match_obj)

    output_file_path = os.path.join(target_data_dir, "fortuna.json")
    with open(output_file_path, "w", encoding="utf-8") as f:
        json.dump(final_json_data, f, indent=4, ensure_ascii=False)
        
    print("\n[OK] PROCES ZAKONCZONY SUKCESEM")
    print(f"[WYNIK] Zapisano pelne dane (H2H + Rynki poboczne) dla {len(final_json_data)} meczow.")

if __name__ == "__main__":
    run_deep_scraper()