import json
import os
import unicodedata
import re
from datetime import datetime
from zoneinfo import ZoneInfo
import requests

def send_to_discord(match_name, typ_nazwa, dyscyplina, diff, local_bookie, local_odds, foreign_bookie, foreign_odds, mecz_data, mecz_godzina):
    webhook_url = "https://discord.com/api/webhooks/1512914675657080952/E1yWfMuACfkduEkEBT8nKNlRIjCXSzmb_yiOfRDQ2LEL_SiNLJ_NasRoHqKV3mu3lvjT"
    
    embed = {
        "title": "🚀 Znaleziono okazję!",
        "color": 5763719,
        "fields": [
            {"name": "Dyscyplina", "value": dyscyplina, "inline": True},
            {"name": "Data", "value": f"{mecz_data} {mecz_godzina}", "inline": True},
            {"name": "Mecz", "value": match_name, "inline": False},
            {"name": "Typ", "value": typ_nazwa, "inline": True},
            {"name": "Różnica (PL - ZAG)", "value": f"+{diff:.2f}", "inline": True},
            {"name": "Polska (Max)", "value": f"{local_bookie}: {local_odds}", "inline": True},
            {"name": "Zagranica", "value": f"{foreign_bookie}: {foreign_odds}", "inline": True}
        ]
    }
    try:
        requests.post(webhook_url, json={"embeds": [embed]})
    except Exception as e:
        print(f"Błąd wysyłania do Discorda: {e}")

print("### GŁÓWNY SILNIK PORÓWNYWARKI KURSÓW (PL + ZAGRANICA) ###")

# ===============================
# SŁOWNIK TŁUMACZEŃ
# ===============================
TRANSLATIONS = {
    "canada": "kanada", "ireland": "irlandia", "germany": "niemcy", "italy": "wlochy",
    "france": "francja", "spain": "hiszpania", "poland": "polska", "usa": "usa",
    "netherlands": "holandia", "belgium": "belgia", "switzerland": "szwajcaria",
    "austria": "austria", "denmark": "dania", "norway": "norwegia", "sweden": "szwecja",
    "finland": "finlandia", "turkey": "turcja", "greece": "grecja", "brazil": "brazylia",
    "argentina": "argentyna"
}

# ===============================
# FUNKCJE POMOCNICZE
# ===============================
def normalize_date(date_str):
    if not date_str or date_str == "Nieznany": return "9999-12-31"
    try:
        date_str = str(date_str).replace("/", "-").replace(".", "-")
        if re.match(r'\d{2}-\d{2}-\d{4}', date_str):
            return datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
        return date_str[:10]
    except: return "9999-12-31"

def remove_accents(input_str):
    nfkd_form = unicodedata.normalize('NFKD', str(input_str))
    return "".join([c for c in nfkd_form if not unicodedata.combining(c)])

def get_words(name):
    n = remove_accents(name).lower()
    n = re.sub(r'[^a-z0-9 ]', '', n).strip()
    words = n.split()
    
    # Filtrujemy popularne przedrostki klubowe, które zaniżają dokładność dopasowania
    stop_words = {"bk", "fc", "bc", "sc", "hc", "ks", "cez", "gks", "sts", "cf", "ac", "as"}
    filtered_words = [w for w in words if w not in stop_words]
    
    # Zabezpieczenie: jeśli po filtracji nie zostało nic, używamy oryginału
    if not filtered_words: 
        filtered_words = words
        
    return set([TRANSLATIONS.get(w, w) for w in filtered_words])

