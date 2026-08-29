from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import time
import json
import os
import re
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import sys
import io
from urllib.parse import urljoin, urlparse

# Wymuszamy kodowanie UTF-8 dla konsoli
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

SPORTY = {
    "Piłka nożna": "football",
    "Koszykówka": "basketball",
    "Tenis": "tennis",
    "Piłka ręczna": "handball",
    "Boks": "boxing"
}

#Testowanie
TRYB_TESTOWY = False
SPORT_TESTOWY = None
LIMIT_MECZOW_TESTOWYCH = 1

BAZOWY_URL = "https://www.oddsportal.com"
ZAPISUJ_DEBUG_HTML = False

ODRZUCANE_SEGMENTY = {
    "results",
    "standings",
    "teams",
    "archive",
    "news",
    "bookmakers",
    "predictions",
    "table",
    "in-play",
    "live",
    "outrights"
}



def normalizuj_link_meczu(href, sciezka_sportu):
    if href is None:
        return None

    href = str(href).strip()

    if not href:
        return None

    if href.startswith(("javascript:", "mailto:", "tel:", "#")):
        return None

    pelny_url = urljoin(BAZOWY_URL + "/", href)
    parsed = urlparse(pelny_url)

    host = parsed.netloc.lower()

    if not host.endswith("oddsportal.com"):
        return None

    parts_original = []

    for segment in parsed.path.split("/"):
        segment = segment.strip()

        if segment:
            parts_original.append(segment)

    if not parts_original:
        return None

    parts_lower = []

    for segment in parts_original:
        parts_lower.append(segment.lower())

    jezyki = {
        "pl",
        "en",
        "de",
        "es",
        "fr",
        "it",
        "pt",
        "cz",
        "sk"
    }

    indeks_sportu = 0

    if parts_lower[0] in jezyki:
        indeks_sportu = 1

    if indeks_sportu >= len(parts_lower):
        return None

    if parts_lower[indeks_sportu] != sciezka_sportu.lower():
        return None

    indeks_h2h = indeks_sportu + 1

    if indeks_h2h >= len(parts_lower):
        return None

    if parts_lower[indeks_h2h] != "h2h":
        return None

    indeks_pierwszej_druzyny = indeks_h2h + 1
    indeks_drugiej_druzyny = indeks_h2h + 2

    if indeks_drugiej_druzyny >= len(parts_original):
        return None

    pierwsza_druzyna = parts_original[indeks_pierwszej_druzyny]
    druga_druzyna = parts_original[indeks_drugiej_druzyny]

    if "-" not in pierwsza_druzyna:
        return None

    if "-" not in druga_druzyna:
        return None

    event_id = parsed.fragment.strip().strip("/")

    if not event_id:
        return None

    if len(event_id) < 6:
        return None

    if len(event_id) > 24:
        return None

    if not event_id.isalnum():
        return None

    czysta_sciezka = "/" + "/".join(parts_original) + "/"

    scheme = parsed.scheme

    if not scheme:
        scheme = "https"

    wynik = (
        scheme
        + "://"
        + parsed.netloc
        + czysta_sciezka
        + "#"
        + event_id
    )

    return wynik



def pobierz_tekst_strony(page_obj):
    try:
        return page_obj.locator("body").inner_text(timeout=3000)
    except Exception:
        return ""


def wykryj_blad_oddsportal(page_obj):
    tekst = pobierz_tekst_strony(page_obj).lower()

    komunikaty_bledow = [
        "failed to fetch data",
        "invalid encrypted ajax payload",
        "unexpected response format",
        "access denied",
        "temporarily unavailable"
    ]

    return any(komunikat in tekst for komunikat in komunikaty_bledow)


def czy_tabela_kursow_jest(page_obj):
    try:
        if page_obj.url.startswith("chrome-error://"):
            return False

        return page_obj.evaluate(
            """
            () => {
                const body = document.body;

                if (!body) {
                    return false;
                }

                const tekst = (body.innerText || "").toLowerCase();

                if (
                    tekst.includes("failed to fetch data") ||
                    tekst.includes("invalid encrypted ajax payload") ||
                    tekst.includes("unexpected response format") ||
                    tekst.includes("access denied") ||
                    tekst.includes("temporarily unavailable")
                ) {
                    return false;
                }

                const elementyKursow = Array.from(
                    document.querySelectorAll(
                        '[data-testid="odd-container-default"]'
                    )
                ).filter(element => {
                    const value = (
                        element.textContent || ""
                    ).trim();

                    return /^\\d{1,3}[.,]\\d{2,3}$/.test(value);
                });

                const maNaglowekBukmacherow =
                    tekst.includes("bukmacherzy") ||
                    tekst.includes("bookmakers");

                return (
                    elementyKursow.length >= 2 &&
                    maNaglowekBukmacherow
                );
            }
            """
        )

    except Exception as blad:
        print(
            f"      [DEBUG] Błąd sprawdzania tabeli: {blad}"
        )
        return False

def czekaj_na_glowny_rynek(
    page_obj,
    nazwa_sportu,
    timeout_ms=15000
):
    czas_start = time.time()

    while (
        time.time() - czas_start
    ) * 1000 < timeout_ms:
        if wykryj_blad_oddsportal(
            page_obj
        ):
            return False, "blad_ajax"

        tabela = pobierz_widoczna_tabele_glowna(
            page_obj,
            nazwa_sportu
        )

        if tabela is not None:
            wymagane = liczba_kursow_glownych(
                nazwa_sportu
            )

            try:
                rzedy = tabela.locator(
                    "tbody tr"
                )

                for indeks in range(
                    rzedy.count()
                ):
                    rzad = rzedy.nth(indeks)

                    tekst = rzad.inner_text(
                        timeout=1000
                    ).lower()

                    bukmacher = (
                        rozpoznaj_bukmachera_z_rzedu_playwright(
                            rzad
                        )
                    )

                    if not bukmacher:
                        continue

                    liczba_kursow = rzad.locator(
                        '[data-testid="odd-container-default"]'
                    ).count()

                    if liczba_kursow < wymagane:
                        liczba_kursow = rzad.locator(
                            '[data-testid="odd-container"]'
                        ).count()

                    if liczba_kursow >= wymagane:
                        return True, "ok"

            except Exception as blad:
                print(
                    f"      [DEBUG MAIN WAIT] "
                    f"Błąd sprawdzania tabeli: "
                    f"{blad}"
                )

        page_obj.wait_for_timeout(500)

    return False, "timeout"


def wyczysc_tytul_meczu(title_raw):
    if not title_raw:
        return ""

    tytul = re.sub(
        r"\s+",
        " ",
        str(title_raw)
    ).strip()

    # Zamieniamy angielskie "vs" na standardowy separator.
    tytul = re.sub(
        r"\s+vs\.?\s+",
        " - ",
        tytul,
        flags=re.IGNORECASE
    )

    # Usuwamy polskie dopiski OddsPortal.
    tytul = re.sub(
        r"\s*-\s*"
        r"(?:kursy|typy|prognozy)"
        r"(?:\s*,\s*|\s+)"
        r".*?$",
        "",
        tytul,
        flags=re.IGNORECASE
    )

    # Osobna, precyzyjna obsługa obecnego tekstu.
    tytul = re.sub(
        r"\s*-\s*"
        r"kursy\s*,\s*prognozy"
        r"\s+i\s+wyniki\s+h2h"
        r"\s*$",
        "",
        tytul,
        flags=re.IGNORECASE
    )

    # Usuwamy angielskie dopiski.
    tytul = re.sub(
        r"\s*-\s*"
        r"odds\s*,\s*predictions"
        r".*?$",
        "",
        tytul,
        flags=re.IGNORECASE
    )

    # Inne możliwe końcówki H2H.
    tytul = re.sub(
        r"\s*-\s*"
        r"(?:odds|predictions|results|h2h)"
        r".*?$",
        "",
        tytul,
        flags=re.IGNORECASE
    )

    return tytul.strip(" -")


def czekaj_na_tabele_kursow(page_obj, timeout_ms=15000):
    czas_start = time.time()
    numer_proby = 0

    while (time.time() - czas_start) * 1000 < timeout_ms:
        numer_proby += 1

        if wykryj_blad_oddsportal(page_obj):
            return False, "blad_ajax"

        if czy_tabela_kursow_jest(page_obj):
            return True, "ok"

        try:
            page_obj.mouse.wheel(0, 250)
        except Exception:
            pass

        page_obj.wait_for_timeout(750)

    return False, "timeout"


def zapisz_debug_html(page_obj, output_dir, nazwa):
    if not ZAPISUJ_DEBUG_HTML:
        return
    try:
        bezpieczna_nazwa = re.sub(
            r"[^A-Za-z0-9_.-]+",
            "_",
            nazwa
        )

        sciezka = os.path.join(
            output_dir,
            f"debug_{bezpieczna_nazwa}.html"
        )

        with open(sciezka, "w", encoding="utf-8") as plik:
            plik.write(page_obj.content())

        print(f"      [DEBUG] Zapisano HTML: {sciezka}")
    except Exception as blad:
        print(f"      [DEBUG] Nie udało się zapisać HTML: {blad}")


def pobierz_godzine_z_elementu(element):
    try:
        tekst = element.inner_text(timeout=1000)
    except Exception:
        tekst = ""

    dopasowanie = re.search(r"\b([01]\d|2[0-3]):[0-5]\d\b", tekst)

    if dopasowanie:
        return dopasowanie.group(0)

    return "00:00"


def pobierz_linki_meczow_z_listy(
    page_obj,
    sciezka_sportu,
    dzien,
    debug_dir
):
    znalezione = []
    widziane = set()

    wiersze = page_obj.locator(
        '[data-testid="game-row"]'
    )

    try:
        liczba_wierszy = wiersze.count()
    except Exception:
        liczba_wierszy = 0

    print(
        f"    [INFO] Wykryto {liczba_wierszy} "
        f"wierszy data-testid=game-row"
    )

    for indeks in range(liczba_wierszy):
        try:
            wiersz = wiersze.nth(indeks)

            link_element = wiersz.locator(
                'a[href*="/h2h/"][href*="#"]'
            ).first

            if link_element.count() == 0:
                continue

            href = link_element.get_attribute("href")

            poprawny_url = normalizuj_link_meczu(
                href,
                sciezka_sportu
            )

            if indeks < 3:
                print(
                    f"      [DEBUG LINK] "
                    f"wiersz={indeks + 1} | "
                    f"href={href!r} | "
                    f"wynik={poprawny_url!r}"
                )

            if not poprawny_url:
                continue

            godzina = pobierz_godzine_z_elementu(
                wiersz
            )

            klucz = (poprawny_url, dzien)

            if klucz in widziane:
                continue

            widziane.add(klucz)

            znalezione.append(
                (
                    poprawny_url,
                    dzien,
                    godzina
                )
            )

        except Exception as blad:
            print(
                f"      [WARN] Błąd wiersza "
                f"{indeks + 1}: {blad}"
            )

    if not znalezione:
        zapisz_debug_html(
            page_obj,
            debug_dir,
            f"lista_{sciezka_sportu}_{dzien}"
        )

    return znalezione


