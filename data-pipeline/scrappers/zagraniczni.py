from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import time
import json
import os
import re
import sys
import io
import subprocess
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse
from scrape_report import ScrapeReport

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

SPORTY = {
    "Piłka nożna": "football",
    "Koszykówka": "basketball",
    "Tenis": "tennis",
    "Piłka ręczna": "handball",
    "Boks": "boxing",
}

# Tryb testowy
TRYB_TESTOWY = False
SPORT_TESTOWY = None
LIMIT_MECZOW_TESTOWYCH = 3

BAZOWY_URL = "https://www.oddsportal.com"
ZAPISUJ_DEBUG_HTML = False
HEADLESS = True

START_VPN_BAT = r"C:\Users\mateu\Desktop\Programowanie\Projekt\start_vpn.bat"
STOP_VPN_BAT = r"C:\Users\mateu\Desktop\Programowanie\Projekt\stop_vpn.bat"
WYMAGANY_KRAJ_VPN = "NL"

ODRZUCANE_SEGMENTY = {
    "results", "standings", "teams", "archive", "news", "bookmakers",
    "predictions", "table", "in-play", "live", "outrights",
}

# Operatorzy, których nie zapisujemy w pliku zagranicznym.
WYKLUCZENI_BUKMACHERZY = {
    "sts", "sts.pl", "fortuna", "fortuna.pl", "efortuna", "efortuna.pl",
    "superbet", "superbet.pl", "betclic", "betclic.pl", "fuksiarz",
    "fuksiarz.pl", "lv bet", "lv bet.pl", "lvbet", "lvbet.pl", "betfan",
    "betfan.pl", "etoto", "etoto.pl", "goplusbet", "totalbet", "betters",
    "comeon",
}

ALIASES_BUKMACHEROW = {
    "stake": "Stake.com",
    "stakecom": "Stake.com",

    "bet365nl": "bet365",
    "bet365": "bet365",

    "1xbet": "1xBet",
    "22bet": "22Bet",
    "888sport": "888sport",

    "betathome": "bet-at-home",
    "betsio": "Bets.io",
    "betsson": "Betsson",
    "betfury": "Betfury",
    "cloudbet": "Cloudbet",
    "duelbits": "Duelbits",
    "ggbet": "GGBET",
    "megapari": "Megapari",
    "melbet": "Melbet",
    "mozzartbet": "Mozzartbet",
    "n1bet": "N1 Bet",
    "rainbet": "Rainbet",
    "roobet": "Roobet",
    "shuffle": "Shuffle"
}



def vpn_on():
    print("[VPN] Uruchamianie VPN...")
    subprocess.run(START_VPN_BAT, shell=True, check=True)
    time.sleep(15)


def vpn_off():
    print("[VPN] Wyłączanie VPN...")
    try:
        subprocess.run(STOP_VPN_BAT, shell=True, check=False)
    except Exception as blad:
        print(f"[VPN] Nie udało się wyłączyć VPN: {blad}")


def sprawdz_ip():
    response = requests.get("https://ipinfo.io/json", timeout=10)
    response.raise_for_status()
    ip_info = response.json()
    kraj = ip_info.get("country")
    adres_ip = ip_info.get("ip", "brak")
    if kraj != WYMAGANY_KRAJ_VPN:
        raise RuntimeError(
            f"VPN nie wskazuje kraju {WYMAGANY_KRAJ_VPN}. "
            f"IP={adres_ip}, kraj={kraj}"
        )
    print(f"[VPN] Połączono. IP={adres_ip}, kraj={kraj}")


def uprosc_nazwe(tekst):
    tekst = re.sub(r"\s+", " ", str(tekst or "")).strip()
    return tekst


def klucz_nazwy_bukmachera(nazwa):
    nazwa = uprosc_nazwe(
        nazwa
    ).lower()

    nazwa = re.sub(
        r"[^a-z0-9]+",
        "",
        nazwa
    )

    return nazwa


WYKLUCZONE_KLUCZE = {
    klucz_nazwy_bukmachera(nazwa)
    for nazwa in WYKLUCZENI_BUKMACHERZY
}


def czy_bukmacher_zagraniczny(nazwa):
    if not nazwa:
        return False

    klucz = klucz_nazwy_bukmachera(
        nazwa
    )

    return klucz not in WYKLUCZONE_KLUCZE


def wyczysc_nazwe_bukmachera(tekst):
    tekst = uprosc_nazwe(tekst)
    if not tekst:
        return ""

    tekst = re.sub(
        r"\b(?:zgarnij|claim|get)\s+(?:bonus|offer)\b.*$",
        "",
        tekst,
        flags=re.IGNORECASE,
    ).strip()

    # Komórka często zawiera logo oraz właściwą nazwę tekstową.
    kandydaci = re.findall(
        r"[A-Za-z0-9][A-Za-z0-9 .&+'_-]{1,35}(?:\.[A-Za-z]{2,3})?",
        tekst,
    )
    kandydaci = [uprosc_nazwe(x).strip(" -|") for x in kandydaci]
    kandydaci = [x for x in kandydaci if 2 <= len(x) <= 40]

    if not kandydaci:
        return tekst[:40].strip()

    # Najczęściej ostatni sensowny fragment jest nazwą wyświetlaną, np. Bet365.nl.
    for kandydat in reversed(kandydaci):
        maly = kandydat.lower()
        if not any(x in maly for x in ["bonus", "bookmaker", "payout", "kurs"]):
            return kandydat

    return kandydaci[-1]