def is_similar_words(w1, w2):
    if not w1 or not w2: return False
    if w1 == w2: return True

    # Słownik mapujący różne warianty oznaczeń na zunifikowane kategorie
    marker_map = {
        "rezerwy": "reserves", "rezerwa": "reserves", "reserves": "reserves", 
        "res": "reserves", "ii": "reserves", "b": "reserves", "r": "reserves", "2": "reserves",
        "kobiety": "women", "kobiet": "women", "women": "women", "k": "women", "w": "women",
        "u19": "u19", "sub19": "u19",
        "u20": "u20", "sub20": "u20",
        "u21": "u21", "sub21": "u21",
        "u23": "u23", "sub23": "u23",
        "esport": "esport", "cyber": "esport"
    }
    
    w1_normalized = {marker_map.get(w, w) for w in w1}
    w2_normalized = {marker_map.get(w, w) for w in w2}
    
    all_mapped_markers = set(marker_map.values())
    m1 = w1_normalized.intersection(all_mapped_markers)
    m2 = w2_normalized.intersection(all_mapped_markers)
    
    if m1 != m2:
        return False

    inter = w1_normalized.intersection(w2_normalized)
    union = w1_normalized.union(w2_normalized)
    
    return len(inter) / len(union) >= 0.5 if len(union) > 0 else False

def clean_kurs(val):
    if val is None or val in ["N/A", "", "-"]: return None
    try: return float(str(val).replace(",", "."))
    except: return None

# ===============================
# ŁADOWANIE I LOGIKA
# ===============================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            try: return json.load(f)
            except: return []
    return []

merged_matches = []

def add_match(m, source_name):
    home = m.get("home", m.get("home_team", "")).strip()
    away = m.get("away", m.get("away_team", "")).strip()
    if not home or not away: return
    
    dys_raw = m.get("dyscyplina", m.get("sport", "Inne")).lower().strip()
    dys_raw_no_accents = remove_accents(dys_raw)
    
    if "nozna" in dys_raw_no_accents or "football" in dys_raw_no_accents or "soccer" in dys_raw_no_accents:
        dyscyplina = "⚽ Piłka nożna"
    elif "kosz" in dys_raw_no_accents or "basketball" in dys_raw_no_accents:
        dyscyplina = "🏀 Koszykówka"
    elif "tenis" in dys_raw_no_accents or "tennis" in dys_raw_no_accents:
        dyscyplina = "🎾 Tenis"
    elif "reczna" in dys_raw_no_accents or "handball" in dys_raw_no_accents:
        dyscyplina = "🏐 Piłka ręczna"
    elif "siat" in dys_raw_no_accents or "volley" in dys_raw_no_accents:
        dyscyplina = "Siatkówka"
    elif "hokej" in dys_raw_no_accents or "hockey" in dys_raw_no_accents:
        dyscyplina = "Hokej"
    elif "boks" in dys_raw_no_accents or "mma" in dys_raw_no_accents or "walki" in dys_raw_no_accents:
        dyscyplina = "🥊 Boks"
    else:
        dyscyplina = m.get("dyscyplina", "Inne").capitalize()

    dzien_raw = m.get("dzien", m.get("startTime", m.get("date", "")))
    dzien = normalize_date(dzien_raw)
    
    godzina = m.get("czas", m.get("godzina", m.get("time", "")))
    if not godzina:
        time_match = re.search(r'\b(\d{2}:\d{2})\b', str(m.get("startTime", m.get("dzien", ""))))
        if time_match:
            godzina = time_match.group(1)
        else:
            godzina = "00:00"

    k1, kX, k2 = clean_kurs(m.get("kurs_1")), clean_kurs(m.get("kurs_X")), clean_kurs(m.get("kurs_2"))
    
    # ROZSZERZONA LISTA POLSKICH BUKMACHERÓW W add_match
    bukmacher = source_name if source_name in ["Betclic", "Superbet", "Fortuna", "STS", "BETFAN", "LV BET"] else m.get("bukmacher", "Zagraniczny")
    
    home_w, away_w = get_words(home), get_words(away)
    
    existing_match = None
    is_reversed = False
    
    for em in merged_matches:
        if em["dyscyplina"] == dyscyplina and em["dzien"] == dzien:
            if is_similar_words(home_w, em["home_w"]) and is_similar_words(away_w, em["away_w"]):
                existing_match = em
                if em["godzina"] == "00:00" and godzina != "00:00": 
                    em["godzina"] = godzina
                break
            elif is_similar_words(home_w, em["away_w"]) and is_similar_words(away_w, em["home_w"]):
                existing_match = em
                is_reversed = True
                if em["godzina"] == "00:00" and godzina != "00:00": 
                    em["godzina"] = godzina
                break
                
    if is_reversed:
        k1, k2 = k2, k1
    
    if not existing_match:
        existing_match = {
            "mecz": f"{home} - {away}", 
            "dyscyplina": dyscyplina, 
            "dzien": dzien, 
            "godzina": godzina, 
            "home_w": home_w, 
            "away_w": away_w, 
            "kursy": {}
        }
        merged_matches.append(existing_match)
    
    if bukmacher not in existing_match["kursy"]: 
        existing_match["kursy"][bukmacher] = {"1": None, "X": None, "2": None}
    
    if k1 is not None and existing_match["kursy"][bukmacher]["1"] is None: 
        existing_match["kursy"][bukmacher]["1"] = k1
    if kX is not None and existing_match["kursy"][bukmacher]["X"] is None: 
        existing_match["kursy"][bukmacher]["X"] = kX
    if k2 is not None and existing_match["kursy"][bukmacher]["2"] is None: 
        existing_match["kursy"][bukmacher]["2"] = k2