# BEZPIECZNY PARSER KURSÓW
def parsuj_kurs(element):
    if not element:
        return 0.0

    tekst = element.get_text(" ", strip=True)

    if not tekst or tekst == "-":
        return 0.0

    tekst = tekst.replace(",", ".")

    dopasowanie = re.search(
        r"(?<!\d)(\d{1,3}(?:\.\d{1,3})?)(?!\d)",
        tekst
    )

    if not dopasowanie:
        return 0.0

    try:
        kurs = float(dopasowanie.group(1))

        if kurs < 1.0 or kurs > 1000:
            return 0.0

        return kurs

    except ValueError:
        return 0.0


def rozpoznaj_bukmachera_z_tekstu(tekst):
    if not tekst:
        return None

    tekst = re.sub(
        r"\s+",
        " ",
        str(tekst).lower()
    ).strip()

    tekst_bez_spacji = re.sub(
        r"\s+",
        "",
        tekst
    )

    if re.search(
        r"(?<![a-z0-9])(?:e\s*)?fortuna(?:\.pl)?(?![a-z0-9])",
        tekst,
        re.IGNORECASE
    ):
        return "FORTUNA"

    if re.search(
        r"(?<![a-z0-9])betclic(?:\.pl)?(?![a-z0-9])",
        tekst,
        re.IGNORECASE
    ):
        return "BETCLIC"

    if re.search(
        r"(?<![a-z0-9])super\s*bet(?:\.pl)?(?![a-z0-9])",
        tekst,
        re.IGNORECASE
    ):
        return "SUPERBET"

    if re.search(
        r"(?<![a-z0-9])betfan(?:\.pl)?(?![a-z0-9])",
        tekst,
        re.IGNORECASE
    ):
        return "BETFAN"

    if re.search(
        r"(?<![a-z0-9])lv\s*bet(?:\.pl)?(?![a-z0-9])",
        tekst,
        re.IGNORECASE
    ):
        return "LV BET"

    if re.search(
        r"(?<![a-z0-9])sts(?:\.pl)?(?![a-z0-9])",
        tekst,
        re.IGNORECASE
    ):
        return "STS"

    if tekst_bez_spacji in {
        "efortuna",
        "efortuna.pl",
        "fortuna",
        "fortuna.pl"
    }:
        return "FORTUNA"

    if tekst_bez_spacji in {
        "betclic",
        "betclic.pl"
    }:
        return "BETCLIC"

    if tekst_bez_spacji in {
        "superbet",
        "superbet.pl"
    }:
        return "SUPERBET"

    if tekst_bez_spacji in {
        "betfan",
        "betfan.pl"
    }:
        return "BETFAN"

    if tekst_bez_spacji in {
        "lvbet",
        "lvbet.pl"
    }:
        return "LV BET"

    if tekst_bez_spacji in {
        "sts",
        "sts.pl"
    }:
        return "STS"

    return None

def zidentyfikuj_bukmachera(row):
    if row is None:
        return None

    nazwa_element = row.select_one(
        '[data-testid="outrights-expanded-bookmaker-name"]'
    )

    if nazwa_element:
        nazwa = nazwa_element.get_text(
            " ",
            strip=True
        )

        bukmacher = rozpoznaj_bukmachera_z_tekstu(
            nazwa
        )

        if bukmacher:
            return bukmacher

    row_text = row.get_text(
        " ",
        strip=True
    )

    return rozpoznaj_bukmachera_z_tekstu(
        row_text
    )

def bezpieczny_id(tekst):
    tekst = str(tekst).lower().strip()

    tekst = re.sub(
        r"[^a-z0-9ąćęłńóśźż]+",
        "_",
        tekst
    )

    return tekst.strip("_")

def pobierz_kursy_z_rzedu(row):
    kursy = []

    kontenery = row.select(
        '[data-testid="odd-container"]'
    )

    for kontener in kontenery:
        element_kursu = kontener.select_one(
            'a, [data-testid="odd-container-default"]'
        )

        if element_kursu is None:
            continue

        kurs = parsuj_kurs(element_kursu)

        if kurs > 0:
            kursy.append(kurs)

    return kursy

# HELPER DO ZNAJDOWANIA LINII O/U I HANDICAP
def znajdz_wartosc_linii(element):
    curr = element
    # Idziemy w górę drzewa DOM w poszukiwaniu kontenera z nagłówkiem (max 6 poziomów)
    for _ in range(6):
        if not curr or curr.name in ['body', 'html']: break
        
        header = curr.find('div', class_=re.compile(r'cursor-pointer'))
        if header:
            tekst = header.get_text(separator=" ", strip=True)
            
            # 1. Priorytet: Precyzyjne dopasowanie linii tuż po nazwie rynku (np. Over/Under +173.5, Asian Handicap -4.5)
            match = re.search(r'(?:Over/Under|Handicap|Total|Asian Handicap)\s*([\+\-]?\d+(?:\.\d+)?)', tekst, re.IGNORECASE)
            if match:
                val = match.group(1)
                if not val.startswith(('+', '-')) and val != "0":
                    val = '+' + val
                return val

            # 2. Fallback: Szukamy wartości (do 3 cyfr przed kropką, np. +168.5, -5.5) po odfiltrowaniu Payout/procentów
            tekst_czysty = re.sub(r'3\s*way|1st|2nd|payout|\d+%', '', tekst, flags=re.IGNORECASE)
            matches = re.findall(r'([\+\-]\d{1,3}(?:\.\d+)?|\d{1,3}\.\d+)', tekst_czysty)
            if not matches:
                matches = re.findall(r'([\+\-]?\d{1,3})', tekst_czysty)
                
            matches = [m for m in matches if m and m not in ['+', '-']]
            if matches:
                val = matches[0]
                if not val.startswith(('+', '-')) and val != "0":
                    val = '+' + val
                return val
        curr = curr.parent
    return None


def pobierz_widoczna_tabele_glowna(
    page_obj,
    nazwa_sportu
):
    tabele = page_obj.locator("table")

    try:
        liczba_tabel = tabele.count()
    except Exception:
        liczba_tabel = 0

    for indeks in range(liczba_tabel):
        tabela = tabele.nth(indeks)

        try:
            if not tabela.is_visible():
                continue

            naglowek = tabela.locator(
                "thead"
            ).inner_text(
                timeout=1500
            )

            naglowek = re.sub(
                r"\s+",
                " ",
                naglowek
            ).strip().lower()

        except Exception:
            continue

        print(
            f"      [MAIN TABLE {indeks + 1}] "
            f"{naglowek!r}"
        )

        if (
            "over" in naglowek
            or "under" in naglowek
            or "handicap" in naglowek
        ):
            continue

        if nazwa_sportu in {
            "Piłka nożna",
            "Piłka ręczna"
        }:
            ma_1 = bool(
                re.search(
                    r"(^|\s)1(?:\s|$)",
                    naglowek
                )
            )

            ma_x = bool(
                re.search(
                    r"(^|\s)x(?:\s|$)",
                    naglowek
                )
            )

            ma_2 = bool(
                re.search(
                    r"(^|\s)2(?:\s|$)",
                    naglowek
                )
            )

            if ma_1 and ma_x and ma_2:
                return tabela

        elif nazwa_sportu in {
            "Koszykówka",
            "Tenis",
            "Boks"
        }:
            # Home/Away powinien mieć:
            # Bookmakers | 1 | 2 | Payout
            # Nie może zawierać kolumny X.

            ma_bukmacherow = (
                "bookmakers" in naglowek
                or "bukmacherzy" in naglowek
            )

            ma_1 = bool(
                re.search(
                    r"(^|\s)1(?:\s|$)",
                    naglowek
                )
            )

            ma_x = bool(
                re.search(
                    r"(^|\s)x(?:\s|$)",
                    naglowek
                )
            )

            ma_2 = bool(
                re.search(
                    r"(^|\s)2(?:\s|$)",
                    naglowek
                )
            )

            ma_payout = (
                "payout" in naglowek
                or "wypłata" in naglowek
                or "wyplata" in naglowek
            )

            if (
                ma_bukmacherow
                and ma_1
                and ma_2
                and not ma_x
                and ma_payout
            ):
                print(
                    f"      [MAIN HOME/AWAY] "
                    f"Wybrano tabelę Home/Away: "
                    f"{naglowek!r}"
                )
                return tabela

    return None  


def rozpoznaj_bukmachera_z_rzedu_playwright(rzad):
    selektory_nazwy = [
        '[data-testid="outrights-expanded-bookmaker-name"]',
        '[data-testid*="bookmaker-name"]',
        'a[href*="/bookmaker/"]',
        'td:first-child'
    ]

    for selektor in selektory_nazwy:
        try:
            elementy = rzad.locator(
                selektor
            )

            liczba = elementy.count()

            for indeks in range(liczba):
                element = elementy.nth(
                    indeks
                )

                try:
                    if not element.is_visible():
                        continue

                    tekst = element.inner_text(
                        timeout=1000
                    )

                except Exception:
                    continue

                bukmacher = (
                    rozpoznaj_bukmachera_z_tekstu(
                        tekst
                    )
                )

                if bukmacher:
                    print(
                        f"      [DEBUG BOOKMAKER] "
                        f"selektor={selektor!r} | "
                        f"tekst={tekst!r} | "
                        f"wynik={bukmacher}"
                    )

                    return bukmacher

        except Exception:
            continue

    # Awaryjnie analizujemy cały wiersz,
    # ale dopiero gdy nie znaleziono elementu nazwy.
    try:
        tekst_rzedu = rzad.inner_text(
            timeout=1500
        )
    except Exception:
        tekst_rzedu = ""

    bukmacher = rozpoznaj_bukmachera_z_tekstu(
        tekst_rzedu
    )

    if bukmacher:
        print(
            f"      [DEBUG BOOKMAKER FALLBACK] "
            f"tekst={tekst_rzedu!r} | "
            f"wynik={bukmacher}"
        )

    return bukmacher


