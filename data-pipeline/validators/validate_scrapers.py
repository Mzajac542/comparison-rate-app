import json
import os
import re
import sys
from datetime import datetime, timedelta

from discord_alerts import wyslij_alert_discord


PROJECT_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))
    )
)
DATA_DIR = os.path.join(PROJECT_DIR, "data")

PLIKI = {
    "POLSCY": os.path.join(DATA_DIR, "polscy_bukmacherzy.json"),
    "ZAGRANICZNI": os.path.join(DATA_DIR, "zagraniczni.json"),
}

RAPORTY_SCRAPEROW = {
    "POLSCY": os.path.join(DATA_DIR, "polscy_scrape_report.json"),
    "ZAGRANICZNI": os.path.join(DATA_DIR, "zagraniczni_scrape_report.json"),
}

WYMAGANE_POLA = {
    "id", "mecz", "dyscyplina", "dzien", "godzina",
    "home", "away", "bukmacher", "kurs_1", "kurs_X",
    "kurs_2", "btts", "podwojna_szansa", "over_under", "handicap",
}

SPORTY_TRZYDROGOWE = {"Piłka nożna", "Piłka ręczna"}
SPORTY_DWUDROGOWE = {"Koszykówka", "Tenis", "Boks"}

PROG_JAKOSCI_OSTRZEZENIE = 95.0
PROG_JAKOSCI_KRYTYCZNY = 85.0
PROG_SKUTECZNOSCI_OSTRZEZENIE = 95.0
PROG_SKUTECZNOSCI_KRYTYCZNY = 85.0
PROG_TABEL_OSTRZEZENIE = 95.0
PROG_TABEL_KRYTYCZNY = 80.0
MAKSYMALNY_WIEK_RAPORTU_GODZINY = 8


def czy_poprawny_kurs(wartosc):
    return (
        isinstance(wartosc, (int, float))
        and not isinstance(wartosc, bool)
        and 1.0 <= wartosc <= 1000
    )


def klucz_meczu(rekord):
    return (
        str(rekord.get("dyscyplina", "")).strip(),
        str(rekord.get("dzien", "")).strip(),
        str(rekord.get("godzina", "")).strip(),
        str(rekord.get("home", "")).strip().lower(),
        str(rekord.get("away", "")).strip().lower(),
    )


def sprawdz_date(data_tekst):
    try:
        data = datetime.strptime(data_tekst, "%d.%m.%Y").date()
    except Exception:
        return False

    dzis = datetime.now().date()
    return data in {
        dzis + timedelta(days=1),
        dzis + timedelta(days=2),
    }