def obsluz_baner_cookies(page_obj):
    przyciski = [
        "#onetrust-reject-all-handler",
        "#onetrust-accept-btn-handler",
        ".onetrust-close-btn-handler",
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
                    const elementy =
                        document.querySelectorAll(
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

        if (
            "onetrust" in tekst_bledu
            or "intercepts pointer events" in tekst_bledu
        ):
            obsluz_baner_cookies(
                page_obj
            )

        try:
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

def bezpieczny_id(tekst):
    tekst = str(tekst).lower().strip()
    tekst = re.sub(r"[^a-z0-9ąćęłńóśźż]+", "_", tekst)
    return tekst.strip("_")


def liczba_kursow_glownych(nazwa_sportu):
    if nazwa_sportu in {"Piłka nożna", "Piłka ręczna"}:
        return 3
    if nazwa_sportu in {"Koszykówka", "Tenis", "Boks"}:
        return 2
    return 0


def normalizuj_link_meczu(href, sciezka_sportu):
    if href is None:
        return None
    href = str(href).strip()
    if not href or href.startswith(("javascript:", "mailto:", "tel:", "#")):
        return None

    pelny_url = urljoin(BAZOWY_URL + "/", href)
    parsed = urlparse(pelny_url)
    if not parsed.netloc.lower().endswith("oddsportal.com"):
        return None

    parts = [x.strip() for x in parsed.path.split("/") if x.strip()]
    lower = [x.lower() for x in parts]
    if not parts:
        return None

    jezyki = {"pl", "en", "de", "es", "fr", "it", "pt", "cz", "sk", "nl"}
    indeks = 1 if lower[0] in jezyki else 0
    if indeks >= len(lower) or lower[indeks] != sciezka_sportu.lower():
        return None
    if indeks + 1 >= len(lower) or lower[indeks + 1] != "h2h":
        return None
    if indeks + 3 >= len(parts):
        return None

    event_id = parsed.fragment.strip().strip("/")
    if not event_id or not (6 <= len(event_id) <= 24) or not event_id.isalnum():
        return None

    scheme = parsed.scheme or "https"
    return f"{scheme}://{parsed.netloc}/{'/'.join(parts)}/#{event_id}"


def pobierz_tekst_strony(page_obj):
    try:
        return page_obj.locator("body").inner_text(timeout=3000)
    except Exception:
        return ""


def wykryj_blad_oddsportal(page_obj):
    tekst = pobierz_tekst_strony(page_obj).lower()
    komunikaty = [
        "failed to fetch data", "invalid encrypted ajax payload",
        "unexpected response format", "access denied", "temporarily unavailable",
    ]
    return any(x in tekst for x in komunikaty)


def czy_tabela_kursow_jest(page_obj):
    try:
        if page_obj.url.startswith(
            "chrome-error://"
        ):
            return False

        return page_obj.evaluate(
            """
            () => {
                const body = document.body;

                if (!body) {
                    return false;
                }

                const tekst = (
                    body.innerText || ""
                ).toLowerCase();

                if (
                    tekst.includes("failed to fetch data") ||
                    tekst.includes("invalid encrypted ajax payload") ||
                    tekst.includes("unexpected response format") ||
                    tekst.includes("access denied") ||
                    tekst.includes("temporarily unavailable")
                ) {
                    return false;
                }

                const tabele = Array.from(
                    document.querySelectorAll("table")
                );

                for (const tabela of tabele) {
                    const naglowki = Array.from(
                        tabela.querySelectorAll(
                            "thead th, thead td"
                        )
                    ).map(element => (
                        element.textContent || ""
                    ).trim().toLowerCase());

                    const maBukmacherow = naglowki.some(
                        naglowek =>
                            naglowek.includes("bookmakers") ||
                            naglowek.includes("bukmacherzy")
                    );

                    const maKolumne1 =
                        naglowki.includes("1");

                    const maKolumne2 =
                        naglowki.includes("2");

                    const linkiKursow = Array.from(
                        tabela.querySelectorAll(
                            'a[href*="/betslip/"]'
                        )
                    ).filter(element => {
                        const wartosc = (
                            element.textContent || ""
                        ).trim();

                        return /^\\d{1,3}[.,]\\d{1,3}$/.test(
                            wartosc
                        );
                    });

                    if (
                        maBukmacherow &&
                        maKolumne1 &&
                        maKolumne2 &&
                        linkiKursow.length >= 2
                    ) {
                        return true;
                    }
                }

                return false;
            }
            """
        )

    except Exception as blad:
        print(
            f"      [DEBUG TABLE READY] "
            f"{blad}"
        )
        return False


def czekaj_na_tabele_kursow(
    page_obj,
    timeout_ms=20000
):
    start = time.monotonic()
    numer_proby = 0

    while (
        time.monotonic() - start
    ) * 1000 < timeout_ms:
        numer_proby += 1

        if wykryj_blad_oddsportal(
            page_obj
        ):
            return False, "blad_ajax"

        if czy_tabela_kursow_jest(
            page_obj
        ):
            return True, "ok"

        try:
            liczba_tabel = page_obj.locator(
                "table"
            ).count()

            liczba_kursow = page_obj.locator(
                'a[href*="/betslip/"]'
            ).count()

            liczba_bukmacherow = page_obj.locator(
                'a[href*="/proxy/bookmakers/"]'
                '[href$="/link/"]'
            ).count()

            print(
                f"      [WAIT ODDS {numer_proby}] "
                f"table={liczba_tabel} | "
                f"odds={liczba_kursow} | "
                f"bookmakers={liczba_bukmacherow}"
            )

        except Exception as blad:
            print(
                f"      [DEBUG WAIT ODDS] "
                f"{blad}"
            )

        page_obj.wait_for_timeout(
            750
        )

    return False, "timeout"


def zapisz_debug_html(page_obj, output_dir, nazwa):
    if not ZAPISUJ_DEBUG_HTML:
        return
    try:
        nazwa = re.sub(r"[^A-Za-z0-9_.-]+", "_", nazwa)
        sciezka = os.path.join(output_dir, f"debug_{nazwa}.html")
        with open(sciezka, "w", encoding="utf-8") as plik:
            plik.write(page_obj.content())
        print(f"      [DEBUG] Zapisano HTML: {sciezka}")
    except Exception as blad:
        print(f"      [DEBUG] Nie zapisano HTML: {blad}")


def pobierz_godzine_z_elementu(element):
    try:
        tekst = element.inner_text(timeout=1000)
    except Exception:
        tekst = ""
    match = re.search(r"\b([01]\d|2[0-3]):[0-5]\d\b", tekst)
    return match.group(0) if match else "00:00"


def pobierz_linki_meczow_z_listy(
    page_obj,
    sciezka_sportu,
    dzien,
    debug_dir
):
    znalezione = []
    widziane = set()

    selektor_linkow = (
        f'a[href*="/{sciezka_sportu}/h2h/"]'
        f'[href*="#"]'
    )

    linki = page_obj.locator(
        selektor_linkow
    )

    try:
        liczba_linkow = linki.count()
    except Exception:
        liczba_linkow = 0

    print(
        f"    [INFO] Wykryto {liczba_linkow} "
        f"linków H2H dla sportu "
        f"{sciezka_sportu}"
    )

    for indeks in range(liczba_linkow):
        try:
            link_element = linki.nth(
                indeks
            )

            href = link_element.get_attribute(
                "href"
            )

            poprawny_url = normalizuj_link_meczu(
                href,
                sciezka_sportu
            )

            if indeks < 5:
                print(
                    f"      [DEBUG LINK] "
                    f"link={indeks + 1} | "
                    f"href={href!r} | "
                    f"wynik={poprawny_url!r}"
                )

            if not poprawny_url:
                continue

            godzina = pobierz_godzine_z_elementu(
                link_element
            )

            klucz = (
                poprawny_url,
                dzien
            )

            if klucz in widziane:
                continue

            widziane.add(
                klucz
            )

            znalezione.append(
                (
                    poprawny_url,
                    dzien,
                    godzina
                )
            )

        except Exception as blad:
            print(
                f"      [WARN] Błąd linku "
                f"{indeks + 1}: {blad}"
            )

    print(
        f"    [INFO] Po walidacji zebrano "
        f"{len(znalezione)} unikalnych "
        f"linków do meczów."
    )

    if not znalezione:
        zapisz_debug_html(
            page_obj,
            debug_dir,
            f"lista_{sciezka_sportu}_{dzien}"
        )

    return znalezione


def wyczysc_tytul_meczu(title_raw):
    if not title_raw:
        return ""
    tytul = re.sub(r"\s+", " ", str(title_raw)).strip()
    tytul = re.sub(r"\s+vs\.?\s+", " - ", tytul, flags=re.IGNORECASE)
    wzorce = [
        r"\s*-\s*(?:kursy|typy|prognozy)(?:\s*,\s*|\s+).*?$",
        r"\s*-\s*odds\s*,\s*predictions.*?$",
        r"\s*-\s*(?:odds|predictions|results|h2h).*?$",
    ]
    for wzorzec in wzorce:
        tytul = re.sub(wzorzec, "", tytul, flags=re.IGNORECASE)
    return tytul.strip(" -")


def wejdz_w_zakladke(page_obj, tab_name):
    warianty = {
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

    nazwy = warianty.get(
        tab_name,
        [tab_name]
    )

    def kliknij(locator, opis):
        try:
            liczba = locator.count()
        except Exception:
            liczba = 0

        for indeks in range(liczba):
            try:
                element = locator.nth(
                    indeks
                )

                if not element.is_visible():
                    continue

                if not bezpieczne_klikniecie(
                    page_obj,
                    element,
                    timeout_ms=5000
                ):
                    continue

                page_obj.wait_for_timeout(
                    1000
                )

                print(
                    f"      [INFO] Kliknięto: "
                    f"{opis}"
                )

                return True

            except Exception as blad:
                print(
                    f"      [DEBUG TAB] "
                    f"Nie udało się kliknąć "
                    f"{opis!r}: {blad}"
                )

        return False

    for nazwa in nazwy:
        locator = page_obj.locator(
            "li.tab-item, "
            '[role="tab"], '
            "button"
        ).filter(
            has_text=re.compile(
                rf"^\s*{re.escape(nazwa)}\s*$",
                re.IGNORECASE
            )
        )


        if kliknij(
            locator,
            nazwa
        ):
            return True

    for menu in [
        "Więcej",
        "More"
    ]:
        locator_menu = page_obj.get_by_text(
            menu,
            exact=True
        )

        if not kliknij(
            locator_menu,
            menu
        ):
            continue

        page_obj.wait_for_timeout(
            750
        )

        for nazwa in nazwy:
            locator = page_obj.get_by_text(
                nazwa,
                exact=True
            )

            if kliknij(
                locator,
                nazwa
            ):
                return True

    print(
        f"      [INFO] Nie znaleziono "
        f"zakładki: {tab_name}"
    )

    return False


def pobierz_aktywny_rynek(page_obj):
    selektory = [
        "li.tab-item.active-item-feed",
        "li.active-item-feed",
        '[role="tab"][aria-selected="true"]',
        '[aria-selected="true"]'
    ]

    for selektor in selektory:
        try:
            elementy = page_obj.locator(
                selektor
            )

            for indeks in range(
                elementy.count()
            ):
                element = elementy.nth(
                    indeks
                )

                if not element.is_visible():
                    continue

                tekst = element.inner_text(
                    timeout=1500
                ).strip()

                if tekst:
                    return tekst

        except Exception:
            continue

    return ""



def pobierz_widoczna_tabele_glowna(page_obj, nazwa_sportu):
    tabele = page_obj.locator("table")
    try:
        liczba = tabele.count()
    except Exception:
        liczba = 0

    for indeks in range(liczba):
        tabela = tabele.nth(indeks)
        try:
            if not tabela.is_visible():
                continue
            naglowek = tabela.locator("thead").inner_text(timeout=1500)
            naglowek = re.sub(r"\s+", " ", naglowek).strip().lower()
        except Exception:
            continue

        if any(x in naglowek for x in ["over", "under", "handicap"]):
            continue

        ma_1 = bool(re.search(r"(^|\s)1(?:\s|$)", naglowek))
        ma_x = bool(re.search(r"(^|\s)x(?:\s|$)", naglowek))
        ma_2 = bool(re.search(r"(^|\s)2(?:\s|$)", naglowek))

        if nazwa_sportu in {"Piłka nożna", "Piłka ręczna"}:
            if ma_1 and ma_x and ma_2:
                return tabela
        else:
            ma_bukmacherow = "bookmakers" in naglowek or "bukmacherzy" in naglowek
            ma_payout = any(x in naglowek for x in ["payout", "wypłata", "wyplata"])
            if ma_bukmacherow and ma_1 and ma_2 and not ma_x and ma_payout:
                return tabela
    return None

def czy_poprawna_nazwa_bukmachera(nazwa):
    nazwa = uprosc_nazwe(
        nazwa
    )

    if not nazwa:
        return False

    if len(nazwa) < 2 or len(nazwa) > 40:
        return False

    maly = nazwa.lower().strip()

    niedozwolone_fragmenty = [
        "asian handicap",
        "over/under",
        "over under",
        "double chance",
        "both teams to score",
        "home/away",
        "home / away",
        "moneyline",
        "best odds",
        "opening odds",
        "show more"
    ]

    if any(
        fragment in maly
        for fragment in niedozwolone_fragmenty
    ):
        return False

    niedozwolone_dokladne = {
        "handicap",
        "payout",
        "bookmakers",
        "bookmaker",
        "bukmacherzy",
        "więcej",
        "more",
        "kursy",
        "odds",
        "total",
        "totals",
        "featured",
        "average",
        "maximum",
        "minimum",
        "live",
        "suspended",
        "closed",
        "market",
        "result",
        "results",
        "draw",
        "home",
        "away",
        "yes",
        "no",
        "tak",
        "nie"
    }

    if maly in niedozwolone_dokladne:
        return False

    if re.match(
        r"^(?:asian\s+handicap|handicap|"
        r"over\s*/?\s*under)"
        r"\s*[+-]?\d",
        maly
    ):
        return False

    if re.fullmatch(
        r"[+-]?\d+(?:[.,]\d+)?"
        r"(?:\s+\d+)?",
        maly
    ):
        return False

    if not re.search(
        r"[a-z]",
        maly
    ):
        return False

    slowa = re.findall(
        r"[a-z0-9]+",
        maly
    )

    if len(slowa) > 5:
        return False

    liczby = re.findall(
        r"[+-]?\d+(?:[.,]\d+)?",
        maly
    )

    if len(liczby) >= 2:
        return False

    return czy_bukmacher_zagraniczny(
        nazwa
    )



def pobierz_nazwe_bukmachera_z_rzedu_playwright(
    rzad
):
    try:
        dane = rzad.evaluate(
            """
            rzad => {
                const linkBukmachera =
                    rzad.querySelector(
                        'a[href*="/proxy/bookmakers/"]'
                    );

                const pierwszaKomorka =
                    rzad.querySelector(
                        "td:first-child"
                    );

                const obrazek =
                    pierwszaKomorka
                        ? pierwszaKomorka.querySelector(
                            "img"
                        )
                        : null;

                return {
                    tekstLinku:
                        linkBukmachera
                            ? (
                                linkBukmachera.innerText
                                || ""
                            )
                            : "",

                    titleLinku:
                        linkBukmachera
                            ? (
                                linkBukmachera.getAttribute(
                                    "title"
                                )
                                || ""
                            )
                            : "",

                    ariaLinku:
                        linkBukmachera
                            ? (
                                linkBukmachera.getAttribute(
                                    "aria-label"
                                )
                                || ""
                            )
                            : "",

                    tekstKomorki:
                        pierwszaKomorka
                            ? (
                                pierwszaKomorka.innerText
                                || ""
                            )
                            : "",

                    altObrazka:
                        obrazek
                            ? (
                                obrazek.getAttribute(
                                    "alt"
                                )
                                || ""
                            )
                            : "",

                    titleObrazka:
                        obrazek
                            ? (
                                obrazek.getAttribute(
                                    "title"
                                )
                                || ""
                            )
                            : ""
                };
            }
            """
        )

    except Exception:
        return None

    kandydaci = [
        dane.get("tekstLinku", ""),
        dane.get("titleLinku", ""),
        dane.get("ariaLinku", ""),
        dane.get("altObrazka", ""),
        dane.get("titleObrazka", ""),
        dane.get("tekstKomorki", "")
    ]

    unikalni_kandydaci = []

    for kandydat in kandydaci:
        kandydat = uprosc_nazwe(
            kandydat
        )

        if (
            kandydat
            and kandydat not in unikalni_kandydaci
        ):
            unikalni_kandydaci.append(
                kandydat
            )

    for tekst in unikalni_kandydaci:
        oczyszczony = re.split(
            r"\b(?:ZGARNIJ|CLAIM|GET)\b",
            tekst,
            maxsplit=1,
            flags=re.IGNORECASE
        )[0]

        oczyszczony = uprosc_nazwe(
            oczyszczony
        )

        slowa = oczyszczony.split()

        if (
            len(slowa) >= 2
            and slowa[0].lower()
            == slowa[1].lower()
        ):
            oczyszczony = " ".join(
                slowa[1:]
            )

        nazwa = wyczysc_nazwe_bukmachera(
            oczyszczony
        )

        nazwa = normalizuj_nazwe_bukmachera(
            nazwa
        )

        if czy_poprawna_nazwa_bukmachera(
            nazwa
        ):
            return nazwa

    return None


def normalizuj_nazwe_bukmachera(nazwa):
    nazwa = uprosc_nazwe(
        nazwa
    )

    klucz = klucz_nazwy_bukmachera(
        nazwa
    )

    return ALIASES_BUKMACHEROW.get(
        klucz,
        nazwa
    )

def pobierz_kursy_z_locatorow(locator):
    kursy = []

    try:
        teksty = locator.all_inner_texts()
    except Exception:
        return kursy

    for tekst in teksty:
        tekst = str(
            tekst
        ).replace(
            ",",
            "."
        ).strip()

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

    return kursy


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
            "      [WARN MAIN] "
            "Nie znaleziono głównej tabeli."
        )
        return {}

    wymagane = liczba_kursow_glownych(
        nazwa_sportu
    )

    wyniki = {}

    rzedy = tabela.locator(
        "tbody tr"
    )

    try:
        liczba_rzedow = rzedy.count()
    except Exception:
        liczba_rzedow = 0

    print(
        f"      [DEBUG MAIN] "
        f"Wiersze w głównej tabeli: "
        f"{liczba_rzedow}"
    )

    for indeks in range(
        liczba_rzedow
    ):
        rzad = rzedy.nth(
            indeks
        )

        try:
            tekst_rzedu = rzad.inner_text(
                timeout=1500
            )

            tekst_rzedu = re.sub(
                r"\s+",
                " ",
                tekst_rzedu
            ).strip()

        except Exception:
            tekst_rzedu = ""

        nazwa = (
            pobierz_nazwe_bukmachera_z_rzedu_playwright(
                rzad
            )
        )

        if not nazwa:
            print(
                f"      [SKIP MAIN NAME] "
                f"Wiersz {indeks + 1}: "
                f"{tekst_rzedu!r}"
            )
            continue

        nazwa = normalizuj_nazwe_bukmachera(
            nazwa
        )
        if not czy_poprawna_nazwa_bukmachera(
            nazwa
        ):
            print(
                f"      [SKIP MAIN FOREIGN] "
                f"Odrzucono nazwę: {nazwa!r}"
            )
            continue

        kursy_locator = rzad.locator(
            'a[href*="/betslip/"]'
        )

        kursy = pobierz_kursy_z_locatorow(
            kursy_locator
        )

        # Fallback: odczyt kursów bezpośrednio
        # z kolejnych komórek tabeli.
        if len(kursy) < wymagane:
            kursy = []

            komorki = rzad.locator(
                "td"
            )

            try:
                liczba_komorek = komorki.count()
            except Exception:
                liczba_komorek = 0

            # Pierwsza komórka zawiera bukmachera.
            # Następne zawierają kursy i payout.
            for indeks_komorki in range(
                1,
                liczba_komorek
            ):
                komorka = komorki.nth(
                    indeks_komorki
                )

                try:
                    tekst = komorka.inner_text(
                        timeout=1000
                    )

                    tekst = tekst.replace(
                        ",",
                        "."
                    ).strip()

                except Exception:
                    continue

                # Pomijamy procent payout.
                if "%" in tekst:
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
                    kursy.append(
                        kurs
                    )

                if len(kursy) >= wymagane:
                    break

        print(
            f"      [MAIN ROW] "
            f"wiersz={indeks + 1} | "
            f"bukmacher={nazwa!r} | "
            f"kursy={kursy} | "
            f"tekst={tekst_rzedu!r}"
        )

        if len(kursy) < wymagane:
            print(
                f"      [SKIP MAIN ODDS] "
                f"{nazwa!r}: znaleziono "
                f"{len(kursy)} kursów, "
                f"wymagane {wymagane}."
            )
            continue

        wyniki[nazwa] = kursy[
            :wymagane
        ]

    print(
        f"      [MAIN RESULT] "
        f"Zapisano {len(wyniki)} "
        f"bukmacherów: "
        f"{list(wyniki.keys())}"
    )

    return wyniki


def czekaj_na_glowny_rynek(page_obj, nazwa_sportu, timeout_ms=15000):
    start = time.time()
    wymagane = liczba_kursow_glownych(nazwa_sportu)
    while (time.time() - start) * 1000 < timeout_ms:
        tabela = pobierz_widoczna_tabele_glowna(page_obj, nazwa_sportu)
        if tabela is not None:
            rzedy = tabela.locator("tbody tr")
            for indeks in range(rzedy.count()):
                rzad = rzedy.nth(indeks)
                if not pobierz_nazwe_bukmachera_z_rzedu_playwright(rzad):
                    continue
                ile = rzad.locator(
                    'a[href*="/betslip/"]'
                ).count()

                if ile < wymagane:
                    ile = rzad.locator(
                        "td:not(:first-child) a"
                    ).count()
                if ile >= wymagane:
                    return True, "ok"
        page_obj.wait_for_timeout(500)
    return False, "timeout"


def pobierz_glowny_rynek(page_obj, nazwa_sportu):
    if nazwa_sportu in {"Koszykówka", "Tenis", "Boks"}:
        nazwa_rynku = "Home/Away"
        dozwolone = {"home/away", "home-away", "moneyline", "12"}
    else:
        nazwa_rynku = "1X2"
        dozwolone = {"1x2"}

    for proba in range(1, 3):
        if not wejdz_w_zakladke(page_obj, nazwa_rynku):
            if proba < 2:
                continue
            return {}

        aktywny = re.sub(r"\s+", "", pobierz_aktywny_rynek(page_obj).lower())
        if aktywny not in dozwolone:
            if proba < 2:
                continue
            return {}

        ok, _ = czekaj_na_glowny_rynek(page_obj, nazwa_sportu)
        if not ok:
            if proba < 2:
                continue
            return {}

        wyniki = pobierz_kursy_glowne_playwright(page_obj, nazwa_sportu)
        if wyniki:
            return wyniki
    return {}


def parsuj_standardowy_rynek_playwright(
    page_obj,
    wymagane,
    kontener=None
):
    wyniki = {}

    if kontener is None:
        rzedy = page_obj.locator(
            "table tbody tr"
        )
    else:
        try:
            tag_name = kontener.evaluate(
                "element => element.tagName.toLowerCase()"
            )
        except Exception:
            tag_name = ""

        if tag_name == "tr":
            rzedy = kontener
        else:
            rzedy = kontener.locator(
                "tbody tr"
            )

            if rzedy.count() == 0:
                rzedy = kontener.locator(
                    "tr"
                )

    try:
        liczba_rzedow = rzedy.count()
    except Exception:
        liczba_rzedow = 0

    for indeks in range(
        liczba_rzedow
    ):
        rzad = rzedy.nth(
            indeks
        )

        try:
            nazwa = (
                pobierz_nazwe_bukmachera_z_rzedu_playwright(
                    rzad
                )
            )

            if not nazwa:
                continue

            loc = rzad.locator(
                'a[href*="/betslip/"]'
            )

            if loc.count() < wymagane:
                loc = rzad.locator(
                    "td:not(:first-child) a"
                )

            kursy = pobierz_kursy_z_locatorow(
                loc
            )

            if len(kursy) < wymagane:
                continue

            wyniki[nazwa] = kursy[
                :wymagane
            ]

        except Exception:
            continue

    return wyniki


def znajdz_tabele_ou(page_obj):
    oznaczona = page_obj.locator(
        'table[data-scraper-market-lines="over-under"]'
    ).first

    try:
        if (
            oznaczona.count() > 0
            and oznaczona.is_visible()
        ):
            return oznaczona
    except Exception:
        pass

    tabele = page_obj.locator(
        "table"
    )

    for i in range(
        tabele.count()
    ):
        tabela = tabele.nth(i)

        try:
            if not tabela.is_visible():
                continue

            naglowek = tabela.locator(
                "thead"
            ).inner_text(
                timeout=1000
            ).lower()

        except Exception:
            continue

        if (
            "over" in naglowek
            and "under" in naglowek
        ):
            return tabela

    return None


def znajdz_tabele_kursow_dla_wiersza(
    page_obj,
    wiersz_rynku=None,
    wymagane=2,
    timeout_ms=4000
):
    start = time.time()

    while (
        time.time() - start
    ) * 1000 < timeout_ms:
        tabele = page_obj.locator(
            "table"
        )

        najlepsza_tabela = None
        najlepszy_wynik = 0
        najlepszy_naglowek = ""

        try:
            liczba_tabel = tabele.count()
        except Exception:
            liczba_tabel = 0

        for indeks in range(
            liczba_tabel
        ):
            tabela = tabele.nth(
                indeks
            )

            try:
                if not tabela.is_visible():
                    continue

                # Pomijamy oznaczoną tabelę wyboru linii.
                typ_tabeli = tabela.get_attribute(
                    "data-scraper-market-lines"
                )

                if typ_tabeli:
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

                naglowek_maly = naglowek.lower()

                ma_1 = bool(
                    re.search(
                        r"(^|\s)1(?:\s|$)",
                        naglowek_maly
                    )
                )

                ma_x = bool(
                    re.search(
                        r"(^|\s)x(?:\s|$)",
                        naglowek_maly
                    )
                )

                ma_2 = bool(
                    re.search(
                        r"(^|\s)2(?:\s|$)",
                        naglowek_maly
                    )
                )

                # Pomijamy piłkarską tabelę 1X2.
                if ma_1 and ma_x and ma_2:
                    continue

                poprawne_rzedy = tabela.evaluate(
                    """
                    (tabela, wymagane) => {
                        const rzedy = Array.from(
                            tabela.querySelectorAll(
                                "tbody tr"
                            )
                        );

                        let poprawne = 0;

                        for (const rzad of rzedy) {
                            const linkBukmachera =
                                rzad.querySelector(
                                    'a[href*="/proxy/bookmakers/"]'
                                );

                            const kursy = Array.from(
                                rzad.querySelectorAll(
                                    'a[href*="/betslip/"]'
                                )
                            ).filter(element => {
                                const tekst = (
                                    element.textContent || ""
                                ).trim();

                                return /^\\d{1,3}[.,]\\d{1,3}$/.test(
                                    tekst
                                );
                            });

                            if (
                                linkBukmachera
                                && kursy.length >= wymagane
                            ) {
                                poprawne++;
                            }
                        }

                        return poprawne;
                    }
                    """,
                    wymagane
                )

                if poprawne_rzedy > najlepszy_wynik:
                    najlepszy_wynik = (
                        poprawne_rzedy
                    )
                    najlepsza_tabela = tabela
                    najlepszy_naglowek = naglowek

            except Exception as blad:
                print(
                    f"      [DEBUG MARKET TABLE] "
                    f"Błąd tabeli {indeks}: {blad}"
                )
                continue

        if (
            najlepsza_tabela is not None
            and najlepszy_wynik > 0
        ):
            print(
                f"      [DEBUG MARKET TABLE] "
                f"Znaleziono tabelę kursów: "
                f"{najlepszy_wynik} "
                f"wierszy bukmacherów."
            )

            print(
                f"      [DEBUG MARKET HEADER] "
                f"{najlepszy_naglowek!r}"
            )

            return najlepsza_tabela

        page_obj.wait_for_timeout(
            350
        )

    return None
    


def znajdz_widoczna_tabele_z_kursami(
    page_obj,
    wymagane
):
    tabele = page_obj.locator(
        "table"
    )

    try:
        liczba_tabel = tabele.count()
    except Exception:
        liczba_tabel = 0

    for indeks in range(
        liczba_tabel
    ):
        tabela = tabele.nth(
            indeks
        )

        try:
            if not tabela.is_visible():
                continue

            liczba_poprawnych = tabela.evaluate(
                """
                (tabela, wymagane) => {
                    const rzedy = Array.from(
                        tabela.querySelectorAll(
                            "tbody tr"
                        )
                    );

                    let poprawne = 0;

                    for (const rzad of rzedy) {
                        const linkBukmachera =
                            rzad.querySelector(
                                'a[href*="/proxy/bookmakers/"]'
                            );

                        const kursy =
                            rzad.querySelectorAll(
                                'a[href*="/betslip/"]'
                            );

                        if (
                            linkBukmachera
                            && kursy.length >= wymagane
                        ) {
                            poprawne++;
                        }
                    }

                    return poprawne;
                }
                """,
                wymagane
            )

            if liczba_poprawnych > 0:
                return tabela

        except Exception:
            continue
            
    return None

def pobierz_over_under(
    page_obj,
    get_match_data
):
    tabela = znajdz_tabele_ou(
        page_obj
    )

    if tabela is None:
        print(
            "      [WARN O/U] "
            "Nie znaleziono tabeli O/U."
        )
        return 0

    try:
        tabela.evaluate(
            """
            element => {
                element.setAttribute(
                    "data-scraper-market-lines",
                    "over-under"
                );
            }
            """
        )
    except Exception as blad:
        print(
            f"      [WARN O/U] "
            f"Nie oznaczono tabeli linii: {blad}"
        )

    znalezione = []
    rzedy = tabela.locator("tbody > tr")
    for i in range(rzedy.count()):
        try:
            tekst = rzedy.nth(i).inner_text(timeout=1000)
        except Exception:
            continue
        match = re.search(r"(?:Over/Under|O/U)\s*\+?(\d+(?:[.,]\d+)?)", tekst, re.I)
        if not match:
            continue
        wartosc = match.group(1).replace(",", ".")
        if not wartosc.endswith(".5"):
            continue
        if wartosc not in znalezione:
            znalezione.append(wartosc)

    zapisane = 0
    print(
        f"      [DEBUG O/U LINES] "
        f"Znalezione linie: {znalezione}"
    )

    for wartosc in znalezione:
        tabela = znajdz_tabele_ou(page_obj)
        if tabela is None:
            break
        rzedy = tabela.locator("tbody > tr")
        cel = None
        for i in range(rzedy.count()):
            rzad = rzedy.nth(i)
            try:
                tekst = rzad.inner_text(timeout=1000)
            except Exception:
                continue
            match = re.search(r"(?:Over/Under|O/U)\s*\+?(\d+(?:[.,]\d+)?)", tekst, re.I)
            if match and match.group(1).replace(",", ".") == wartosc:
                cel = rzad
                break
        if cel is None:
            continue

        komorka = cel.locator("td").first

        if not bezpieczne_klikniecie(
            page_obj,
            komorka,
            timeout_ms=5000
        ):
            print(
                f"      [WARN O/U] "
                f"Nie udało się rozwinąć "
                f"linii {wartosc}."
            )
            continue

        print(
            f"      [DEBUG O/U CLICK] "
            f"Rozwinięto linię {wartosc}."
        )

        page_obj.wait_for_timeout(
            400
        )

        kontener_linii = (
            znajdz_tabele_kursow_dla_wiersza(
                page_obj,
                cel,
                wymagane=2,
                timeout_ms=4000
            )
        )

        if kontener_linii is None:
            print(
                f"      [WARN O/U] "
                f"Nie znaleziono rozwiniętych kursów "
                f"dla linii {wartosc}."
            )

            try:
                obsluz_baner_cookies(
                    page_obj
                )

                komorka.click(
                    timeout=2000,
                    force=True
                )

                page_obj.wait_for_timeout(
                    500
                )

            except Exception:
                try:
                    komorka.evaluate(
                        """
                        element => element.click()
                        """
                    )

                    page_obj.wait_for_timeout(
                        500
                    )

                except Exception:
                    pass

            continue

        wyniki = parsuj_standardowy_rynek_playwright(
            page_obj,
            2,
            kontener=kontener_linii
        )

        print(
            f"      [DEBUG O/U {wartosc}] "
            f"{wyniki}"
        )
        znaleziono = False
        for buk, kursy in wyniki.items():
            dane = get_match_data(buk)
            if dane is None:
                continue
            dane["over_under"][f"+{wartosc}"] = {
                "over": str(kursy[0]), "under": str(kursy[1])
            }
            znaleziono = True
        if znaleziono:
            zapisane += 1
        try:
            obsluz_baner_cookies(
                page_obj
            )

            komorka.click(
                timeout=3000,
                force=True
            )

            page_obj.wait_for_timeout(500)

        except Exception:
            try:
                komorka.evaluate(
                    """
                    element => element.click()
                    """
                )

                page_obj.wait_for_timeout(500)

            except Exception:
                pass
    return zapisane


def znajdz_tabele_hc(page_obj):
    oznaczona = page_obj.locator(
        'table[data-scraper-market-lines="handicap"]'
    ).first

    try:
        if (
            oznaczona.count() > 0
            and oznaczona.is_visible()
        ):
            return oznaczona
    except Exception:
        pass

    tabele = page_obj.locator(
        "table"
    )

    try:
        liczba_tabel = tabele.count()
    except Exception:
        liczba_tabel = 0

    for indeks in range(
        liczba_tabel
    ):
        tabela = tabele.nth(
            indeks
        )

        try:
            if not tabela.is_visible():
                continue

            naglowek = tabela.locator(
                "thead"
            ).inner_text(
                timeout=1000
            )

            naglowek = re.sub(
                r"\s+",
                " ",
                naglowek
            ).strip().lower()

        except Exception:
            continue

        ma_handicap = (
            "handicap" in naglowek
        )

        ma_over_under = (
            "over" in naglowek
            or "under" in naglowek
        )

        if not ma_handicap:
            continue

        if ma_over_under:
            continue

        rzedy = tabela.locator(
            "tbody > tr"
        )

        try:
            liczba_rzedow = rzedy.count()
        except Exception:
            liczba_rzedow = 0

        liczba_linii = 0

        for indeks_rzedu in range(
            liczba_rzedow
        ):
            try:
                tekst = rzedy.nth(
                    indeks_rzedu
                ).inner_text(
                    timeout=500
                )
            except Exception:
                continue

            if re.search(
                r"(?:Asian Handicap|"
                r"Games? Handicap|"
                r"Handicap|AH)"
                r"\s*[+-]?\d+(?:[.,]\d+)?",
                tekst,
                re.IGNORECASE
            ):
                liczba_linii += 1

        if liczba_linii > 0:
            print(
                f"      [DEBUG HC TABLE] "
                f"Znaleziono tabelę z "
                f"{liczba_linii} liniami."
            )

            return tabela

    return None


def czy_linia_polowkowa(wartosc):
    if wartosc is None:
        return False

    tekst = str(
        wartosc
    ).strip().replace(
        ",",
        "."
    )

    return bool(
        re.fullmatch(
            r"[+-]?\d+\.5",
            tekst
        )
    )

def pobierz_asian_handicap(
    page_obj,
    get_match_data
):
    tabela = znajdz_tabele_hc(
        page_obj
    )

    if tabela is None:
        print(
            "      [WARN HC] "
            "Nie znaleziono tabeli handicapu."
        )
        return 0

    try:
        tabela.evaluate(
            """
            element => {
                element.setAttribute(
                    "data-scraper-market-lines",
                    "handicap"
                );
            }
            """
        )
    except Exception as blad:
        print(
            f"      [WARN HC] "
            f"Nie oznaczono tabeli linii: {blad}"
        )

    znalezione = []

    rzedy = tabela.locator(
        "tbody > tr"
    )

    for i in range(
        rzedy.count()
    ):
        try:
            tekst = rzedy.nth(
                i
            ).inner_text(
                timeout=1000
            )
        except Exception:
            continue

        match = re.search(
            r"(?:Asian Handicap|"
            r"Games? Handicap|"
            r"Handicap|AH)"
            r"\s*([+-]?\d+(?:[.,]\d+)?)",
            tekst,
            re.IGNORECASE
        )

        if not match:
            continue

        wartosc = (
            match.group(1)
            .replace(",", ".")
        )

        if not czy_linia_polowkowa(
            wartosc
        ):
            print(
                f"      [SKIP HC LINE] "
                f"Pomijam linię całkowitą: "
                f"{wartosc}"
            )
            continue

        if wartosc not in znalezione:
            znalezione.append(
                wartosc
            )

    print(
        f"      [DEBUG HC LINES] "
        f"Znalezione linie: {znalezione}"
    )

    zapisane = 0

    for wartosc in znalezione:
        if not czy_linia_polowkowa(
            wartosc
        ):
            continue

        tabela = znajdz_tabele_hc(
            page_obj
        )
        if tabela is None:
            break
        rzedy = tabela.locator("tbody > tr")
        cel = None
        for i in range(rzedy.count()):
            rzad = rzedy.nth(i)
            try:
                tekst = rzad.inner_text(timeout=1000)
            except Exception:
                continue
            match = re.search(
                r"(?:Asian Handicap|Games? Handicap|Handicap|AH)\s*([+-]?\d+(?:[.,]\d+)?)",
                tekst,
                re.I,
            )
            if match and match.group(1).replace(",", ".") == wartosc:
                cel = rzad
                break
        if cel is None:
            continue

        komorka = cel.locator("td").first

        if not bezpieczne_klikniecie(
            page_obj,
            komorka,
            timeout_ms=5000
        ):
            print(
                f"      [WARN HC] "
                f"Nie udało się rozwinąć "
                f"linii {wartosc}."
            )
            continue

        print(
            f"      [DEBUG HC CLICK] "
            f"Rozwinięto linię {wartosc}."
        )

        page_obj.wait_for_timeout(400)
        kontener_linii = (
            znajdz_tabele_kursow_dla_wiersza(
                page_obj,
                cel,
                wymagane=2,
                timeout_ms=4000
            )
        )

        if kontener_linii is None:
            print(
                f"      [WARN HC] "
                f"Nie znaleziono rozwiniętych kursów "
                f"dla linii {wartosc}."
            )

            try:
                obsluz_baner_cookies(
                    page_obj
                )

                komorka.click(
                    timeout=2000,
                    force=True
                )

                page_obj.wait_for_timeout(
                    500
                )

            except Exception:
                try:
                    komorka.evaluate(
                        """
                        element => element.click()
                        """
                    )

                    page_obj.wait_for_timeout(
                        500
                    )

                except Exception:
                    pass

            continue

        wyniki = parsuj_standardowy_rynek_playwright(
            page_obj,
            2,
            kontener=kontener_linii
        )

        print(
            f"      [DEBUG HC {wartosc}] "
            f"{wyniki}"
        )
        if not czy_linia_polowkowa(
            wartosc
        ):
            print(
                f"      [SKIP HC SAVE] "
                f"Nie zapisuję linii całkowitej: "
                f"{wartosc}"
            )
            continue

        klucz = (
            wartosc
            if wartosc.startswith(
                ("+", "-")
            )
            else f"+{wartosc}"
        )

        znaleziono = False
        for buk, kursy in wyniki.items():
            dane = get_match_data(buk)
            if dane is None:
                continue
            dane["handicap"][klucz] = {"1": str(kursy[0]), "2": str(kursy[1])}
            znaleziono = True
        if znaleziono:
            zapisane += 1
        try:
            obsluz_baner_cookies(
                page_obj
            )

            komorka.click(
                timeout=3000,
                force=True
            )

            page_obj.wait_for_timeout(500)

        except Exception:
            try:
                komorka.evaluate(
                    """
                    element => element.click()
                    """
                )

                page_obj.wait_for_timeout(500)

            except Exception:
                pass
    return zapisane


def bezpieczne_goto(
    page_obj,
    url,
    timeout_ms=45000,
    max_prob=3
):
    ostatni_blad = None

    for proba in range(
        1,
        max_prob + 1
    ):
        try:
            if page_obj.is_closed():
                return (
                    False,
                    None,
                    RuntimeError(
                        "Strona Playwright jest zamknięta."
                    )
                )

            print(
                f"      [GOTO] Próba "
                f"{proba}/{max_prob}: {url}"
            )

            response = page_obj.goto(
                url,
                wait_until="commit",
                timeout=timeout_ms
            )

            try:
                page_obj.wait_for_load_state(
                    "domcontentloaded",
                    timeout=15000
                )
            except PlaywrightTimeoutError:
                pass

            aktualny_url = page_obj.url

            if aktualny_url.startswith(
                "chrome-error://"
            ):
                raise RuntimeError(
                    "Chromium otworzył stronę błędu."
                )

            if (
                response is not None
                and response.status >= 400
            ):
                raise RuntimeError(
                    f"HTTP {response.status}"
                )

            page_obj.wait_for_timeout(
                1500
            )

            return True, response, None

        except Exception as blad:
            ostatni_blad = blad

            print(
                f"      [WARN GOTO] Próba "
                f"{proba}/{max_prob} nieudana: "
                f"{blad}"
            )

            if proba < max_prob:
                opoznienie = proba * 5000

                print(
                    f"      [GOTO] Ponowna próba "
                    f"za {opoznienie // 1000} s."
                )

                page_obj.wait_for_timeout(
                    opoznienie
                )

    return False, None, ostatni_blad


def pobierz_zagranicznych_z_oddsportal():
    proces_zakonczony = False
    vpn_wlaczony = False
    browser = None
    report = None
    wszystkie_mecze = []
    try:
        vpn_on()
        vpn_wlaczony = True
        sprawdz_ip()

        print("-> [ZAGRANICZNI BUKMACHERZY - ODDSPORTAL] START")
        baza_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        output = os.path.join(baza_dir, "data", "zagraniczni.json")
        report_path = os.path.join(
            baza_dir,
            "data",
            "zagraniczni_scrape_report.json"
        )

        report = ScrapeReport(
            scraper_name="zagraniczni",
            report_path=report_path,
            test_mode=TRYB_TESTOWY
        )
        os.makedirs(os.path.dirname(output), exist_ok=True)

        data_dzis = datetime.now()
        dni = {
            (data_dzis + timedelta(days=1)).strftime("%d.%m.%Y"):
                (data_dzis + timedelta(days=1)).strftime("%Y%m%d"),
            (data_dzis + timedelta(days=2)).strftime("%d.%m.%Y"):
                (data_dzis + timedelta(days=2)).strftime("%Y%m%d"),
        }

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=HEADLESS
            )
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )

            def utworz_strone():
                return context.new_page()

            page = utworz_strone()

            for nazwa_sportu, sciezka_sportu in SPORTY.items():
                if TRYB_TESTOWY and SPORT_TESTOWY and nazwa_sportu != SPORT_TESTOWY:
                    continue

                print(f"\n=== SPORT: {nazwa_sportu} ===")
                try:
                    response_ip = requests.get(
                        "https://ipinfo.io/json",
                        timeout=10
                    )

                    response_ip.raise_for_status()

                    aktualny_kraj = response_ip.json().get(
                        "country"
                    )

                    print(
                        f"    [VPN CHECK] "
                        f"Kraj={aktualny_kraj}"
                    )

                    if aktualny_kraj != WYMAGANY_KRAJ_VPN:
                        raise RuntimeError(
                            f"VPN zmienił kraj na "
                            f"{aktualny_kraj}"
                        )

                except Exception as blad:
                    print(
                        f"    [WARN VPN] "
                        f"Problem z połączeniem: {blad}"
                    )
                linki = []
                for dzien, data_url in dni.items():
                    url = f"{BAZOWY_URL}/matches/{sciezka_sportu}/{data_url}/"
                    try:
                        if page.is_closed():
                            page = utworz_strone()

                        ok, response, blad = bezpieczne_goto(
                            page,
                            url,
                            timeout_ms=45000,
                            max_prob=3
                        )

                        if not ok:
                            print(
                                f"    [WARN] Nie udało się "
                                f"załadować listy {dzien}: {blad}"
                            )
                            report.add_error(
                                nazwa_sportu,
                                "list_navigation",
                                blad
                            )

                            try:
                                page.close()
                            except Exception:
                                pass

                            page = utworz_strone()
                            continue

                        page.wait_for_timeout(
                            500
                        )

                        obsluz_baner_cookies(
                            page
                        )

                        page.wait_for_timeout(1000)
                        zebrane = []
                        poprzednia = -1
                        bez_zmiany = 0
                        for _ in range(30):
                            zebrane.extend(
                                pobierz_linki_meczow_z_listy(
                                    page, sciezka_sportu, dzien, os.path.dirname(output)
                                )
                            )
                            mapa = {}
                            for element in zebrane:
                                klucz = (element[0], element[1])
                                if klucz not in mapa or (
                                    mapa[klucz][2] == "00:00" and element[2] != "00:00"
                                ):
                                    mapa[klucz] = element
                            zebrane = list(mapa.values())
                            if len(zebrane) == poprzednia:
                                bez_zmiany += 1
                            else:
                                poprzednia = len(zebrane)
                                bez_zmiany = 0
                            if len(zebrane) > 0 and bez_zmiany >= 3:
                                print(
                                    f"    [INFO] Lista przestała się "
                                    f"powiększać. Zebrano "
                                    f"{len(zebrane)} spotkań."
                                )
                                break
                            if len(zebrane) == 0 and bez_zmiany >= 7:
                                print(
                                    "    [WARN] Po kilku próbach nadal "
                                    "nie znaleziono linków H2H."
                                )
                                break
                            page.mouse.wheel(0, 1000)
                            page.wait_for_timeout(600)
                        linki.extend(zebrane)
                        print(f"    [INFO] {dzien}: {len(zebrane)} meczów")
                    except Exception as blad:
                        print(
                            f"    [WARN] Lista {dzien}: "
                            f"{blad}"
                        )
                        report.add_error(
                            nazwa_sportu,
                            "list_navigation",
                            blad
                        )

                        try:
                            if not page.is_closed():
                                page.close()
                        except Exception:
                            pass

                        page = utworz_strone()

                        time.sleep(5)

                mapa = {}
                for element in linki:
                    klucz = (element[0], element[1])
                    if klucz not in mapa or (mapa[klucz][2] == "00:00" and element[2] != "00:00"):
                        mapa[klucz] = element
                unikalne = list(
                    mapa.values()
                )

                report.add_found(
                    nazwa_sportu,
                    len(unikalne)
                )

                if not unikalne:
                    report.add_error(
                        nazwa_sportu,
                        "list_navigation",
                        (
                            "Nie znaleziono żadnego wydarzenia "
                            "w obu sprawdzanych dniach."
                        )
                    )

                if TRYB_TESTOWY:
                    unikalne = unikalne[
                        :LIMIT_MECZOW_TESTOWYCH
                    ]


                for idx, (link, dzien, godzina) in enumerate(unikalne, 1):

                    report.add_attempted(
                        nazwa_sportu
                    )

                    liczba_rekordow_przed = len(
                        wszystkie_mecze
                    )
                    try:
                        if page.is_closed():
                            page = utworz_strone()
                        print(f"\n[{idx}/{len(unikalne)}] {link}")
                        ok, response, blad = bezpieczne_goto(
                            page,
                            link
                        )

                        if not ok:
                            print(
                                f"    [WARN] Pomijam mecz po "
                                f"nieudanych próbach: {blad}"
                            )

                            report.add_error(
                                nazwa_sportu,
                                "match_navigation",
                                blad
                            )

                            try:
                                if not page.is_closed():
                                    page.close()
                            except Exception:
                                pass

                            page = utworz_strone()

                            time.sleep(5)
                            continue


                        if (
                            response is not None
                            and response.status >= 400
                        ):
                            report.add_error(
                                nazwa_sportu,
                                "http_error",
                                f"HTTP {response.status}"
                            )
                            continue

                        page.wait_for_timeout(500)

                        obsluz_baner_cookies(
                            page
                        )

                        page.wait_for_timeout(1000)
                        tabela_ok, powod = czekaj_na_tabele_kursow(
                            page
                        )

                        if not tabela_ok:
                            print(
                                f"      [WARN] Nie rozpoznano "
                                f"tabeli kursów. Powód: {powod}"
                            )

                            if powod == "blad_ajax":
                                report.add_error(
                                    nazwa_sportu,
                                    "ajax_error",
                                    powod
                                )
                            else:
                                report.add_error(
                                    nazwa_sportu,
                                    "table_timeout",
                                    powod
                                )

                            zapisz_debug_html(
                                page,
                                os.path.dirname(output),
                                f"zagraniczni_brak_tabeli_"
                                f"{sciezka_sportu}_{idx}"
                            )

                            continue

                        report.add_table_loaded(
                            nazwa_sportu
                        )

                        soup = BeautifulSoup(page.content(), "html.parser")
                        h1 = soup.find("h1")

                        if not h1:
                            report.add_error(
                                nazwa_sportu,
                                "missing_title",
                                link
                            )
                            continue
                        title = wyczysc_tytul_meczu(h1.get_text(" ", strip=True))
                        if " - " in title:
                            home, away = title.split(" - ", 1)
                        else:
                            home, away = title, "Brak"

                        match_data = {}

                        def get_match_data(bukmacher):
                            bukmacher = normalizuj_nazwe_bukmachera(
                                bukmacher
                            )

                            if not czy_poprawna_nazwa_bukmachera(
                                bukmacher
                            ):
                                print(
                                    f"      [WARN BOOKMAKER] "
                                    f"Odrzucono nazwę: "
                                    f"{bukmacher!r}"
                                )

                                return None

                            if bukmacher not in match_data:
                                match_data[bukmacher] = {
                                    "id": (
                                        f"{bezpieczny_id(bukmacher)}_"
                                        f"{bezpieczny_id(home)}_"
                                        f"{bezpieczny_id(away)}"
                                    ),
                                    "mecz": (
                                        f"{home.strip()} - "
                                        f"{away.strip()}"
                                    ),
                                    "dyscyplina": nazwa_sportu,
                                    "dzien": dzien,
                                    "godzina": godzina,
                                    "home": home.strip(),
                                    "away": away.strip(),
                                    "bukmacher": bukmacher,
                                    "kurs_1": None,
                                    "kurs_X": None,
                                    "kurs_2": None,
                                    "btts": {},
                                    "podwojna_szansa": {},
                                    "over_under": {},
                                    "handicap": {}
                                }

                            return match_data[bukmacher]

                        glowne = pobierz_glowny_rynek(page, nazwa_sportu)
                        for buk, kursy in glowne.items():
                            d = get_match_data(buk)

                            if d is None:
                                continue

                            if (
                                nazwa_sportu in {
                                    "Piłka nożna",
                                    "Piłka ręczna"
                                }
                                and len(kursy) >= 3
                            ):
                                d["kurs_1"] = kursy[0]
                                d["kurs_X"] = kursy[1]
                                d["kurs_2"] = kursy[2]

                            elif (
                                nazwa_sportu in {
                                    "Koszykówka",
                                    "Tenis",
                                    "Boks"
                                }
                                and len(kursy) >= 2
                            ):
                                d["kurs_1"] = kursy[0]
                                d["kurs_X"] = None
                                d["kurs_2"] = kursy[1]

                        if nazwa_sportu == "Piłka nożna":
                            if wejdz_w_zakladke(
                                page,
                                "Both Teams to Score"
                            ):
                                tabela_btts = znajdz_widoczna_tabele_z_kursami(
                                    page,
                                    2
                                )

                                if tabela_btts is not None:
                                    wyniki_btts = (
                                        parsuj_standardowy_rynek_playwright(
                                            page,
                                            2,
                                            kontener=tabela_btts
                                        )
                                    )

                                    for buk, kursy in wyniki_btts.items():
                                        d = get_match_data(
                                            buk
                                        )

                                        if d is None:
                                            continue

                                        d["btts"] = {
                                            "tak": str(kursy[0]),
                                            "nie": str(kursy[1])
                                        }


                            if wejdz_w_zakladke(
                                page,
                                "Double Chance"
                            ):
                                tabela_dc = (
                                    znajdz_widoczna_tabele_z_kursami(
                                        page,
                                        3
                                    )
                                )

                                if tabela_dc is not None:
                                    wyniki_dc = (
                                        parsuj_standardowy_rynek_playwright(
                                            page,
                                            3,
                                            kontener=tabela_dc
                                        )
                                    )

                                    for buk, kursy in wyniki_dc.items():
                                        d = get_match_data(
                                            buk
                                        )

                                        if d is None:
                                            continue

                                        d["podwojna_szansa"] = {
                                            "1X": str(kursy[0]),
                                            "12": str(kursy[1]),
                                            "X2": str(kursy[2])
                                        }

                        if nazwa_sportu in {"Piłka nożna", "Koszykówka", "Tenis"}:
                            if wejdz_w_zakladke(page, "Over/Under"):
                                pobierz_over_under(page, get_match_data)

                        if nazwa_sportu in {
                            "Koszykówka",
                            "Tenis"
                        }:
                            if wejdz_w_zakladke(
                                page,
                                "Asian Handicap"
                            ):
                                aktywny_hc = re.sub(
                                    r"\s+",
                                    " ",
                                    pobierz_aktywny_rynek(
                                        page
                                    ).lower()
                                ).strip()

                                dozwolone_hc = {
                                    "asian handicap",
                                    "handicap",
                                    "handicap azjatycki",
                                    "games handicap",
                                    "game handicap"
                                }

                                if aktywny_hc not in dozwolone_hc:
                                    print(
                                        f"      [WARN HC] "
                                        f"Niewłaściwy aktywny rynek: "
                                        f"{aktywny_hc!r}"
                                    )
                                else:
                                    pobierz_asian_handicap(
                                        page,
                                        get_match_data
                                    )

                        for nazwa in list(
                            match_data.keys()
                        ):
                            if not czy_poprawna_nazwa_bukmachera(
                                nazwa
                            ):
                                print(
                                    f"      [WARN BOOKMAKER] "
                                    f"Usuwam błędny rekord: "
                                    f"{nazwa!r}"
                                )

                                del match_data[nazwa]

                        for dane in match_data.values():
                            if not czy_poprawna_nazwa_bukmachera(
                                dane.get("bukmacher")
                            ):
                                continue

                            ma_glowne = (
                                isinstance(
                                    dane["kurs_1"],
                                    (int, float)
                                )
                                and dane["kurs_1"] > 0
                                and isinstance(
                                    dane["kurs_2"],
                                    (int, float)
                                )
                                and dane["kurs_2"] > 0
                            )

                            ma_inne = any([
                                dane["btts"],
                                dane["podwojna_szansa"],
                                dane["over_under"],
                                dane["handicap"]
                            ])

                            if ma_glowne or ma_inne:
                                wszystkie_mecze.append(
                                    dane
                                )

                        liczba_rekordow_po = len(
                            wszystkie_mecze
                        )

                        dodane_rekordy = (
                            liczba_rekordow_po
                            - liczba_rekordow_przed
                        )

                        if dodane_rekordy > 0:
                            report.add_saved(
                                nazwa_sportu,
                                dodane_rekordy
                            )
                        else:
                            report.add_error(
                                nazwa_sportu,
                                "no_records",
                                link
                            )

                        with open(output, "w", encoding="utf-8") as plik:
                            json.dump(wszystkie_mecze, plik, indent=4, ensure_ascii=False)
                        print(f"      [CHECKPOINT] {len(wszystkie_mecze)} rekordów")
                        page.wait_for_timeout(
                            500
                        )
                        if idx % 20 == 0:
                            print(
                                "      [PAUZA] 15 sekund "
                                "po 20 meczach."
                            )

                            page.wait_for_timeout(
                                15000
                            )
                    except Exception as blad:
                        print(
                            f"    [WARN] Mecz: {blad}"
                        )
                        report.add_error(
                            nazwa_sportu,
                            "unexpected",
                            blad
                        )

                        try:
                            if not page.is_closed():
                                page.close()
                        except Exception:
                            pass

                        page = utworz_strone()

                        time.sleep(5)

            with open(output, "w", encoding="utf-8") as plik:
                json.dump(wszystkie_mecze, plik, indent=4, ensure_ascii=False)
            print(f"\n[OK] Zapisano {len(wszystkie_mecze)} rekordów do {output}")
            proces_zakonczony = True

    finally:
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass

        if report is not None:
            try:
                report.finish(
                    status=(
                        "completed"
                        if proces_zakonczony
                        else "failed"
                    ),
                    records_saved=len(
                        wszystkie_mecze
                    )
                )

                print(
                    f"[REPORT] Zapisano raport: "
                    f"{report.report_path}"
                )

            except Exception as blad_raportu:
                print(
                    f"[REPORT] Nie udało się "
                    f"zapisać raportu: "
                    f"{blad_raportu}"
                )

        if vpn_wlaczony:
            vpn_off()


if __name__ == "__main__":
    pobierz_zagranicznych_z_oddsportal()