def pobierz_kursy_glowne_playwright(
    page_obj,
    nazwa_sportu
):
    tabela = pobierz_widoczna_tabele_glowna(
        page_obj,
        nazwa_sportu
    )

    if tabela is None:
        print(
            "      [WARN MAIN] Nie znaleziono "
            "widocznej tabeli rynku głównego."
        )
        return {}

    wymagane_kursy = liczba_kursow_glownych(
        nazwa_sportu
    )

    wyniki = {}

    rzedy = tabela.locator("tbody tr")

    try:
        liczba_rzedow = rzedy.count()
    except Exception:
        liczba_rzedow = 0

    print(
        f"      [MAIN] Wiersze tabeli: "
        f"{liczba_rzedow}"
    )

    for indeks in range(liczba_rzedow):
        rzad = rzedy.nth(indeks)

        try:
            tekst_rzedu = rzad.inner_text(
                timeout=1500
            )

            tekst_normalny = re.sub(
                r"\s+",
                " ",
                tekst_rzedu
            ).strip()

            tekst_maly = tekst_normalny.lower()

            bukmacher = rozpoznaj_bukmachera_z_rzedu_playwright(
                rzad
            )

            if not bukmacher:
                print(
                    f"      [DEBUG BOOKMAKER] "
                    f"Nie rozpoznano bukmachera | "
                    f"wiersz={tekst_normalny!r}"
                )
                continue

            elementy_kursow = rzad.locator(
                '[data-testid="odd-container-default"]'
            )

            if (
                elementy_kursow.count()
                < wymagane_kursy
            ):
                elementy_kursow = rzad.locator(
                    '[data-testid="odd-container"]'
                )

            if (
                elementy_kursow.count()
                < wymagane_kursy
            ):
                elementy_kursow = rzad.locator(
                    "td a"
                )

            print(
                f"      [MAIN CONTAINERS] "
                f"{bukmacher} | "
                f"liczba elementów="
                f"{elementy_kursow.count()}"
            )

            kursy = []

            for indeks_kursu in range(
                elementy_kursow.count()
            ):
                element = elementy_kursow.nth(
                    indeks_kursu
                )

                try:
                    tekst_kursu = element.inner_text(
                        timeout=1000
                    )
                except Exception:
                    continue

                tekst_kursu = tekst_kursu.replace(
                    ",",
                    "."
                )

                dopasowanie = re.search(
                    r"(?<!\d)"
                    r"(\d{1,3}(?:\.\d{1,3})?)"
                    r"(?!\d)",
                    tekst_kursu
                )

                if not dopasowanie:
                    continue

                try:
                    kurs = float(
                        dopasowanie.group(1)
                    )
                except ValueError:
                    continue

                if 1.0 <= kurs <= 1000:
                    kursy.append(kurs)

            print(
                f"      [MAIN ROW] "
                f"{bukmacher} | "
                f"tekst={tekst_normalny!r} | "
                f"kursy={kursy}"
            )

            if len(kursy) >= wymagane_kursy:
                wyniki[bukmacher] = kursy[
                    :wymagane_kursy
                ]

        except Exception as blad:
            print(
                f"      [WARN MAIN ROW] "
                f"Wiersz {indeks + 1}: {blad}"
            )

    print(
        f"      [MAIN RESULT] {wyniki}"
    )

    return wyniki


def liczba_kursow_glownych(nazwa_sportu):
    if nazwa_sportu in {
        "Piłka nożna",
        "Piłka ręczna"
    }:
        return 3

    if nazwa_sportu in {
        "Koszykówka",
        "Tenis",
        "Boks"
    }:
        return 2

    return 0

# PARSER GŁÓWNYCH KURSÓW (1X2 / 12)
def parse_standard_odds(html_content):
    soup = BeautifulSoup(
        html_content,
        "html.parser"
    )

    wyniki = {}

    rzedy = soup.select(
        "table tbody tr"
    )

    for row in rzedy:
        bukmacher = zidentyfikuj_bukmachera(
            row
        )

        if not bukmacher:
            continue

        kursy = pobierz_kursy_z_rzedu(
            row
        )

        if not kursy:
            continue

        if bukmacher not in wyniki:
            wyniki[bukmacher] = kursy

    if wyniki:
        print(
            f"      [DEBUG PARSER] "
            f"Znalezione kursy: {wyniki}"
        )
    else:
        znalezione_nazwy = []

        for element in soup.select(
            '[data-testid="outrights-expanded-bookmaker-name"]'
        ):
            nazwa = element.get_text(
                " ",
                strip=True
            )

            if nazwa:
                znalezione_nazwy.append(nazwa)

        print(
            f"      [DEBUG PARSER] "
            f"Bukmacherzy widoczni w HTML: "
            f"{znalezione_nazwy}"
        )

    return wyniki


def parse_complete_two_way_market(
    html_content,
    market_type
):
    soup = BeautifulSoup(
        html_content,
        "html.parser"
    )

    wyniki = {}

    for tabela in soup.select("table"):
        naglowek_element = tabela.select_one(
            "thead"
        )

        if naglowek_element is None:
            continue

        naglowek = re.sub(
            r"\s+",
            " ",
            naglowek_element.get_text(
                " ",
                strip=True
            )
        ).strip().lower()

        if market_type == "over_under":
            poprawna_tabela = (
                "over" in naglowek
                and "under" in naglowek
                and (
                    "total" in naglowek
                    or "over/under" in naglowek
                )
            )

        elif market_type == "handicap":
            poprawna_tabela = (
                "handicap" in naglowek
                and "over" not in naglowek
                and "under" not in naglowek
            )

        else:
            poprawna_tabela = False

        if not poprawna_tabela:
            continue

        for row in tabela.select("tbody tr"):
            bukmacher = zidentyfikuj_bukmachera(
                row
            )

            if not bukmacher:
                continue

            komorki = row.find_all(
                "td",
                recursive=False
            )

            if len(komorki) < 3:
                continue

            wartosci_komorek = []

            for komorka in komorki:
                tekst = re.sub(
                    r"\s+",
                    " ",
                    komorka.get_text(
                        " ",
                        strip=True
                    )
                ).strip()

                wartosci_komorek.append(
                    tekst
                )

            znalezione_kursy = []

            for tekst in wartosci_komorek[1:]:
                tekst = tekst.replace(
                    ",",
                    "."
                ).strip()

                # Pusta kolumna albo brak kursu.
                if tekst in {
                    "",
                    "-",
                    "–",
                    "—"
                }:
                    znalezione_kursy.append(
                        None
                    )
                    continue

                # Pomijamy payout.
                if "%" in tekst:
                    continue

                # Pomijamy wartość linii, np.:
                # +6.5, -7.5, 168.5.
                if re.fullmatch(
                    r"[+-]?\d+(?:\.\d+)?",
                    tekst
                ):
                    wartosc_numeryczna = float(
                        tekst
                    )

                    # Typowe kursy muszą wynosić
                    # przynajmniej 1.0.
                    # Sama linia może być ujemna albo
                    # być dużą wartością, np. 168.5.
                    if (
                        tekst.startswith(("+", "-"))
                        or wartosc_numeryczna > 100
                    ):
                        continue

                dopasowanie = re.search(
                    r"(?<!\d)"
                    r"(\d{1,3}(?:\.\d{1,3})?)"
                    r"(?!\d)",
                    tekst
                )

                if not dopasowanie:
                    continue

                try:
                    kurs = float(
                        dopasowanie.group(1)
                    )
                except ValueError:
                    continue

                if 1.0 <= kurs <= 1000:
                    znalezione_kursy.append(
                        kurs
                    )

            # Usuwamy elementy przed pierwszym faktycznym
            # kursem, ale zachowujemy None pomiędzy kursami.
            while (
                znalezione_kursy
                and znalezione_kursy[0] is None
            ):
                znalezione_kursy.pop(0)

            if len(znalezione_kursy) < 2:
                print(
                    f"      [SKIP COMPLETE MARKET] "
                    f"{bukmacher}: za mało kursów "
                    f"{znalezione_kursy}"
                )
                continue

            kurs_pierwszy = (
                znalezione_kursy[0]
            )

            kurs_drugi = (
                znalezione_kursy[1]
            )

            # Najważniejsze zabezpieczenie:
            # oba kursy muszą rzeczywiście istnieć.
            if (
                kurs_pierwszy is None
                or kurs_drugi is None
            ):
                print(
                    f"      [SKIP COMPLETE MARKET] "
                    f"{bukmacher}: rynek niepełny, "
                    f"kursy={znalezione_kursy}"
                )
                continue

            wyniki[bukmacher] = [
                kurs_pierwszy,
                kurs_drugi
            ]

    return wyniki

def parse_main_market_odds(
    html_content,
    nazwa_sportu
):
    soup = BeautifulSoup(
        html_content,
        "html.parser"
    )

    wybrana_tabela = None

    for tabela in soup.select("table"):
        thead = tabela.select_one("thead")

        if thead is None:
            continue

        naglowek = re.sub(
            r"\s+",
            " ",
            thead.get_text(
                " ",
                strip=True
            )
        ).strip().lower()

        print(
            f"      [DEBUG MAIN TABLE] "
            f"Nagłówek: {naglowek!r}"
        )

        if nazwa_sportu in {
            "Piłka nożna",
            "Piłka ręczna"
        }:

            # Oczekiwany układ:
            # Bookmakers | 1 | X | 2 | Payout
            ma_1 = bool(
                re.search(
                    r"(^|\s)1(\s|$)",
                    naglowek
                )
            )

            ma_x = bool(
                re.search(
                    r"(^|\s)x(\s|$)",
                    naglowek
                )
            )

            ma_2 = bool(
                re.search(
                    r"(^|\s)2(\s|$)",
                    naglowek
                )
            )

            if (
                ma_1
                and ma_x
                and ma_2
                and "over" not in naglowek
                and "under" not in naglowek
                and "handicap" not in naglowek
            ):
                wybrana_tabela = tabela
                break

        elif nazwa_sportu in {
            "Koszykówka",
            "Tenis",
            "Boks"
        }:
            # Home/Away zawiera dwie kolumny wynikowe.
            # Odrzucamy O/U i handicap.
            if (
                "over" not in naglowek
                and "under" not in naglowek
                and "handicap" not in naglowek
                and "payout" in naglowek
            ):
                komorki = tabela.select(
                    "thead th, thead td"
                )

                teksty = [
                    re.sub(
                        r"\s+",
                        " ",
                        komorka.get_text(
                            " ",
                            strip=True
                        )
                    ).strip().lower()
                    for komorka in komorki
                ]

                if len(teksty) >= 4:
                    wybrana_tabela = tabela
                    break

    if wybrana_tabela is None:
        print(
            "      [WARN MAIN TABLE] "
            "Nie znaleziono właściwej tabeli "
            "rynku głównego."
        )
        return {}

    wyniki = {}

    for row in wybrana_tabela.select(
        "tbody tr"
    ):
        bukmacher = zidentyfikuj_bukmachera(
            row
        )

        if not bukmacher:
            continue

        kursy = pobierz_kursy_z_rzedu(
            row
        )

        wymagane = liczba_kursow_glownych(
            nazwa_sportu
        )

        if len(kursy) < wymagane:
            print(
                f"      [WARN MAIN TABLE] "
                f"{bukmacher}: znaleziono "
                f"{kursy}, oczekiwano "
                f"{wymagane} kursów."
            )
            continue

        wyniki[bukmacher] = kursy[
            :wymagane
        ]

    print(
        f"      [DEBUG MAIN TABLE] "
        f"Wyniki: {wyniki}"
    )

    return wyniki