def sprawdz_godzine(godzina):
    return bool(re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", str(godzina or "")))


def sprawdz_rynek_glowny(rekord):
    sport = rekord.get("dyscyplina")
    kurs_1 = rekord.get("kurs_1")
    kurs_x = rekord.get("kurs_X")
    kurs_2 = rekord.get("kurs_2")

    if sport in SPORTY_TRZYDROGOWE:
        return all(map(czy_poprawny_kurs, [kurs_1, kurs_x, kurs_2]))

    if sport in SPORTY_DWUDROGOWE:
        return all(map(czy_poprawny_kurs, [kurs_1, kurs_2]))

    return False


def wczytaj_json(sciezka, oczekiwany_typ):
    if not os.path.isfile(sciezka):
        raise FileNotFoundError(f"Plik nie istnieje: {sciezka}")
    if os.path.getsize(sciezka) == 0:
        raise ValueError(f"Plik jest pusty: {sciezka}")

    with open(sciezka, "r", encoding="utf-8") as plik:
        dane = json.load(plik)

    if not isinstance(dane, oczekiwany_typ):
        raise ValueError(f"Nieprawidłowy główny typ danych w pliku: {sciezka}")
    return dane


def wczytaj_raport_scrapera(nazwa_scrapera):
    sciezka = RAPORTY_SCRAPEROW[nazwa_scrapera]
    try:
        raport = wczytaj_json(sciezka, dict)
    except Exception as blad:
        return None, str(blad)

    wymagane = {
        "scraper", "status", "test_mode", "finished_at",
        "matches_found", "matches_attempted", "matches_with_table",
        "matches_saved", "records_saved", "success_rate", "table_rate", "errors",
    }
    brakujace = wymagane - set(raport.keys())
    if brakujace:
        return None, f"Raport wykonania nie ma pól: {sorted(brakujace)}"

    wiek_sekund = datetime.now().timestamp() - os.path.getmtime(sciezka)
    if wiek_sekund > MAKSYMALNY_WIEK_RAPORTU_GODZINY * 3600:
        return None, (
            f"Raport wykonania jest za stary: {wiek_sekund / 3600:.1f} h. "
            "Scraper mógł się nie uruchomić."
        )

    return raport, None


def ustaw_gorszy_status(aktualny, nowy):
    kolejnosc = {"healthy": 0, "warning": 1, "critical": 2}
    return nowy if kolejnosc[nowy] > kolejnosc[aktualny] else aktualny


def waliduj_plik(nazwa_scrapera, sciezka):
    problemy = []
    ostrzezenia = []
    status = "healthy"

    try:
        dane = wczytaj_json(sciezka, list)
    except Exception as blad:
        return {
            "scraper": nazwa_scrapera,
            "status": "critical",
            "records": 0,
            "matches": 0,
            "valid_records": 0,
            "quality": 0.0,
            "match_success_rate": 0.0,
            "table_success_rate": 0.0,
            "execution_report": None,
            "problems": [str(blad)],
            "warnings": [],
        }

    identyfikatory = set()
    duplikaty = 0
    poprawne_rekordy = 0
    poprawne_rynki_glowne = 0
    niepoprawne_daty = 0
    niepoprawne_godziny = 0
    brakujace_pola = 0
    mecze = set()
    mecze_btts = set()
    mecze_dc = set()
    mecze_ou = set()
    mecze_hc = set()

    for indeks, rekord in enumerate(dane, start=1):
        if not isinstance(rekord, dict):
            problemy.append(f"Rekord {indeks} nie jest obiektem.")
            continue

        brakujace = WYMAGANE_POLA - set(rekord.keys())
        if brakujace:
            brakujace_pola += 1
            if brakujace_pola <= 5:
                problemy.append(f"Rekord {indeks}: brak pól {sorted(brakujace)}")
            continue

        identyfikator = str(rekord.get("id", "")).strip()
        if not identyfikator:
            problemy.append(f"Rekord {indeks}: pusty identyfikator.")
        elif identyfikator in identyfikatory:
            duplikaty += 1
        else:
            identyfikatory.add(identyfikator)

        if not sprawdz_date(str(rekord.get("dzien", ""))):
            niepoprawne_daty += 1
        if not sprawdz_godzine(rekord.get("godzina")):
            niepoprawne_godziny += 1

        klucz = klucz_meczu(rekord)
        mecze.add(klucz)

        poprawna_nazwa = all([
            str(rekord.get("home", "")).strip(),
            str(rekord.get("away", "")).strip(),
            str(rekord.get("bukmacher", "")).strip(),
        ])
        poprawny_glowny = sprawdz_rynek_glowny(rekord)

        if poprawny_glowny:
            poprawne_rynki_glowne += 1
        if poprawna_nazwa and poprawny_glowny:
            poprawne_rekordy += 1

        if rekord.get("btts"):
            mecze_btts.add(klucz)
        if rekord.get("podwojna_szansa"):
            mecze_dc.add(klucz)
        if rekord.get("over_under"):
            mecze_ou.add(klucz)
        if rekord.get("handicap"):
            mecze_hc.add(klucz)

    liczba_rekordow = len(dane)
    jakosc = poprawne_rekordy / liczba_rekordow * 100 if liczba_rekordow else 0.0

    if liczba_rekordow == 0:
        problemy.append("Plik zawiera zero rekordów.")
        status = "critical"
    if duplikaty:
        ostrzezenia.append(f"Duplikaty ID: {duplikaty}")
        status = ustaw_gorszy_status(status, "warning")
    if niepoprawne_daty:
        ostrzezenia.append(f"Niepoprawne daty: {niepoprawne_daty}")
        status = ustaw_gorszy_status(status, "warning")
    if niepoprawne_godziny:
        ostrzezenia.append(f"Niepoprawne godziny: {niepoprawne_godziny}")
        status = ustaw_gorszy_status(status, "warning")

    if jakosc < PROG_JAKOSCI_KRYTYCZNY:
        problemy.append(f"Jakość rekordów wynosi {jakosc:.2f}%.")
        status = "critical"
    elif jakosc < PROG_JAKOSCI_OSTRZEZENIE:
        ostrzezenia.append(f"Jakość rekordów wynosi {jakosc:.2f}%.")
        status = ustaw_gorszy_status(status, "warning")

    raport, blad_raportu = wczytaj_raport_scrapera(nazwa_scrapera)
    skutecznosc = 0.0
    skutecznosc_tabel = 0.0

    if blad_raportu:
        problemy.append(blad_raportu)
        status = "critical"
    else:
        skutecznosc = float(raport.get("success_rate", 0))
        skutecznosc_tabel = float(raport.get("table_rate", 0))
        status_raportu = raport.get("status")
        attempted = int(raport.get("matches_attempted", 0))
        records_report = int(raport.get("records_saved", 0))

        if status_raportu != "completed":
            problemy.append(f"Scraper zakończył się statusem {status_raportu!r}.")
            status = "critical"
        if attempted == 0:
            problemy.append("Scraper nie podjął próby przetworzenia żadnego meczu.")
            status = "critical"
        if records_report != liczba_rekordow:
            problemy.append(
                f"Niezgodna liczba rekordów: raport={records_report}, JSON={liczba_rekordow}."
            )
            status = "critical"

        if skutecznosc < PROG_SKUTECZNOSCI_KRYTYCZNY:
            problemy.append(f"Skuteczność zapisu meczów: {skutecznosc:.2f}%.")
            status = "critical"
        elif skutecznosc < PROG_SKUTECZNOSCI_OSTRZEZENIE:
            ostrzezenia.append(f"Skuteczność zapisu meczów: {skutecznosc:.2f}%.")
            status = ustaw_gorszy_status(status, "warning")

        if skutecznosc_tabel < PROG_TABEL_KRYTYCZNY:
            problemy.append(f"Skuteczność ładowania tabel: {skutecznosc_tabel:.2f}%.")
            status = "critical"
        elif skutecznosc_tabel < PROG_TABEL_OSTRZEZENIE:
            ostrzezenia.append(f"Skuteczność ładowania tabel: {skutecznosc_tabel:.2f}%.")
            status = ustaw_gorszy_status(status, "warning")

        bledy = raport.get("errors", {})
        techniczne = sum(int(bledy.get(k, 0)) for k in [
            "match_navigation", "http_error", "ajax_error",
            "table_timeout", "missing_title", "unexpected",
        ])
        if techniczne > 0:
            ostrzezenia.append(f"Błędy techniczne podczas wykonania: {techniczne}.")
            status = ustaw_gorszy_status(status, "warning")

    if problemy:
        status = "critical"

    return {
        "scraper": nazwa_scrapera,
        "status": status,
        "records": liczba_rekordow,
        "matches": len(mecze),
        "valid_records": poprawne_rekordy,
        "valid_main_markets": poprawne_rynki_glowne,
        "quality": round(jakosc, 2),
        "duplicate_ids": duplikaty,
        "matches_with_btts": len(mecze_btts),
        "matches_with_double_chance": len(mecze_dc),
        "matches_with_over_under": len(mecze_ou),
        "matches_with_handicap": len(mecze_hc),
        "match_success_rate": round(skutecznosc, 2),
        "table_success_rate": round(skutecznosc_tabel, 2),
        "execution_report": raport,
        "problems": problemy,
        "warnings": ostrzezenia,
    }


def zapisz_raport(wyniki):
    sciezka = os.path.join(DATA_DIR, "scraper_validation_report.json")
    raport = {
        "checked_at": datetime.now().astimezone().isoformat(),
        "results": wyniki,
    }
    with open(sciezka, "w", encoding="utf-8") as plik:
        json.dump(raport, plik, ensure_ascii=False, indent=4)
    print(f"[VALIDATOR] Zapisano raport: {sciezka}")


def przygotuj_opis_problemow(wyniki):
    linie = []
    for wynik in wyniki:
        if wynik["status"] == "healthy":
            continue
        linie.append(f"**{wynik['scraper']}**")
        for problem in wynik.get("problems", [])[:5]:
            linie.append(f"• {problem}")
        for ostrzezenie in wynik.get("warnings", [])[:5]:
            linie.append(f"• {ostrzezenie}")
    return "\n".join(linie)


def main():
    wyniki = []
    for nazwa, sciezka in PLIKI.items():
        wynik = waliduj_plik(nazwa, sciezka)
        wyniki.append(wynik)
        print(
            f"[VALIDATOR] {nazwa}: status={wynik['status']} | "
            f"jakość={wynik['quality']:.2f}% | "
            f"mecze={wynik['matches']} | rekordy={wynik['records']} | "
            f"skuteczność={wynik['match_success_rate']:.2f}% | "
            f"tabele={wynik['table_success_rate']:.2f}%"
        )

    zapisz_raport(wyniki)
    ma_krytyczny = any(w["status"] == "critical" for w in wyniki)
    ma_ostrzezenie = any(w["status"] == "warning" for w in wyniki)

    if ma_krytyczny:
        poziom = "critical"
        tytul = "Krytyczny problem ze scraperami"
    elif ma_ostrzezenie:
        poziom = "warning"
        tytul = "Ostrzeżenie dotyczące scraperów"
    else:
        poziom = "success"
        tytul = "Walidacja scraperów zakończona"

    opis = przygotuj_opis_problemow(wyniki)
    if not opis:
        opis = "Pliki wynikowe i raporty wykonania obu scraperów przeszły walidację."

    pola = {}
    for wynik in wyniki:
        wykonanie = wynik.get("execution_report") or {}
        bledy = wykonanie.get("errors", {})
        pola[wynik["scraper"]] = (
            f"Status: {wynik['status']}\n"
            f"Jakość rekordów: {wynik['quality']:.2f}%\n"
            f"Skuteczność meczów: {wynik['match_success_rate']:.2f}%\n"
            f"Skuteczność tabel: {wynik['table_success_rate']:.2f}%\n"
            f"Znaleziono: {wykonanie.get('matches_found', 0)}\n"
            f"Próbowano: {wykonanie.get('matches_attempted', 0)}\n"
            f"Zapisano meczów: {wykonanie.get('matches_saved', 0)}\n"
            f"Timeouty tabel: {bledy.get('table_timeout', 0)}\n"
            f"Błędy AJAX: {bledy.get('ajax_error', 0)}\n"
            f"Rekordy: {wynik['records']}"
        )

    wyslij_alert_discord(
        tytul=tytul,
        opis=opis,
        poziom=poziom,
        pola=pola,
    )

    if ma_krytyczny:
        return 2
    if ma_ostrzezenie:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
