from playwright.sync_api import sync_playwright
import json
import time
import re
from datetime import datetime, timedelta

print("### STS FINAL REAL FIX ✅ ###")

today = datetime.now()
TARGET_DATES = [
    (today + timedelta(days=1)).strftime("%Y-%m-%d"),
    (today + timedelta(days=2)).strftime("%Y-%m-%d")
]

matches = []
seen = set()

# ✅ POPRAWIONY PARSER DATY
def parse_date(text):
    try:
        part = text.split()[0]

        if "." not in part:
            return None

        d, m = part.split(".")

        d = d.zfill(2)
        m = m.zfill(2)

        y = str(datetime.now().year)

        return f"{y}-{m}-{d}"

    except:
        return None


with sync_playwright() as p:

    browser = p.chromium.launch(headless=False)
    page = browser.new_page()

    page.goto("https://www.sts.pl/")
    time.sleep(5)

    # ✅ cookies
    try:
        page.locator("button:has-text('Akceptuj wszystkie')").click(timeout=5000)
        time.sleep(2)
    except:
        pass

    # ✅ gość
    try:
        page.locator("text=Kontynuuj jako gość").click(timeout=5000)
        time.sleep(3)
    except:
        pass

    # ✅ pre-match piłka
    page.goto("https://www.sts.pl/zaklady-bukmacherskie/pilka-nozna/1")
    time.sleep(6)

    # ✅ wszystkie
    try:
        page.click("text=Wszystkie")
        time.sleep(2)
    except:
        pass

    # ✅ scroll + load
    for _ in range(70):
        page.mouse.wheel(0, 9000)
        time.sleep(0.25)

        try:
            page.click("text=Wyświetl kolejne", timeout=1000)
            time.sleep(1)
        except:
            pass

    print("✅ filtruję mecze...")

    blocks = page.locator("div:has-text('-')")
    count = blocks.count()
    print("📊 bloków:", count)

    # ✅ GŁÓWNA PĘTLA
    for i in range(count):
        try:
            text = blocks.nth(i).inner_text()

            if " - " not in text:
                continue

            lines = text.split("\n")

            # ✅ znajdź drużyny
            teams = None
            for l in lines:
                if " - " in l and len(l) > 5:
                    teams = l.strip()
                    break

            if not teams:
                continue

            # ✅ usuń śmieci
            if any(x in teams.lower() for x in [
                "zawodnik", "strzeli", "goli",
                "builder", "szansa"
            ]):
                continue

            # ✅ znajdź datę
            date = None
            for l in lines:
                if "." in l and ":" in l:
                    date = parse_date(l)
                    break

            # 🔥 TEMP DEBUG
            # print("DATE:", date)

            if not date or date not in TARGET_DATES:
                continue

            # ✅ kursy (regex)
            odds = []
            for l in lines:
                nums = re.findall(r"\d+\.\d+", l.replace(",", "."))
                for n in nums:
                    odds.append(float(n))

            if len(odds) < 3:
                continue

            k1, kx, k2 = odds[0], odds[1], odds[2]

            key = f"{teams}-{date}"
            if key in seen:
                continue
            seen.add(key)

            matches.append({
                "mecz": teams,
                "data": date,
                "kurs_1": k1,
                "kurs_X": kx,
                "kurs_2": k2,
                "bukmacher": "sts"
            })

            print(f"[OK] {teams} {date} {k1} {kx} {k2}")

        except:
            pass

    browser.close()


with open("sts.json", "w", encoding="utf-8") as f:
    json.dump(matches, f, indent=4, ensure_ascii=False)

print("\n✅ zapisano")
print("📊 mecze:", len(matches))