# HELPER DO KLIKANIA ZAKŁADEK
def wejdz_w_zakladke(page_obj, tab_name):
    mozliwe_nazwy = {
        "1X2": [
            "1X2"
        ],
        "Home/Away": [
            "Home/Away",
            "Home / Away",
            "Moneyline",
            "12"
        ],
        "Both Teams to Score": [
            "Both Teams to Score",
            "BTTS",
            "Obie drużyny strzelą"
        ],
        "Double Chance": [
            "Double Chance",
            "Podwójna szansa",
            "Podwojna szansa"
        ],
        "Over/Under": [
            "Over/Under",
            "Totals",
            "Powyżej/Poniżej",
            "Powyżej / Poniżej"
        ],
        "Asian Handicap": [
            "Asian Handicap",
            "Handicap",
            "Handicap azjatycki",
            "Games Handicap",
            "Game Handicap"
        ]
    }

    nazwy = mozliwe_nazwy.get(
        tab_name,
        [tab_name]
    )

    def kliknij_pierwszy_widoczny(
        locator,
        opis
    ):
        try:
            liczba = locator.count()
        except Exception:
            liczba = 0

        for indeks in range(liczba):
            try:
                element = locator.nth(indeks)

                if not element.is_visible():
                    continue

                obsluz_baner_cookies(
                    page_obj
                )

                element.scroll_into_view_if_needed()

                try:
                    element.click(
                        timeout=5000
                    )
                except Exception as blad:
                    tekst_bledu = str(
                        blad
                    ).lower()

                    if (
                        "onetrust" in tekst_bledu
                        or "intercepts pointer events" in tekst_bledu
                    ):
                        obsluz_baner_cookies(
                            page_obj
                        )

                    element.click(
                        timeout=5000,
                        force=True
                    )

                page_obj.wait_for_timeout(2500)

                print(
                    f"      [INFO] Kliknięto: {opis}"
                )

                return True

            except Exception as blad:
                print(
                    f"      [DEBUG TAB] Nie udało się "
                    f"kliknąć {opis!r}: {blad}"
                )

        return False

    # Najpierw szukamy rynku widocznego bez rozwijania menu.
    for nazwa in nazwy:
        locator = page_obj.locator(
            '[data-testid="sports-nav"] button'
        ).filter(
            has_text=re.compile(
                rf"^\s*{re.escape(nazwa)}\s*$",
                re.IGNORECASE
            )
        )

        if kliknij_pierwszy_widoczny(
            locator,
            nazwa
        ):
            return True

    # Jeżeli rynku nie ma, otwieramy menu Więcej lub More.
    for nazwa_menu in ["Więcej", "More"]:
        locator_menu = page_obj.get_by_text(
            nazwa_menu,
            exact=True
        )

        if not kliknij_pierwszy_widoczny(
            locator_menu,
            nazwa_menu
        ):
            continue

        page_obj.wait_for_timeout(750)

        # Po rozwinięciu ponownie szukamy rynku.
        for nazwa in nazwy:
            locator = page_obj.get_by_text(
                nazwa,
                exact=True
            )

            if kliknij_pierwszy_widoczny(
                locator,
                nazwa
            ):
                return True

    print(
        f"      [INFO] Nie znaleziono zakładki: "
        f"{tab_name}"
    )

    return False


def pobierz_aktywny_rynek(page_obj):
    try:
        aktywny = page_obj.locator(
            '[data-testid="sports-nav-active-tab"]'
        ).first

        if aktywny.count() == 0:
            return ""

        return aktywny.inner_text(
            timeout=2000
        ).strip()

    except Exception:
        return ""
    
def pobierz_glowny_rynek(
    page_obj,
    nazwa_sportu
):
    try:
        if nazwa_sportu in {
            "Koszykówka",
            "Tenis",
            "Boks"
        }:
            nazwa_rynku = "Home/Away"

            dozwolone_rynki = {
                "home/away",
                "home-away",
                "moneyline",
                "12"
            }

            wymagane_kursy = 2

        elif nazwa_sportu in {
            "Piłka nożna",
            "Piłka ręczna"
        }:
            nazwa_rynku = "1X2"

            dozwolone_rynki = {
                "1x2"
            }

            wymagane_kursy = 3

        else:
            print(
                f"      [WARN GŁÓWNY] "
                f"Nieobsługiwany sport: "
                f"{nazwa_sportu!r}"
            )
            return {}

        # Maksymalnie dwie próby:
        # pierwsza standardowa i jedna ponowna.
        for numer_proby in range(1, 3):
            aktywny_przed = pobierz_aktywny_rynek(
                page_obj
            )

            print(
                f"      [DEBUG GŁÓWNY] "
                f"Próba {numer_proby}/2 | "
                f"rynek przed przełączeniem: "
                f"{aktywny_przed!r}"
            )

            kliknieto = wejdz_w_zakladke(
                page_obj,
                nazwa_rynku
            )

            if not kliknieto:
                print(
                    f"      [WARN GŁÓWNY] "
                    f"Nie udało się kliknąć rynku "
                    f"{nazwa_rynku!r}."
                )

                if numer_proby < 2:
                    page_obj.wait_for_timeout(1500)
                    continue

                return {}

            aktywny_po = pobierz_aktywny_rynek(
                page_obj
            )

            aktywny_normalized = re.sub(
                r"\s+",
                "",
                aktywny_po.lower()
            )

            print(
                f"      [DEBUG GŁÓWNY] "
                f"Rynek po przełączeniu: "
                f"{aktywny_po!r}"
            )

            if aktywny_normalized not in dozwolone_rynki:
                print(
                    f"      [WARN GŁÓWNY] "
                    f"Aktywny jest niewłaściwy "
                    f"rynek: {aktywny_po!r}"
                )

                if numer_proby < 2:
                    page_obj.wait_for_timeout(1500)
                    continue

                return {}

            tabela_ok, powod = czekaj_na_glowny_rynek(
                page_obj,
                nazwa_sportu,
                timeout_ms=15000
            )

            if not tabela_ok:
                print(
                    f"      [WARN GŁÓWNY] "
                    f"Nie załadowano właściwej "
                    f"tabeli {nazwa_rynku}. "
                    f"Powód: {powod}"
                )

                if numer_proby < 2:
                    page_obj.wait_for_timeout(1500)
                    continue

                return {}

            wyniki = pobierz_kursy_glowne_playwright(
                page_obj,
                nazwa_sportu
            )

            poprawne_wyniki = {}

            for bukmacher, kursy in wyniki.items():
                if len(kursy) < wymagane_kursy:
                    print(
                        f"      [WARN GŁÓWNY] "
                        f"{bukmacher} ma za mało "
                        f"kursów dla rynku "
                        f"{nazwa_rynku}: {kursy}"
                    )
                    continue

                poprawne_wyniki[bukmacher] = kursy[
                    :wymagane_kursy
                ]

            if poprawne_wyniki:
                print(
                    f"      [DEBUG GŁÓWNY] "
                    f"{nazwa_rynku}: "
                    f"{poprawne_wyniki}"
                )
                return poprawne_wyniki

            print(
                f"      [WARN GŁÓWNY] Próba "
                f"{numer_proby}/2 nie zwróciła "
                f"kursów {nazwa_rynku}."
            )

            if numer_proby < 2:
                page_obj.wait_for_timeout(1500)

        return {}

    except Exception as blad:
        print(
            f"      [WARN GŁÓWNY] Błąd "
            f"pobierania rynku: {blad}"
        )
        return {}

def obsluz_baner_cookies(page_obj):
    przyciski = [
        "#onetrust-reject-all-handler",
        "#onetrust-accept-btn-handler",
        ".onetrust-close-btn-handler",
        "#onetrust-pc-btn-handler"
    ]

    for selektor in przyciski:
        try:
            przycisk = page_obj.locator(
                selektor
            ).first

            if (
                przycisk.count() > 0
                and przycisk.is_visible()
            ):
                przycisk.click(
                    timeout=3000,
                    force=True
                )

                page_obj.wait_for_timeout(500)

                print(
                    f"      [COOKIES] "
                    f"Zamknięto OneTrust: "
                    f"{selektor}"
                )

                return True

        except Exception:
            continue

    # Awaryjnie usuwamy nakładkę,
    # jeżeli przycisk nie jest dostępny.
    try:
        usunieto = page_obj.evaluate(
            """
            () => {
                const selektory = [
                    "#onetrust-consent-sdk",
                    ".onetrust-pc-dark-filter",
                    "#onetrust-banner-sdk"
                ];

                let liczba = 0;

                for (const selektor of selektory) {
                    const elementy = document.querySelectorAll(
                        selektor
                    );

                    for (const element of elementy) {
                        element.remove();
                        liczba++;
                    }
                }

                if (document.body) {
                    document.body.style.overflow = "auto";
                    document.body.style.pointerEvents = "auto";
                }

                if (document.documentElement) {
                    document.documentElement.style.overflow = "auto";
                }

                return liczba;
            }
            """
        )

        if usunieto > 0:
            print(
                f"      [COOKIES] "
                f"Awaryjnie usunięto "
                f"{usunieto} elementów OneTrust."
            )

            page_obj.wait_for_timeout(300)

            return True

    except Exception as blad:
        print(
            f"      [DEBUG COOKIES] "
            f"Nie udało się usunąć banera: "
            f"{blad}"
        )

    return False


def bezpieczne_klikniecie(
    page_obj,
    element,
    timeout_ms=5000
):
    obsluz_baner_cookies(page_obj)

    try:
        element.scroll_into_view_if_needed(
            timeout=3000
        )

        element.click(
            timeout=timeout_ms
        )

        return True

    except Exception as pierwszy_blad:
        tekst_bledu = str(
            pierwszy_blad
        ).lower()

        baner_blokuje = (
            "onetrust" in tekst_bledu
            or "intercepts pointer events" in tekst_bledu
        )

        if baner_blokuje:
            obsluz_baner_cookies(
                page_obj
            )

        try:
            # force=True omija element,
            # który zasłania właściwy cel.
            element.click(
                timeout=timeout_ms,
                force=True
            )

            print(
                "      [CLICK] "
                "Użyto kliknięcia wymuszonego."
            )

            return True

        except Exception:
            pass

        try:
            # Ostatnia metoda: kliknięcie
            # bezpośrednio przez JavaScript.
            element.evaluate(
                """
                element => element.click()
                """
            )

            print(
                "      [CLICK] "
                "Użyto kliknięcia JavaScript."
            )

            return True

        except Exception as drugi_blad:
            print(
                f"      [WARN CLICK] "
                f"Nie udało się kliknąć: "
                f"{drugi_blad}"
            )

            return False

