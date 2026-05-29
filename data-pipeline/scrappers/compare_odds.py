import json
import os
import unicodedata
from datetime import datetime, timedelta

# Funkcja usuwająca polskie znaki (np. ł -> l, ó -> o, itd.)
def remove_accents(input_str):
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return "".join([c for c in nfkd_form if not unicodedata.combining(c)])

def get_real_date_time(dzien_str, godzina_str):
    teraz = datetime.now()
    data_bazowa = teraz
    if "jutro" in str(dzien_str).lower():
        data_bazowa = teraz + timedelta(days=1)
    elif "pojutrze" in str(dzien_str).lower():
        data_bazowa = teraz + timedelta(days=2)
    
    godzina = godzina_str if godzina_str and godzina_str != "N/A" else "00:00"
    return f"{data_bazowa.strftime('%Y-%m-%d')} {godzina}"

def load(file):
    try:
        with open(file, encoding="utf-8") as f:
            return json.load(f)
    except: return []

# BEZWZGLĘDNA ŚCIEŻKA DO FOLDERU DATA
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

betclic_raw = load(os.path.join(DATA_DIR, "betclic.json"))
superbet = load(os.path.join(DATA_DIR, "superbet.json"))

betclic = []
if isinstance(betclic_raw, dict):
    for sport, matches in betclic_raw.items():
        betclic.extend(matches)
else:
    betclic = betclic_raw

def clean(val):
    if val is None: return None
    if isinstance(val, str):
        val = val.replace(",", ".")
        if val == "N/A": return None
        try: return float(val)
        except: return None
    return val

def normalize_date_time(m):
    if m.get("startTime"):
        return str(m["startTime"]).replace("T", " ")[:16]
    return get_real_date_time(m.get("dzien"), m.get("godzina"))

def normalize_match(m):
    name = m.get("mecz") or f"{m.get('home','')} - {m.get('away','')}"
    name = name.lower().replace(".", "").strip()
    parts = name.split(" - ")
    if len(parts) != 2: return name
    return " - ".join(sorted([p.strip() for p in parts]))

def normalize_sport(m):
    # Pobieramy nazwę, usuwamy znaki specjalne i zamieniamy na ASCII
    raw_s = str(m.get("dyscyplina") or "").lower()
    s = remove_accents(raw_s).replace("_", " ").replace("-", " ")
    
    # Mapujemy wszystko na uproszczone klucze (bez polskich znaków)
    mapping = {
        "pilka nozna": "Piłka nożna",
        "nozna": "Piłka nożna",
        "koszykowka": "Koszykówka",
        "koszyk": "Koszykówka",
        "tenis": "Tenis",
        "pilka reczna": "Piłka ręczna",
        "reczna": "Piłka ręczna",
        "boks": "Boks"
    }
    
    for key, name in mapping.items():
        if key in s: return name
            
    print(f"DEBUG: Nie rozpoznano dyscypliny: '{raw_s}' -> po czyszczeniu: '{s}'")
    return "Inne"

merged = {}

def add_data(source_name, data):
    for m in data:
        key = normalize_match(m)
        if not key: continue
        sport = normalize_sport(m)
        dt = normalize_date_time(m)

        if key not in merged:
            merged[key] = {
                "mecz": m.get("mecz") or f"{m.get('home','')} - {m.get('away','')}",
                "data": dt, 
                "dyscyplina": sport,
                "kursy": {
                    "Superbet": {"1": None, "X": None, "2": None},
                    "Betclic": {"1": None, "X": None, "2": None},
                }
            }
        merged[key]["kursy"][source_name] = {
            "1": clean(m.get("kurs_1")),
            "X": clean(m.get("kurs_X")),
            "2": clean(m.get("kurs_2")),
        }

add_data("Betclic", betclic)
add_data("Superbet", superbet)

ORDER = ["Piłka nożna", "Koszykówka", "Tenis", "Piłka ręczna", "Boks"]
result = sorted(merged.values(), key=lambda x: (
    ORDER.index(x["dyscyplina"]) if x["dyscyplina"] in ORDER else 99, 
    x["data"]
))

# ZAPIS DO BEZWZGLĘDNEJ ŚCIEŻKI
with open(os.path.join(DATA_DIR, "wszystkie_mecze_laczni.json"), "w", encoding="utf-8") as f:
    json.dump(result, f, indent=4, ensure_ascii=False)

print(f"✅ Połączono {len(result)} meczy.")