# PĘTLA ŁĄCZENIA - BUKMACHERZY PL (Stara baza)
for src in ["betclic", "superbet", "fortuna"]:
    data = load_json(f"{src}.json")
    for m in (data.values() if isinstance(data, dict) else data):
        for item in (m if isinstance(m, list) else [m]): add_match(item, src.capitalize())

# PĘTLA ŁĄCZENIA - BUKMACHERZY PL (Nowa baza z OddsPortal: STS, BETFAN, LV BET)
polscy_z_oddsportal = load_json("polscy_bukmacherzy.json")
for m in (polscy_z_oddsportal.values() if isinstance(polscy_z_oddsportal, dict) else polscy_z_oddsportal):
    for item in (m if isinstance(m, list) else [m]): 
        add_match(item, item.get("bukmacher", "Nieznany"))

# PĘTLA ŁĄCZENIA - BUKMACHERZY ZAGRANICZNI
zagraniczni_data = load_json("zagraniczni.json")
for m in (zagraniczni_data.values() if isinstance(zagraniczni_data, dict) else zagraniczni_data):
    for item in (m if isinstance(m, list) else [m]): add_match(item, "Zagraniczny")

for em in merged_matches: 
    del em["home_w"], em["away_w"]

# =========================================================================
# SYSTEM OCHRONY PRZED NADPISYWANIEM MECZÓW Z DNIA DZISIEJSZEGO (BUFOROWANIE)
# =========================================================================
strefa_pl = ZoneInfo("Europe/Warsaw")
dzis_str = datetime.now(strefa_pl).strftime("%Y-%m-%d")
sciezka_laczna = os.path.join(DATA_DIR, "wszystkie_mecze_laczni.json")
zostawione_na_dzis = []

if os.path.exists(sciezka_laczna):
    try:
        with open(sciezka_laczna, "r", encoding="utf-8") as f:
            stare_dane = json.load(f)
            for stary_mecz in stare_dane:
                if stary_mecz.get("dzien") == dzis_str:
                    juz_jest = any(
                        nowy["mecz"] == stary_mecz["mecz"] and 
                        nowy["dyscyplina"] == stary_mecz["dyscyplina"]
                        for nowy in merged_matches
                    )
                    if not juz_jest:
                        stary_mecz["_is_cached_today"] = True
                        zostawione_na_dzis.append(stary_mecz)
            print(f"[LOG] Uratowano i zabezpieczono {len(zostawione_na_dzis)} archiwalnych meczy z dnia dzisiejszego ({dzis_str}).")
    except Exception as e:
        print(f"[UWAGA] Problem z odczytem pamięci podręcznej starego pliku: {e}")