def pobierz_over_under(
    page_obj,
    get_match_data
):
    zapisane_linie = 0

    try:
        tabela_ou = None

        tabele = page_obj.locator("table")
        liczba_tabel = tabele.count()

        for indeks in range(liczba_tabel):
            tabela = tabele.nth(indeks)

            try:
                naglowek = tabela.locator(
                    "thead"
                ).inner_text(
                    timeout=1500
                ).strip().lower()
            except Exception:
                continue

            if (
                "over" in naglowek
                and "under" in naglowek
                and (
                    "handicap" in naglowek
                    or "total" in naglowek
                    or "over/under" in naglowek
                )
            ):
                tabela_ou = tabela
                break

        if tabela_ou is None:
            print(
                "      [WARN O/U] Nie znaleziono "
                "tabeli Over/Under."
            )
            return 0

        print(
            "      [DEBUG O/U] Znaleziono tabelę "
            "Over/Under."
        )

        # Najpierw zbieramy same wartości linii.
        znalezione_linie = []

        rzedy = tabela_ou.locator(
            "tbody > tr"
        )

        liczba_rzedow = rzedy.count()

        for indeks in range(liczba_rzedow):
            try:
                tekst_rzedu = rzedy.nth(
                    indeks
                ).inner_text(
                    timeout=1000
                )

                dopasowanie = re.search(
                    r"(?:Over/Under|O/U)\s*"
                    r"\+?(\d+(?:[.,]\d+)?)",
                    tekst_rzedu,
                    re.IGNORECASE
                )

                if not dopasowanie:
                    continue

                wartosc = dopasowanie.group(
                    1
                ).replace(",", ".")

                # Dla piłki nożnej i koszykówki
                # zapisujemy wyłącznie linie połówkowe.
                if not wartosc.endswith(".5"):
                    continue

                if wartosc not in znalezione_linie:
                    znalezione_linie.append(
                        wartosc
                    )

            except Exception:
                continue

        print(
            f"      [DEBUG O/U] Linie .5: "
            f"{znalezione_linie}"
        )

        for wartosc_linii in znalezione_linie:
            try:
                # Po każdym kliknięciu React może
                # przebudować tabelę, dlatego
                # ponownie wyszukujemy jej elementy.
                tabela_ou = None
                tabele = page_obj.locator("table")

                for indeks in range(
                    tabele.count()
                ):
                    kandydat = tabele.nth(
                        indeks
                    )

                    try:
                        naglowek = kandydat.locator(
                            "thead"
                        ).inner_text(
                            timeout=1000
                        ).strip().lower()
                    except Exception:
                        continue

                    if (
                        "over" in naglowek
                        and "under" in naglowek
                        and (
                            "handicap" in naglowek
                            or "total" in naglowek
                            or "over/under" in naglowek
                        )
                    ):
                        tabela_ou = kandydat
                        break

                if tabela_ou is None:
                    print(
                        "      [WARN O/U] Tabela "
                        "zniknęła podczas parsowania."
                    )
                    break

                rzedy = tabela_ou.locator(
                    "tbody > tr"
                )

                znaleziony_rzad = None

                for indeks in range(
                    rzedy.count()
                ):
                    rzad = rzedy.nth(indeks)

                    try:
                        tekst_rzedu = rzad.inner_text(
                            timeout=1000
                        )
                    except Exception:
                        continue

                    dopasowanie = re.search(
                        r"(?:Over/Under|O/U)\s*"
                        r"\+?(\d+(?:[.,]\d+)?)",
                        tekst_rzedu,
                        re.IGNORECASE
                    )

                    if not dopasowanie:
                        continue

                    wartosc_rzedu = (
                        dopasowanie.group(1)
                        .replace(",", ".")
                    )

                    if wartosc_rzedu == wartosc_linii:
                        znaleziony_rzad = rzad
                        break

                if znaleziony_rzad is None:
                    print(
                        f"      [WARN O/U] Nie znaleziono "
                        f"wiersza {wartosc_linii}."
                    )
                    continue

                pierwsza_komorka = (
                    znaleziony_rzad.locator(
                        "td"
                    ).first
                )

                if not bezpieczne_klikniecie(
                    page_obj,
                    pierwsza_komorka,
                    timeout_ms=5000
                ):
                    print(
                        f"      [WARN O/U] "
                        f"Nie udało się rozwinąć "
                        f"linii {wartosc_linii}."
                    )
                    continue

                page_obj.wait_for_timeout(1800)

                aktywny_rynek = pobierz_aktywny_rynek(
                    page_obj
                )

                aktywny_ou = re.sub(
                    r"\s+",
                    "",
                    aktywny_rynek.lower()
                )

                if aktywny_ou not in {
                    "over/under",
                    "totals",
                    "powyżej/poniżej"
                }:
                    print(
                        f"      [WARN O/U] Rynek zmienił "
                        f"się przy linii "
                        f"{wartosc_linii}: "
                        f"{aktywny_rynek!r}"
                    )
                    continue

                wyniki_linii = (
                    parse_complete_two_way_market(
                        page_obj.content(),
                        "over_under"
                    )
                )

                print(
                    f"      [DEBUG O/U {wartosc_linii}] "
                    f"{wyniki_linii}"
                )

                klucz_linii = f"+{wartosc_linii}"

                znaleziono_bukmachera = False

                for bukmacher, kursy in (
                    wyniki_linii.items()
                ):
                    if len(kursy) < 2:
                        continue

                    kurs_over = kursy[0]
                    kurs_under = kursy[1]

                    if (
                        not isinstance(
                            kurs_over,
                            (int, float)
                        )
                        or not isinstance(
                            kurs_under,
                            (int, float)
                        )
                        or kurs_over <= 0
                        or kurs_under <= 0
                    ):
                        print(
                            f"      [SKIP O/U] "
                            f"{bukmacher}: niepełne kursy "
                            f"{kursy}"
                        )
                        continue

                    dane = get_match_data(
                        bukmacher
                    )

                    dane["over_under"][
                        klucz_linii
                    ] = {
                        "over": str(kurs_over),
                        "under": str(kurs_under)
                    }

                    znaleziono_bukmachera = True

                    print(
                        f"      [O/U] "
                        f"{bukmacher:<8} | "
                        f"linia {klucz_linii} | "
                        f"over={kurs_over} | "
                        f"under={kurs_under}"
                    )

                if znaleziono_bukmachera:
                    zapisane_linie += 1

                # Zamykamy rozwinięty wiersz,
                # zanim przejdziemy do następnego.
                try:
                    obsluz_baner_cookies(
                        page_obj
                    )

                    pierwsza_komorka.click(
                        timeout=3000,
                        force=True
                    )

                    page_obj.wait_for_timeout(
                        600
                    )

                except Exception:
                    try:
                        pierwsza_komorka.evaluate(
                            """
                            element => element.click()
                            """
                        )

                        page_obj.wait_for_timeout(
                            600
                        )

                    except Exception:
                        pass

            except Exception as blad:
                print(
                    f"      [WARN O/U] Problem z "
                    f"linią {wartosc_linii}: "
                    f"{blad}"
                )

        print(
            f"      [DEBUG O/U] Zapisano dane "
            f"dla {zapisane_linie} linii."
        )

        return zapisane_linie

    except Exception as blad:
        print(
            f"      [WARN O/U] Błąd parsera: "
            f"{blad}"
        )
        return 0

def pobierz_asian_handicap(
    page_obj,
    get_match_data
):
    zapisane_linie = 0

    try:
        tabela_hc = None

        tabele = page_obj.locator("table")

        for indeks in range(tabele.count()):
            kandydat = tabele.nth(indeks)

            try:
                naglowek = kandydat.locator(
                    "thead"
                ).inner_text(
                    timeout=1500
                ).strip().lower()
            except Exception:
                continue

            # Tabela Asian Handicap ma kolumny:
            # Handicap | 1 | 2 | Payout
            if (
                "handicap" in naglowek
                and "payout" in naglowek
                and "over" not in naglowek
                and "under" not in naglowek
            ):
                tabela_hc = kandydat
                break

        if tabela_hc is None:
            print(
                "      [WARN HC] Nie znaleziono "
                "tabeli Asian Handicap."
            )
            return 0

        print(
            "      [DEBUG HC] Znaleziono tabelę "
            "Asian Handicap."
        )

        znalezione_linie = []

        rzedy = tabela_hc.locator(
            "tbody > tr"
        )

        for indeks in range(rzedy.count()):
            try:
                tekst_rzedu = rzedy.nth(
                    indeks
                ).inner_text(
                    timeout=1000
                )

                dopasowanie = re.search(
                    r"(?:Asian Handicap|Games? Handicap|Handicap|AH)\s*"
                    r"([+-]?\d+(?:[.,]\d+)?)",
                    tekst_rzedu,
                    re.IGNORECASE
                )

                if not dopasowanie:
                    continue

                wartosc = dopasowanie.group(
                    1
                ).replace(",", ".")

                if wartosc not in znalezione_linie:
                    znalezione_linie.append(
                        wartosc
                    )

            except Exception:
                continue

        print(
            f"      [DEBUG HC] Linie: "
            f"{znalezione_linie}"
        )

        for wartosc_linii in znalezione_linie:
            try:
                # React może przebudować tabelę,
                # dlatego odnajdujemy ją ponownie.
                tabela_hc = None
                tabele = page_obj.locator("table")

                for indeks in range(
                    tabele.count()
                ):
                    kandydat = tabele.nth(
                        indeks
                    )

                    try:
                        naglowek = kandydat.locator(
                            "thead"
                        ).inner_text(
                            timeout=1000
                        ).strip().lower()
                    except Exception:
                        continue

                    if (
                        "handicap" in naglowek
                        and "payout" in naglowek
                        and "over" not in naglowek
                        and "under" not in naglowek
                    ):
                        tabela_hc = kandydat
                        break

                if tabela_hc is None:
                    print(
                        "      [WARN HC] Tabela "
                        "zniknęła podczas parsowania."
                    )
                    break

                rzedy = tabela_hc.locator(
                    "tbody > tr"
                )

                znaleziony_rzad = None

                for indeks in range(
                    rzedy.count()
                ):
                    rzad = rzedy.nth(indeks)

                    try:
                        tekst_rzedu = rzad.inner_text(
                            timeout=1000
                        )
                    except Exception:
                        continue

                    dopasowanie = re.search(
                        r"(?:Asian Handicap|Games? Handicap|Handicap|AH)\s*"
                        r"([+-]?\d+(?:[.,]\d+)?)",
                        tekst_rzedu,
                        re.IGNORECASE
                    )

                    if not dopasowanie:
                        continue

                    wartosc_rzedu = (
                        dopasowanie.group(1)
                        .replace(",", ".")
                    )

                    if wartosc_rzedu == wartosc_linii:
                        znaleziony_rzad = rzad
                        break

                if znaleziony_rzad is None:
                    print(
                        f"      [WARN HC] Nie znaleziono "
                        f"wiersza {wartosc_linii}."
                    )
                    continue

                pierwsza_komorka = (
                    znaleziony_rzad.locator(
                        "td"
                    ).first
                )

                if not bezpieczne_klikniecie(
                    page_obj,
                    pierwsza_komorka,
                    timeout_ms=5000
                ):
                    print(
                        f"      [WARN HC] "
                        f"Nie udało się rozwinąć "
                        f"linii {wartosc_linii}."
                    )
                    continue

                page_obj.wait_for_timeout(1800)

                aktywny_rynek = pobierz_aktywny_rynek(
                    page_obj
                )

                if aktywny_rynek.lower() not in {
                    "asian handicap",
                    "handicap",
                    "handicap azjatycki",
                    "games handicap",
                    "game handicap"
                }:
                    print(
                        f"      [WARN HC] Rynek zmienił "
                        f"się przy linii "
                        f"{wartosc_linii}: "
                        f"{aktywny_rynek!r}"
                    )
                    continue

                wyniki_linii = (
                    parse_complete_two_way_market(
                        page_obj.content(),
                        "handicap"
                    )
                )
                print(
                    f"      [DEBUG HC "
                    f"{wartosc_linii}] "
                    f"{wyniki_linii}"
                )

                klucz_linii = wartosc_linii

                if (
                    not klucz_linii.startswith("+")
                    and not klucz_linii.startswith("-")
                ):
                    klucz_linii = (
                        f"+{klucz_linii}"
                    )

                znaleziono_bukmachera = False

                for bukmacher, kursy in (
                    wyniki_linii.items()
                ):
                    if len(kursy) < 2:
                        continue

                    kurs_1 = kursy[0]
                    kurs_2 = kursy[1]

                    if (
                        kurs_1 <= 0
                        or kurs_2 <= 0
                    ):
                        continue

                    dane = get_match_data(
                        bukmacher
                    )

                    dane["handicap"][
                        klucz_linii
                    ] = {
                        "1": str(kurs_1),
                        "2": str(kurs_2)
                    }

                    znaleziono_bukmachera = True

                    print(
                        f"      [HC] "
                        f"{bukmacher:<8} | "
                        f"linia {klucz_linii} | "
                        f"1={kurs_1} | "
                        f"2={kurs_2}"
                    )

                if znaleziono_bukmachera:
                    zapisane_linie += 1

                # Zamykamy rozwinięty wiersz.
                try:
                    obsluz_baner_cookies(
                        page_obj
                    )

                    pierwsza_komorka.click(
                        timeout=3000,
                        force=True
                    )

                    page_obj.wait_for_timeout(
                        600
                    )

                except Exception:
                    try:
                        pierwsza_komorka.evaluate(
                            """
                            element => element.click()
                            """
                        )

                        page_obj.wait_for_timeout(
                            600
                        )

                    except Exception:
                        pass

            except Exception as blad:
                print(
                    f"      [WARN HC] Problem z "
                    f"linią {wartosc_linii}: "
                    f"{blad}"
                )

        print(
            f"      [DEBUG HC] Zapisano dane "
            f"dla {zapisane_linie} linii."
        )

        return zapisane_linie

    except Exception as blad:
        print(
            f"      [WARN HC] Błąd parsera: "
            f"{blad}"
        )
        return 0

# HELPER DO BEZPIECZNEGO ROZWIJANIA WSZYSTKICH ZAKŁADEK (O/U, Handicap)
def rozwin_ukryte_linie(page_obj, nazwa_rynku):
    try:
        wynik = page_obj.evaluate(
            """
            (nazwaRynku) => {
                let klikniete = 0;

                const tabele = Array.from(
                    document.querySelectorAll("table")
                );

                for (const tabela of tabele) {
                    const naglowek = (
                        tabela.querySelector("thead")?.innerText || ""
                    ).trim().toLowerCase();

                    const jestTabelaOverUnder =
                        nazwaRynku === "Over/Under" &&
                        naglowek.includes("total") &&
                        naglowek.includes("over") &&
                        naglowek.includes("under");

                    const jestTabelaHandicap =
                        nazwaRynku === "Asian Handicap" &&
                        naglowek.includes("handicap");

                    if (
                        !jestTabelaOverUnder &&
                        !jestTabelaHandicap
                    ) {
                        continue;
                    }

                    const rzedy = Array.from(
                        tabela.querySelectorAll("tbody > tr")
                    );

                    for (const rzad of rzedy) {
                        const tekst = (
                            rzad.innerText || ""
                        ).trim();

                        if (!tekst) {
                            continue;
                        }

                        const pierwszyElement = rzad.querySelector(
                            "td:first-child"
                        );

                        if (!pierwszyElement) {
                            continue;
                        }

                        try {
                            pierwszyElement.click();
                            klikniete++;
                        } catch (error) {
                            // Pomijamy wiersz bez możliwości kliknięcia.
                        }
                    }
                }

                return klikniete;
            }
            """,
            nazwa_rynku
        )

        print(
            f"      [~] Kliknięto {wynik} "
            f"wierszy rynku {nazwa_rynku}."
        )

        if wynik > 0:
            page_obj.wait_for_timeout(2500)

        return wynik

    except Exception as blad:
        print(
            f"      [WARN] Nie udało się rozwinąć "
            f"linii {nazwa_rynku}: {blad}"
        )
        return 0




def bezpieczne_goto(page_obj, url, timeout_ms=30000):
    try:
        odpowiedz = page_obj.goto(
            url,
            wait_until="commit",
            timeout=timeout_ms
        )

        try:
            page_obj.wait_for_load_state(
                "domcontentloaded",
                timeout=10000
            )
        except PlaywrightTimeoutError:
            pass

        return True, odpowiedz, None

    except PlaywrightTimeoutError as blad:
        aktualny_url = page_obj.url

        if (
            aktualny_url
            and aktualny_url != "about:blank"
            and not aktualny_url.startswith("chrome-error://")
        ):
            return True, None, blad

        return False, None, blad

    except Exception as blad:
        return False, None, blad


def pobierz_widoczny_rynek_playwright(
    page_obj,
    wymagane_kursy,
    nazwa_rynku
):
    najlepsze_wyniki = {}
    najlepszy_naglowek = ""

    tabele = page_obj.locator("table")

    try:
        liczba_tabel = tabele.count()
    except Exception:
        liczba_tabel = 0

    for indeks_tabeli in range(liczba_tabel):
        tabela = tabele.nth(indeks_tabeli)

        try:
            if not tabela.is_visible():
                continue

            try:
                naglowek = tabela.locator(
                    "thead"
                ).inner_text(
                    timeout=1000
                )
            except Exception:
                naglowek = ""

            naglowek = re.sub(
                r"\s+",
                " ",
                naglowek
            ).strip()

            rzedy = tabela.locator(
                "tbody tr"
            )

            wyniki_tabeli = {}

            for indeks_rzedu in range(
                rzedy.count()
            ):
                rzad = rzedy.nth(
                    indeks_rzedu
                )

                try:
                    if not rzad.is_visible():
                        continue

                    bukmacher = (
                        rozpoznaj_bukmachera_z_rzedu_playwright(
                            rzad
                        )
                    )

                    if not bukmacher:
                        continue

                    locatory_kursow = rzad.locator(
                        '[data-testid="odd-container-default"]'
                    )

                    if (
                        locatory_kursow.count()
                        < wymagane_kursy
                    ):
                        locatory_kursow = rzad.locator(
                            '[data-testid="odd-container"]'
                        )

                    if (
                        locatory_kursow.count()
                        < wymagane_kursy
                    ):
                        locatory_kursow = rzad.locator(
                            "td a"
                        )

                    kursy = []

                    for indeks_kursu in range(
                        locatory_kursow.count()
                    ):
                        element = locatory_kursow.nth(
                            indeks_kursu
                        )

                        try:
                            tekst = element.inner_text(
                                timeout=1000
                            )
                        except Exception:
                            continue

                        tekst = tekst.replace(
                            ",",
                            "."
                        )

                        dopasowanie = re.search(
                            r"(?<!\d)"
                            r"(\d{1,3}(?:\.\d{1,3})?)"
                            r"(?!\d)",
                            tekst
                        )

                        if not dopasowanie:
                            continue

                        try:
                            kurs = float(
                                dopasowanie.group(1)
                            )
                        except ValueError:
                            continue

                        if 1.0 <= kurs <= 1000:
                            kursy.append(
                                kurs
                            )

                    if len(kursy) < wymagane_kursy:
                        print(
                            f"      [DEBUG {nazwa_rynku}] "
                            f"{bukmacher}: za mało kursów "
                            f"{kursy}"
                        )
                        continue

                    wyniki_tabeli[bukmacher] = kursy[
                        :wymagane_kursy
                    ]

                    print(
                        f"      [DEBUG {nazwa_rynku} ROW] "
                        f"{bukmacher} | "
                        f"kursy={kursy[:wymagane_kursy]}"
                    )

                except Exception as blad:
                    print(
                        f"      [DEBUG {nazwa_rynku} ROW] "
                        f"Błąd wiersza "
                        f"{indeks_rzedu + 1}: {blad}"
                    )

            if len(wyniki_tabeli) > len(
                najlepsze_wyniki
            ):
                najlepsze_wyniki = wyniki_tabeli
                najlepszy_naglowek = naglowek

        except Exception as blad:
            print(
                f"      [DEBUG {nazwa_rynku} TABLE] "
                f"Błąd tabeli "
                f"{indeks_tabeli + 1}: {blad}"
            )

    print(
        f"      [DEBUG {nazwa_rynku} RESULT] "
        f"nagłówek={najlepszy_naglowek!r} | "
        f"wyniki={najlepsze_wyniki}"
    )

    return najlepsze_wyniki