merged_matches = zostawione_na_dzis + merged_matches

for em in merged_matches:
    if em.get("dzien") == dzis_str or em.get("_is_cached_today") is True:
        em["is_today"] = True
    else:
        em["is_today"] = False

# =========================================================================

merged_matches.sort(key=lambda x: (x["dzien"], x["godzina"]))

with open(os.path.join(DATA_DIR, "wszystkie_mecze_laczni.json"), "w", encoding="utf-8") as f:
    json.dump(merged_matches, f, indent=4, ensure_ascii=False)

# ===============================
# ANALIZA I POWIADOMIENIA Z BLOKADĄ DZIENNA (ANTY-SPAM DISCORD)
# ===============================
# DODANO NOWYCH BUKMACHERÓW DO LISTY PL
POLISH_BOOKIES = ["Superbet", "Fortuna", "Betclic", "STS", "BETFAN", "LV BET"]

SENT_CACHE_FILE = os.path.join(DATA_DIR, "wyslane_discord.json")
wyslane_dzis = {"data": "", "lista": []}

if os.path.exists(SENT_CACHE_FILE):
    try:
        with open(SENT_CACHE_FILE, "r", encoding="utf-8") as f:
            wyslane_dzis = json.load(f)
    except:
        pass

# RESET O PÓŁNOCY
if wyslane_dzis.get("data") != dzis_str:
    wyslane_dzis = {"data": dzis_str, "lista": []}

licznik_okazji = 0
current_active_opportunities = [] 

for em in merged_matches:
    for typ_zakladu in ["1", "X", "2"]:
        polska_max, polska_nazwa = 0, ""
        zagraniczne_kursy = [] 
        
        for buk, k in em["kursy"].items():
            wartosc = k.get(typ_zakladu)
            if wartosc is None or wartosc == "-": continue 
            
            if buk in POLISH_BOOKIES:
                if wartosc > polska_max: 
                    polska_max, polska_nazwa = wartosc, buk
            else:
                zagraniczne_kursy.append((buk, wartosc))
        
        if not zagraniczne_kursy or polska_max == 0: continue
        
        max_zag_buk, max_zag_kurs = max(zagraniczne_kursy, key=lambda x: x[1])

        # Porównujesz polskie maksimum do NAJWYŻSZEGO kursu z zagranicy
        if (polska_max - max_zag_kurs) >= 0.50:
            okazja_klucz = f"{em['mecz']}_{typ_zakladu}"
            current_active_opportunities.append(okazja_klucz) 
            
            if okazja_klucz in wyslane_dzis["lista"]:
                continue 
            
            typ_nazwa = {"1": "Gospodarz (1)", "X": "Remis (X)", "2": "Gość (2)"}.get(typ_zakladu, typ_zakladu)
            
            # POPRAWKA BŁĘDU (Zamiast min_zag_kurs podajemy max_zag_kurs, żeby nie wyskoczył Error Not Defined)
            send_to_discord(
                em['mecz'], 
                typ_nazwa,
                em["dyscyplina"], 
                (polska_max - max_zag_kurs), 
                polska_nazwa, 
                polska_max, 
                max_zag_buk, 
                max_zag_kurs, 
                em['dzien'], 
                em['godzina']
            )
            licznik_okazji += 1
            
            wyslane_dzis["lista"].append(okazja_klucz)
            with open(SENT_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(wyslane_dzis, f, indent=4, ensure_ascii=False)

print(f"[OK] Polaczono! Znaleziono {len(merged_matches)} unikalnych wydarzen.")
print(f"[!] Aktywnych okazji ogółem (także już wysłanych): {len(current_active_opportunities)}.")
print(f"[!] Wysłano teraz {licznik_okazji} NOWYCH powiadomień na Discorda.")