def pobierz_polskich_z_oddsportal():
    print("-> [POLSCY BUKMACHERZY - ODDSPORTAL] START (Jutro + Pojutrze)")

    baza_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    output = os.path.join(baza_dir, "data", "polscy_bukmacherzy.json")
    os.makedirs(os.path.dirname(output), exist_ok=True)

    wszystkie_mecze = []
    data_dzis = datetime.now()
    data_jutro_url = (data_dzis + timedelta(days=1)).strftime("%Y%m%d")
    data_jutro_str = (data_dzis + timedelta(days=1)).strftime("%d.%m.%Y")
    data_pojutrze_url = (data_dzis + timedelta(days=2)).strftime("%Y%m%d")
    data_pojutrze_str = (data_dzis + timedelta(days=2)).strftime("%d.%m.%Y")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )

        def loguj_odpowiedz(response):
            adres = response.url.lower()

            if any(fragment in adres for fragment in [
                "ajax-event",
                "event-data",
                "event-data-shell"
            ]):
                print(
                    f"      [AJAX HTTP {response.status}] "
                    f"{response.url}"
                )

        def loguj_request_failed(request):
            adres = request.url.lower()

            if any(fragment in adres for fragment in [
                "ajax-event",
                "event-data",
                "event-data-shell"
            ]):
                print(
                    f"      [REQUEST FAILED] "
                    f"{request.method} {request.url} | "
                    f"{request.failure}"
                )

        def utworz_strone(context_obj):
            nowa_strona = context_obj.new_page()
            nowa_strona.on("response", loguj_odpowiedz)
            nowa_strona.on(
                "requestfailed",
                loguj_request_failed
            )
            return nowa_strona

        page = utworz_strone(context)

        try:
            for nazwa_sportu, sciezka_sportu in SPORTY.items():
                if (
                    TRYB_TESTOWY
                    and SPORT_TESTOWY is not None
                    and nazwa_sportu != SPORT_TESTOWY
                ):
                    continue
                print(f"\n=== ROZPOCZĘTO SKANOWANIE SPORTU: {nazwa_sportu} ===")
                
                strony = {
                    data_jutro_str: (
                        f"{BAZOWY_URL}/matches/"
                        f"{sciezka_sportu}/{data_jutro_url}/"
                    ),
                    data_pojutrze_str: (
                        f"{BAZOWY_URL}/matches/"
                        f"{sciezka_sportu}/{data_pojutrze_url}/"
                    )
                }

                linki_z_danymi = []
                for dzien, url in strony.items():
                    try:
                        if page.is_closed():
                            page = utworz_strone(context)

                        print(f" -> Pobieranie listy spotkań dla dnia: {dzien} | URL: {url}")
                        odpowiedz_listy = page.goto(
                            url,
                            wait_until="domcontentloaded",
                            timeout=30000
                        )

                        page.wait_for_timeout(500)

                        obsluz_baner_cookies(
                            page
                        )

                        if odpowiedz_listy is not None:
                            print(
                                f"    [HTTP {odpowiedz_listy.status}] "
                                f"{odpowiedz_listy.url}"
                            )

                            if odpowiedz_listy.status >= 400:
                                print(
                                    "    [!] Lista spotkań zwróciła "
                                    f"HTTP {odpowiedz_listy.status}."
                                )

                                zapisz_debug_html(
                                    page,
                                    os.path.dirname(output),
                                    f"http_lista_{odpowiedz_listy.status}_"
                                    f"{sciezka_sportu}_{dzien}"
                                )

                                continue

                        page.wait_for_timeout(1500)

                        znalezione_dla_dnia = []

                        poprzednia_liczba = 0
                        liczba_prob_bez_zmiany = 0

                        for proba in range(30):
                            aktualne_linki = pobierz_linki_meczow_z_listy(
                                page_obj=page,
                                sciezka_sportu=sciezka_sportu,
                                dzien=dzien,
                                debug_dir=os.path.dirname(output)
                            )

                            znalezione_dla_dnia.extend(aktualne_linki)

                            # Usuwanie duplikatów w obrębie jednego dnia.
                            znalezione_dict = {}

                            for element in znalezione_dla_dnia:
                                link_meczu, dzien_meczu, godzina_meczu = element
                                klucz = (link_meczu, dzien_meczu)

                                if klucz not in znalezione_dict:
                                    znalezione_dict[klucz] = element
                                elif (
                                    znalezione_dict[klucz][2] == "00:00"
                                    and godzina_meczu != "00:00"
                                ):
                                    znalezione_dict[klucz] = element

                            znalezione_dla_dnia = list(
                                znalezione_dict.values()
                            )

                            aktualna_liczba = len(
                                znalezione_dla_dnia
                            )

                            if aktualna_liczba == poprzednia_liczba:
                                liczba_prob_bez_zmiany += 1
                            else:
                                poprzednia_liczba = aktualna_liczba
                                liczba_prob_bez_zmiany = 0

                            if liczba_prob_bez_zmiany >= 3:
                                print(
                                    f"    [INFO] Lista przestała się "
                                    f"powiększać. Zebrano "
                                    f"{aktualna_liczba} spotkań."
                                )
                                break


                            tekst_strony = pobierz_tekst_strony(page).lower()

                            if (
                                "no matches" in tekst_strony
                                or "brak spotkań" in tekst_strony
                            ):
                                print(
                                    f"    [INFO] Brak spotkań dla dnia {dzien}."
                                )
                                break

                            try:
                                page.mouse.wheel(0, 1000)
                            except Exception:
                                pass

                            page.wait_for_timeout(1000)

                        linki_z_danymi.extend(znalezione_dla_dnia)

                        print(
                            f"    [*] Wykryto {len(znalezione_dla_dnia)} "
                            f"prawidłowych linków do meczów na dzień {dzien}"
                        )

                        for link_meczu, _, godzina_meczu in znalezione_dla_dnia[:5]:
                            print(
                                f"      [URL] {godzina_meczu} | {link_meczu}"
                            )
                                        
                    except Exception as e:
                        print(f"    [!] Błąd podczas parsowania listy głównej: {e}")

                unikalne_dict = {}

                for element in linki_z_danymi:
                    link_meczu, dzien_meczu, godzina_meczu = element
                    klucz = (link_meczu, dzien_meczu)

                    if klucz not in unikalne_dict:
                        unikalne_dict[klucz] = element
                    elif (
                        unikalne_dict[klucz][2] == "00:00"
                        and godzina_meczu != "00:00"
                    ):
                        unikalne_dict[klucz] = element

                unikalne = list(
                    unikalne_dict.values()
                )

                if TRYB_TESTOWY:
                    unikalne = unikalne[
                        :LIMIT_MECZOW_TESTOWYCH
                    ]

                    print(
                        f" [TRYB TESTOWY] Ograniczono "
                        f"liczbę spotkań do "
                        f"{len(unikalne)}."
                    )

                print(f" -> Znaleziono {len(unikalne)} unikalnych meczów dla dyscypliny {nazwa_sportu}. Przechodzę do pobierania kursów...")

                for idx, (link, dzien, godzina) in enumerate(unikalne, start=1):
                    try:
                        if page.is_closed():
                            page = utworz_strone(context)

                        print(f"\n    [{idx}/{len(unikalne)}] Ładowanie szczegółów meczu: {link}")
                        
                        poprawny_link = normalizuj_link_meczu(
                            link,
                            sciezka_sportu
                        )

                        if not poprawny_link:
                            print(
                                "      [!] Link nie przeszedł walidacji. Pomijam."
                            )
                            continue

                        oczekiwany_event_id = (
                            urlparse(poprawny_link)
                            .fragment
                            .strip()
                            .strip("/")
                        )

                        if not oczekiwany_event_id:
                            print(
                                "      [!] Link nie zawiera identyfikatora wydarzenia."
                            )
                            continue

                        nawigacja_ok, odpowiedz_glowna, blad_nawigacji = (
                            bezpieczne_goto(
                                page,
                                poprawny_link,
                                timeout_ms=30000
                            )
                        )

                        if not nawigacja_ok:
                            print(
                                f"      [WARN] Nawigacja nie powiodła się: "
                                f"{blad_nawigacji}"
                            )

                            try:
                                if not page.is_closed():
                                    page.close()
                            except Exception:
                                pass

                            page = utworz_strone(context)
                            page.wait_for_timeout(3000)
                            continue

                        page.wait_for_timeout(500)

                        obsluz_baner_cookies(
                            page
                        )

                        if blad_nawigacji is not None:

                            print(
                                "      [WARN] Nawigacja przekroczyła czas, "
                                "ale dokument został otwarty. "
                                "Sprawdzam zawartość."
                            )

                        if odpowiedz_glowna is not None:
                            print(
                                f"      [HTTP {odpowiedz_glowna.status}] "
                                f"{odpowiedz_glowna.url}"
                            )

                            if odpowiedz_glowna.status >= 400:
                                print(
                                    "      [!] Strona wydarzenia zwróciła "
                                    f"HTTP {odpowiedz_glowna.status}."
                                )

                                try:
                                    if not page.is_closed():
                                        page.close()
                                except Exception:
                                    pass

                                page = utworz_strone(context)
                                page.wait_for_timeout(3000)
                                continue

                        page.wait_for_timeout(1500)

                        print(f"      [FINAL URL] {page.url}")

                        final_parsed = urlparse(page.url)
                        final_path = final_parsed.path.lower()
                        final_event_id = final_parsed.fragment.strip().strip("/")

                        if not final_event_id:
                            final_event_id = oczekiwany_event_id

                        if final_event_id != oczekiwany_event_id:
                            print(
                                f"      [!] Nieprawidłowy event ID. "
                                f"Oczekiwano {oczekiwany_event_id!r}, "
                                f"otrzymano {final_event_id!r}."
                            )

                            continue


                        if "/h2h/" not in final_path:
                            print(
                                "      [!] Strona końcowa nie jest stroną wydarzenia."
                            )

                            zapisz_debug_html(
                                page,
                                os.path.dirname(output),
                                f"nieprawidlowy_url_{sciezka_sportu}_{idx}"
                            )

                            continue

                        if wykryj_blad_oddsportal(page):
                            print(
                                "      [!] OddsPortal zwrócił błąd danych wydarzenia."
                            )

                            zapisz_debug_html(
                                page,
                                os.path.dirname(output),
                                f"ajax_error_{sciezka_sportu}_{idx}"
                            )
                            continue

                        tabela_zaladowana, powod = czekaj_na_tabele_kursow(
                            page,
                            timeout_ms=15000
                        )

                        if not tabela_zaladowana:
                            print(
                                f"      [!] Nie załadowano tabeli kursów. "
                                f"Powód: {powod}"
                            )

                            zapisz_debug_html(
                                page,
                                os.path.dirname(output),
                                f"brak_tabeli_{sciezka_sportu}_{idx}"
                            )

                            continue

                        soup = BeautifulSoup(
                            page.content(),
                            "html.parser"
                        )
                        
                        h1 = soup.find('h1')
                        if not h1:
                            continue
                        
                        title_raw = h1.get_text(
                            " ",
                            strip=True
                        )

                        title_clean = wyczysc_tytul_meczu(
                            title_raw
                        )

                        print(
                            f"      [DEBUG TITLE] "
                            f"raw={title_raw!r} | "
                            f"clean={title_clean!r}"
                        )
                        
                        if " - " in title_clean:
                            home, away = title_clean.split(" - ", 1)
                        else:
                            home, away = title_clean, "Brak"

                        match_data = {}

                        def get_match_data(buk_name):
                            if buk_name not in match_data:
                                match_data[buk_name] = {
                                    "id": (
                                        f"{bezpieczny_id(buk_name)}_"
                                        f"{bezpieczny_id(home)}_"
                                        f"{bezpieczny_id(away)}"
                                    ),
                                    "mecz": f"{home.strip()} - {away.strip()}",
                                    "dyscyplina": nazwa_sportu,
                                    "dzien": dzien,
                                    "godzina": godzina,
                                    "home": home.strip(),
                                    "away": away.strip(),
                                    "bukmacher": buk_name,
                                    "kurs_1": None,
                                    "kurs_X": None,
                                    "kurs_2": None,
                                    "btts": {},
                                    "podwojna_szansa": {},
                                    "over_under": {},
                                    "handicap": {}
                                }
                            return match_data[buk_name]

                        # --- 1. POBIERANIE RYNKU GŁÓWNEGO ---
                        # Koszykówka i tenis: Home/Away
                        # Piłka nożna: 1X2
                        wyniki_glowne = pobierz_glowny_rynek(
                            page,
                            nazwa_sportu
                        )

                        if nazwa_sportu in {
                            "Koszykówka",
                            "Tenis",
                            "Boks"
                        }:
                            zapisz_debug_html(
                                page,
                                os.path.dirname(output),
                                f"{sciezka_sportu}_home_away_{idx}"
                            )

                            print(
                                f"      [DEBUG HOME/AWAY] "
                                f"Sport: {nazwa_sportu} | "
                                f"{wyniki_glowne}"
                            )

                        if not wyniki_glowne:
                            nazwa_glownego_rynku = (
                                "1X2"
                                if nazwa_sportu in {
                                    "Piłka nożna",
                                    "Piłka ręczna"
                                }
                                else "Home/Away"
                            )

                            print(
                                f"      [WARN GŁÓWNY] Nie znaleziono "
                                f"kursów {nazwa_glownego_rynku} "
                                f"dla obsługiwanych bukmacherów."
                            )

                            zapisz_debug_html(
                                page,
                                os.path.dirname(output),
                                f"glowny_rynek_empty_"
                                f"{sciezka_sportu}_{idx}"
                            )

                        for buk, kursy_list in wyniki_glowne.items():
                            dane = get_match_data(
                                buk
                            )

                            if nazwa_sportu in {
                                "Koszykówka",
                                "Tenis",
                                "Boks"
                            }:
                                if len(kursy_list) < 2:
                                    continue

                                kurs_home = kursy_list[0]
                                kurs_away = kursy_list[1]

                                if (
                                    kurs_home <= 0
                                    or kurs_away <= 0
                                ):
                                    continue

                                dane["kurs_1"] = kurs_home
                                dane["kurs_X"] = None
                                dane["kurs_2"] = kurs_away

                                print(
                                    f"      [HOME/AWAY] "
                                    f"{buk:<8} | "
                                    f"home={kurs_home} | "
                                    f"away={kurs_away}"
                                )

                            elif nazwa_sportu in {
                                "Piłka nożna",
                                "Piłka ręczna"
                            }:
                                if len(kursy_list) < 3:
                                    continue

                                kurs_1 = kursy_list[0]
                                kurs_x = kursy_list[1]
                                kurs_2 = kursy_list[2]

                                if (
                                    kurs_1 <= 0
                                    or kurs_x <= 0
                                    or kurs_2 <= 0
                                ):
                                    continue

                                dane["kurs_1"] = kurs_1
                                dane["kurs_X"] = kurs_x
                                dane["kurs_2"] = kurs_2

                                print(
                                    f"      [1X2] {buk:<8} | "
                                    f"1={kurs_1} | "
                                    f"X={kurs_x} | "
                                    f"2={kurs_2}"
                                )


                        # --- 2. POBIERANIE BTTS (Tylko Piłka nożna) ---
                        if nazwa_sportu == "Piłka nożna":
                            try:
                                if wejdz_w_zakladke(
                                    page,
                                    "Both Teams to Score"
                                ):
                                    page.wait_for_timeout(
                                        1200
                                    )

                                    aktywny_btts = (
                                        pobierz_aktywny_rynek(
                                            page
                                        )
                                    )

                                    print(
                                        f"      [DEBUG BTTS ACTIVE] "
                                        f"{aktywny_btts!r}"
                                    )

                                    wyniki_btts = (
                                        pobierz_widoczny_rynek_playwright(
                                            page,
                                            wymagane_kursy=2,
                                            nazwa_rynku="BTTS"
                                        )
                                    )

                                    for buk, kursy_list in (
                                        wyniki_btts.items()
                                    ):
                                        if len(kursy_list) < 2:
                                            continue

                                        dane = get_match_data(
                                            buk
                                        )

                                        dane["btts"] = {
                                            "tak": str(
                                                kursy_list[0]
                                            ),
                                            "nie": str(
                                                kursy_list[1]
                                            )
                                        }

                                        print(
                                            f"      [BTTS] "
                                            f"{buk:<8} | "
                                            f"tak={kursy_list[0]} | "
                                            f"nie={kursy_list[1]}"
                                        )

                                else:
                                    print(
                                        "      [WARN BTTS] "
                                        "Nie znaleziono zakładki BTTS."
                                    )

                            except Exception as blad:
                                print(
                                    f"      [!] Błąd ładowania "
                                    f"BTTS: {blad}"
                                )

                        # --- 3. POBIERANIE PODWÓJNEJ SZANSY ---
                        if nazwa_sportu == "Piłka nożna":
                            try:
                                if wejdz_w_zakladke(
                                    page,
                                    "Double Chance"
                                ):
                                    page.wait_for_timeout(
                                        1200
                                    )

                                    aktywny_dc = (
                                        pobierz_aktywny_rynek(
                                            page
                                        )
                                    )

                                    print(
                                        f"      [DEBUG DC ACTIVE] "
                                        f"{aktywny_dc!r}"
                                    )

                                    zapisz_debug_html(
                                        page,
                                        os.path.dirname(output),
                                        f"double_chance_"
                                        f"{sciezka_sportu}_{idx}"
                                    )

                                    wyniki_dc = (
                                        pobierz_widoczny_rynek_playwright(
                                            page,
                                            wymagane_kursy=3,
                                            nazwa_rynku="DC"
                                        )
                                    )

                                    print(
                                        f"      [DEBUG DC] "
                                        f"Znalezione kursy: "
                                        f"{wyniki_dc}"
                                    )

                                    for buk, kursy_list in (
                                        wyniki_dc.items()
                                    ):
                                        if len(kursy_list) < 3:
                                            continue

                                        dane = get_match_data(
                                            buk
                                        )

                                        dane["podwojna_szansa"] = {
                                            "1X": str(
                                                kursy_list[0]
                                            ),
                                            "12": str(
                                                kursy_list[1]
                                            ),
                                            "X2": str(
                                                kursy_list[2]
                                            )
                                        }

                                        print(
                                            f"      [DC] "
                                            f"{buk:<8} | "
                                            f"1X={kursy_list[0]} | "
                                            f"12={kursy_list[1]} | "
                                            f"X2={kursy_list[2]}"
                                        )

                                else:
                                    print(
                                        "      [WARN DC] "
                                        "Nie znaleziono zakładki "
                                        "Double Chance."
                                    )

                            except Exception as blad:
                                print(
                                    f"      [!] Błąd ładowania "
                                    f"Double Chance: {blad}"
                                )

                        # --- 4. POBIERANIE OVER / UNDER ---
                        # Piłka nożna, koszykówka i tenis
                        if nazwa_sportu in [
                            "Piłka nożna",
                            "Koszykówka",
                            "Tenis"
                        ]:

                            try:
                                if wejdz_w_zakladke(
                                    page,
                                    "Over/Under"
                                ):
                                    page.wait_for_timeout(1500)

                                    aktywny_rynek = pobierz_aktywny_rynek(
                                        page
                                    )

                                    print(
                                        f"      [INFO O/U] "
                                        f"Sport: {nazwa_sportu} | "
                                        f"aktywny rynek: "
                                        f"{aktywny_rynek!r}"
                                    )

                                    aktywny_ou = re.sub(
                                        r"\s+",
                                        "",
                                        aktywny_rynek.lower()
                                    )

                                    if aktywny_ou not in {
                                        "over/under",
                                        "totals",
                                        "powyżej/poniżej"
                                    }:
                                        raise RuntimeError(
                                            f"Nie jest aktywny rynek "
                                            f"Over/Under: "
                                            f"{aktywny_rynek!r}"
                                        )

                                    liczba_linii_ou = (
                                        pobierz_over_under(
                                            page,
                                            get_match_data
                                        )
                                    )

                                    print(
                                        f"      [INFO O/U] "
                                        f"{nazwa_sportu} | "
                                        f"zapisano "
                                        f"{liczba_linii_ou} linii."
                                    )

                                    zapisz_debug_html(
                                        page,
                                        os.path.dirname(output),
                                        f"{sciezka_sportu}_"
                                        f"over_under_po_"
                                        f"parsowaniu_{idx}"
                                    )

                                else:
                                    print(
                                        f"      [INFO O/U] "
                                        f"Brak zakładki Over/Under "
                                        f"dla meczu "
                                        f"{home.strip()} - "
                                        f"{away.strip()}."
                                    )

                            except Exception as blad:
                                print(
                                    f"      [!] Błąd O/U dla "
                                    f"{nazwa_sportu}: {blad}"
                                )


                        # --- 5. POBIERANIE ASIAN HANDICAP ---
                        if nazwa_sportu in {
                            "Koszykówka",
                            "Tenis"
                        }:
                            try:
                                if wejdz_w_zakladke(
                                    page,
                                    "Asian Handicap"
                                ):
                                    page.wait_for_timeout(1500)

                                    aktywny_rynek = pobierz_aktywny_rynek(
                                        page
                                    )

                                    print(
                                        f"      [DEBUG HC] "
                                        f"Sport: {nazwa_sportu} | "
                                        f"aktywny rynek: "
                                        f"{aktywny_rynek!r}"
                                    )

                                    if aktywny_rynek.lower() not in {
                                        "asian handicap",
                                        "handicap",
                                        "handicap azjatycki",
                                        "games handicap",
                                        "game handicap"
                                    }:
                                        raise RuntimeError(
                                            "Nie jest aktywny rynek "
                                            "Asian Handicap."
                                        )

                                    liczba_linii_hc = pobierz_asian_handicap(
                                        page,
                                        get_match_data
                                    )

                                    print(
                                        f"      [DEBUG HC] "
                                        f"Sport: {nazwa_sportu} | "
                                        f"zapisano {liczba_linii_hc} "
                                        f"linii."
                                    )

                                    zapisz_debug_html(
                                        page,
                                        os.path.dirname(output),
                                        f"{sciezka_sportu}_handicap_po_"
                                        f"parsowaniu_{idx}"
                                    )

                                else:
                                    print(
                                        f"      [INFO HC] "
                                        f"Brak zakładki handicapu dla "
                                        f"{nazwa_sportu}: "
                                        f"{home.strip()} - {away.strip()}."
                                    )

                            except Exception as blad:
                                print(
                                    f"      [!] Błąd Asian Handicap: "
                                    f"{blad}"
                                )
                        
                        print(
                            f"      [PODSUMOWANIE] "
                            f"{home.strip()} - {away.strip()}"
                        )

                        for nazwa_buka, dane_buka in match_data.items():
                            print(
                                f"        {nazwa_buka:<8} | "
                                f"1={dane_buka['kurs_1']} | "
                                f"X={dane_buka['kurs_X']} | "
                                f"2={dane_buka['kurs_2']} | "
                                f"O/U={len(dane_buka['over_under'])} | "
                                f"HC={len(dane_buka['handicap'])} | "
                                f"BTTS={bool(dane_buka['btts'])} | "
                                f"DC={bool(dane_buka['podwojna_szansa'])}"
                            )

                        # Zapis finalnych danych
                        if match_data:
                            for d in match_data.values():
                                ma_kursy_glowne = (
                                    isinstance(
                                        d["kurs_1"],
                                        (int, float)
                                    )
                                    and isinstance(
                                        d["kurs_2"],
                                        (int, float)
                                    )
                                    and d["kurs_1"] > 0
                                    and d["kurs_2"] > 0
                                )

                                ma_inne_rynki = (
                                    bool(d["over_under"])
                                    or bool(d["btts"])
                                    or bool(d["podwojna_szansa"])
                                    or bool(d["handicap"])
                                )

                                if ma_kursy_glowne or ma_inne_rynki:
                                    wszystkie_mecze.append(d)

                                    print(
                                        f"      [+] Zapisano: "
                                        f"{d['bukmacher']:<8} | "
                                        f"1={d['kurs_1']} | "
                                        f"2={d['kurs_2']} | "
                                        f"O/U: {len(d['over_under'])} | "
                                        f"HC: {len(d['handicap'])}"
                                    )
                        else:
                            print(
                                "      [INFO] Brak linii dla "
                                "obsługiwanych bukmacherów w tym spotkaniu."
                            )

                            

                        # Checkpoint po każdym przetworzonym meczu.
                        with open(
                            output,
                            "w",
                            encoding="utf-8"
                        ) as f:
                            json.dump(
                                wszystkie_mecze,
                                f,
                                indent=4,
                                ensure_ascii=False
                            )

                        print(
                            f"      [CHECKPOINT] Zapisano "
                            f"{len(wszystkie_mecze)} rekordów."
                        )

                        page.wait_for_timeout(2500)

                    except Exception as e:
                        print(
                            f"    [!] Krytyczny błąd przy przetwarzaniu "
                            f"meczu {link}: {e}"
                        )

                        tekst_bledu = str(e).lower()

                        trzeba_odtworzyc_karte = (
                            "err_http_response_code_failure" in tekst_bledu
                            or "chrome-error://chromewebdata/" in tekst_bledu
                            or "interrupted by another navigation" in tekst_bledu
                            or "target page, context or browser has been closed"
                            in tekst_bledu
                            or page.is_closed()
                        )

                        if trzeba_odtworzyc_karte:
                            try:
                                if not page.is_closed():
                                    page.close()
                            except Exception:
                                pass

                            page = utworz_strone(context)
                            page.wait_for_timeout(3000)

                        else:
                            page.wait_for_timeout(2000)

                        continue

                time.sleep(2.0)

        finally:
            print("\n-> Zamykanie przeglądarki...")
            try: browser.close()
            except: pass

    with open(output, "w", encoding="utf-8") as f:
        json.dump(wszystkie_mecze, f, indent=4, ensure_ascii=False)
    print(f"\n[OK] PROCES ZAKOŃCZONY - Zapisano łącznie {len(wszystkie_mecze)} rekordów kursów do pliku: {output}")

if __name__ == "__main__":
    pobierz_polskich_z_oddsportal()