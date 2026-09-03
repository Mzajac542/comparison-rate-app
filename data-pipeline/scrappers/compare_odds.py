import json
import os
import re
import requests
import unicodedata
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv


print(
    "### ŁĄCZENIE POLSKICH I ZAGRANICZNYCH "
    "BUKMACHERÓW ###"
)


# ============================================================
# ŚCIEŻKI
# ============================================================


DATA_PIPELINE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

ENV_PATH = os.path.join(
    DATA_PIPELINE_DIR,
    ".env"
)

load_dotenv(
    dotenv_path=ENV_PATH
)

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    )
)

DATA_DIR = os.path.join(
    BASE_DIR,
    "data"
)

os.makedirs(
    DATA_DIR,
    exist_ok=True
)

PLIK_POLSCY = os.path.join(
    DATA_DIR,
    "polscy_bukmacherzy.json"
)

PLIK_ZAGRANICZNI = os.path.join(
    DATA_DIR,
    "zagraniczni.json"
)

PLIK_WYNIKOWY = os.path.join(
    DATA_DIR,
    "wszystkie_mecze_laczni.json"
)

PLIK_HISTORII_DISCORD = os.path.join(
    DATA_DIR,
    "discord_alerts_history.json"
)


# ============================================================
# USTAWIENIA
# ============================================================

STREFA_PL = ZoneInfo(
    "Europe/Warsaw"
)

TERAZ = datetime.now(
    STREFA_PL
)

DZIS_STR = TERAZ.strftime(
    "%Y-%m-%d"
)

JUTRO_STR = (
    TERAZ + timedelta(days=1)
).strftime(
    "%Y-%m-%d"
)

POJUTRZE_STR = (
    TERAZ + timedelta(days=2)
).strftime(
    "%Y-%m-%d"
)

DOZWOLONE_DATY = {
    JUTRO_STR,
    POJUTRZE_STR
}

DISCORD_WEBHOOK_URL = os.getenv(
    "DISCORD_ODDS_WEBHOOK_URL",
    ""
).strip()

if not DISCORD_WEBHOOK_URL:
    raise RuntimeError(
        "Brak DISCORD_ODDS_WEBHOOK_URL "
        "w pliku data-pipeline/.env."
    )

if not DISCORD_WEBHOOK_URL.startswith(
    "https://discord.com/api/webhooks/"
):
    raise RuntimeError(
        "DISCORD_ODDS_WEBHOOK_URL nie wygląda "
        "jak prawidłowy webhook Discorda."
    )

MIN_EDGE = 0.5
DISCORD_DELAY_SECONDS = 3.0
DISCORD_MAX_RETRIES = 5
DISCORD_RETRY_BUFFER_SECONDS = 0.5


# Jeżeli ustawisz False, skrypt nie ograniczy wyników
# wyłącznie do jutra i pojutrza.
TYLKO_JUTRO_I_POJUTRZE = True

# ============================================================
# SZUKANIE OKAZJI I WYSYŁANIE NA DISCORD
# ============================================================

def wczytaj_historie_discord():
    if not os.path.exists(
        PLIK_HISTORII_DISCORD
    ):
        return {
            "data": DZIS_STR,
            "okazje": {}
        }

    try:
        with open(
            PLIK_HISTORII_DISCORD,
            "r",
            encoding="utf-8"
        ) as file:
            historia = json.load(file)

    except (
        OSError,
        json.JSONDecodeError
    ) as error:
        print(
            "[WARN] Nie udało się odczytać "
            f"historii Discorda: {error}"
        )

        return {
            "data": DZIS_STR,
            "okazje": {}
        }

    if not isinstance(historia, dict):
        return {
            "data": DZIS_STR,
            "okazje": {}
        }


    if historia.get("data") != DZIS_STR:
        print(
            "[INFO] Rozpoczął się nowy dzień. "
            "Resetuję historię alertów Discorda."
        )

        return {
            "data": DZIS_STR,
            "okazje": {}
        }

    okazje = historia.get(
        "okazje",
        {}
    )

    if not isinstance(okazje, dict):
        okazje = {}

    return {
        "data": DZIS_STR,
        "okazje": okazje
    }


def zapisz_historie_discord(historia):
    temporary_path = (
        PLIK_HISTORII_DISCORD
        + ".tmp"
    )

    try:
        with open(
            temporary_path,
            "w",
            encoding="utf-8"
        ) as file:
            json.dump(
                historia,
                file,
                indent=4,
                ensure_ascii=False
            )

        os.replace(
            temporary_path,
            PLIK_HISTORII_DISCORD
        )

    except OSError as error:
        print(
            "[ERROR] Nie udało się zapisać "
            f"historii Discorda: {error}"
        )

        try:
            if os.path.exists(
                temporary_path
            ):
                os.remove(
                    temporary_path
                )
        except OSError:
            pass


def normalizuj_klucz_alertu(value):
    value = str(
        value or ""
    ).lower().strip()

    value = re.sub(
        r"\s+",
        " ",
        value
    )

    return value


def utworz_klucz_alertu(okazja):
    elementy = [
        okazja.get("mecz", ""),
        okazja.get("data", ""),
        okazja.get("sport", ""),
        okazja.get("rynek", ""),
        okazja.get("wybor", ""),
        okazja.get("rodzaj", ""),
        okazja.get("niski_buk", ""),
        okazja.get("wysoki_buk", "")
    ]

    return "||".join(
        normalizuj_klucz_alertu(element)
        for element in elementy
    )


def utworz_podpis_kursow(okazja):
    niski_kurs = float(
        okazja.get(
            "niski_kurs",
            0
        )
    )

    wysoki_kurs = float(
        okazja.get(
            "wysoki_kurs",
            0
        )
    )

    edge = float(
        okazja.get(
            "edge",
            0
        )
    )

    return (
        f"{niski_kurs:.4f}|"
        f"{wysoki_kurs:.4f}|"
        f"{edge:.4f}"
    )


def wyslij_naglowek_discord(
    webhook_url,
    liczba_okazji
):
    czas_wysylki = datetime.now(
        STREFA_PL
    )

    data_wysylki = czas_wysylki.strftime(
        "%d.%m.%Y"
    )

    godzina_wysylki = czas_wysylki.strftime(
        "%H:%M:%S"
    )

    embed = {
        "title": "📊 Nowa aktualizacja okazji",
        "color": 3447003,
        "description": (
            "Rozpoczynam wysyłanie aktualnych "
            "okazji kursowych."
        ),
        "fields": [
            {
                "name": "📅 Data",
                "value": data_wysylki,
                "inline": True
            },
            {
                "name": "🕒 Godzina",
                "value": godzina_wysylki,
                "inline": True
            },
            {
                "name": "🔥 Liczba okazji",
                "value": str(
                    liczba_okazji
                ),
                "inline": True
            }
        ],
        "footer": {
            "text": (
                "Comparing Rates • początek aktualizacji"
            )
        },
        "timestamp": czas_wysylki.isoformat()
    }

    for numer_proby in range(
        1,
        DISCORD_MAX_RETRIES + 1
    ):
        try:
            response = requests.post(
                webhook_url,
                json={
                    "embeds": [
                        embed
                    ]
                },
                timeout=30
            )

            if response.status_code == 429:
                try:
                    response_data = (
                        response.json()
                    )
                except ValueError:
                    response_data = {}

                retry_after = response_data.get(
                    "retry_after",
                    DISCORD_DELAY_SECONDS
                )

                try:
                    retry_after = float(
                        retry_after
                    )
                except (
                    TypeError,
                    ValueError
                ):
                    retry_after = (
                        DISCORD_DELAY_SECONDS
                    )

                wait_seconds = max(
                    retry_after
                    + DISCORD_RETRY_BUFFER_SECONDS,
                    1.0
                )

                print(
                    "[RATE LIMIT] Nagłówek Discorda. "
                    f"Czekam {wait_seconds:.3f} s."
                )

                time.sleep(
                    wait_seconds
                )

                continue

            response.raise_for_status()

            print(
                "[OK] Wysłano nagłówek aktualizacji "
                f"dla {liczba_okazji} okazji."
            )

            return True

        except requests.RequestException as error:
            print(
                "[ERROR] Nie udało się wysłać "
                "nagłówka aktualizacji. "
                f"Próba {numer_proby}/"
                f"{DISCORD_MAX_RETRIES}: {error}"
            )

            if (
                numer_proby
                < DISCORD_MAX_RETRIES
            ):
                wait_seconds = min(
                    2 ** numer_proby,
                    30
                )

                time.sleep(
                    wait_seconds
                )

    print(
        "[ERROR] Nagłówek aktualizacji "
        "nie został wysłany."
    )

    return False


def znajdz_i_wyslij_okazje(
    matches,
    webhook_url,
    min_edge=0.5
):
    if not webhook_url:
        print(
            "[WARN] Brak DISCORD_WEBHOOK_URL, "
            "pomijam wysyłanie okazji."
        )
        return

    if not webhook_url.startswith(
        "https://discord.com/api/webhooks/"
    ):
        print(
            "[ERROR] Nieprawidłowy adres webhooka Discord."
        )
        return

    historia_discord = (
        wczytaj_historie_discord()
    )

    wyslane_okazje = historia_discord[
        "okazje"
    ]

    okazje = []

    for match in matches:
        mecz_nazwa = match.get(
            "mecz",
            "Nieznany mecz"
        )

        sport = match.get(
            "dyscyplina",
            "Inne"
        )

        data_str = (
            f"{match.get('dzien', '')} "
            f"{match.get('godzina', '')}"
        ).strip()

        # Struktura:
        # odds_map[rynek][wybor] = [
        #     (bukmacher, typ_bukmachera, kurs)
        # ]
        odds_map = {}

        for bookie in match.get(
            "bukmacherzy",
            []
        ):
            nazwa_buka = str(
                bookie.get(
                    "nazwa",
                    "Nieznany"
                )
            ).strip()

            typ_buka = bookie.get(
                "typ",
                ""
            )

            # Zabezpieczenie na wypadek braku pola "typ".
            if typ_buka not in {
                "polski",
                "zagraniczny"
            }:
                typ_buka = bookie_type(
                    nazwa_buka,
                    ""
                )

            kursy = bookie.get(
                "kursy",
                {}
            )

            if not isinstance(
                kursy,
                dict
            ):
                continue

            for rynek, wybory in kursy.items():
                if not isinstance(
                    wybory,
                    dict
                ):
                    continue

                # Rynki zagnieżdżone:
                # over_under -> linia -> over/under
                # handicap -> linia -> 1/2
                if rynek in {
                    "over_under",
                    "handicap"
                }:
                    for linia, linia_wybory in wybory.items():
                        if not isinstance(
                            linia_wybory,
                            dict
                        ):
                            continue

                        rynek_linia = (
                            f"{rynek} {linia}"
                        )

                        odds_map.setdefault(
                            rynek_linia,
                            {}
                        )

                        for wybor, kurs in linia_wybory.items():
                            poprawny_kurs = clean_odds(
                                kurs
                            )

                            if poprawny_kurs is None:
                                continue

                            odds_map[
                                rynek_linia
                            ].setdefault(
                                wybor,
                                []
                            )

                            odds_map[
                                rynek_linia
                            ][wybor].append(
                                (
                                    nazwa_buka,
                                    typ_buka,
                                    poprawny_kurs
                                )
                            )

                # Rynki zwykłe:
                # 1x2, BTTS, podwójna szansa
                else:
                    odds_map.setdefault(
                        rynek,
                        {}
                    )

                    for wybor, kurs in wybory.items():
                        poprawny_kurs = clean_odds(
                            kurs
                        )

                        if poprawny_kurs is None:
                            continue

                        odds_map[
                            rynek
                        ].setdefault(
                            wybor,
                            []
                        )

                        odds_map[
                            rynek
                        ][wybor].append(
                            (
                                nazwa_buka,
                                typ_buka,
                                poprawny_kurs
                            )
                        )

        # ====================================================
        # WERYFIKACJA RÓŻNIC KURSOWYCH
        # ====================================================

        for rynek, wybory in odds_map.items():
            for wybor, lista_kursow in wybory.items():
                polskie_kursy = [
                    wpis
                    for wpis in lista_kursow
                    if wpis[1] == "polski"
                ]

                zagraniczne_kursy = [
                    wpis
                    for wpis in lista_kursow
                    if wpis[1] == "zagraniczny"
                ]

                polskie_kursy.sort(
                    key=lambda wpis: wpis[2]
                )

                zagraniczne_kursy.sort(
                    key=lambda wpis: wpis[2]
                )

                # ============================================
                # 1. POLSKI KONTRA ZAGRANICZNY
                #
                # Alert tylko wtedy, gdy polski bukmacher
                # ma kurs wyższy od zagranicznego.
                # Zagraniczny kontra zagraniczny jest pomijany.
                # ============================================

                if (
                    polskie_kursy
                    and zagraniczne_kursy
                ):
                    najlepszy_polski = max(
                        polskie_kursy,
                        key=lambda wpis: wpis[2]
                    )

                    najnizszy_zagraniczny = min(
                        zagraniczne_kursy,
                        key=lambda wpis: wpis[2]
                    )

                    polski_buk = najlepszy_polski[0]
                    polski_kurs = najlepszy_polski[2]

                    zagraniczny_buk = (
                        najnizszy_zagraniczny[0]
                    )

                    zagraniczny_kurs = (
                        najnizszy_zagraniczny[2]
                    )

                    edge = (
                        polski_kurs
                        - zagraniczny_kurs
                    )

                    if edge >= min_edge:
                        okazje.append({
                            "mecz": mecz_nazwa,
                            "sport": sport,
                            "data": data_str,
                            "rynek": rynek,
                            "wybor": wybor,
                            "rodzaj": (
                                "Polski vs zagraniczny"
                            ),
                            "niski_buk": zagraniczny_buk,
                            "niski_typ": "zagraniczny",
                            "niski_kurs": zagraniczny_kurs,
                            "wysoki_buk": polski_buk,
                            "wysoki_typ": "polski",
                            "wysoki_kurs": polski_kurs,
                            "edge": edge
                        })

                # ============================================
                # 2. POLSKI KONTRA POLSKI
                #
                # Muszą istnieć przynajmniej dwa różne
                # polskie bukmacherzy.
                # ============================================

                if len(polskie_kursy) >= 2:
                    najnizszy_polski = min(
                        polskie_kursy,
                        key=lambda wpis: wpis[2]
                    )

                    najwyzszy_polski = max(
                        polskie_kursy,
                        key=lambda wpis: wpis[2]
                    )

                    niski_buk = najnizszy_polski[0]
                    niski_kurs = najnizszy_polski[2]

                    wysoki_buk = najwyzszy_polski[0]
                    wysoki_kurs = najwyzszy_polski[2]

                    edge = (
                        wysoki_kurs
                        - niski_kurs
                    )

                    if (
                        niski_buk != wysoki_buk
                        and edge >= min_edge
                    ):
                        okazje.append({
                            "mecz": mecz_nazwa,
                            "sport": sport,
                            "data": data_str,
                            "rynek": rynek,
                            "wybor": wybor,
                            "rodzaj": (
                                "Polski vs polski"
                            ),
                            "niski_buk": niski_buk,
                            "niski_typ": "polski",
                            "niski_kurs": niski_kurs,
                            "wysoki_buk": wysoki_buk,
                            "wysoki_typ": "polski",
                            "wysoki_kurs": wysoki_kurs,
                            "edge": edge
                        })

    # Największe różnice będą wysyłane jako pierwsze.
    okazje.sort(
        key=lambda okazja: okazja["edge"],
        reverse=True
    )

    wszystkie_okazje_count = len(
        okazje
    )

    nowe_lub_zmienione_okazje = []
    pominiete_okazje_count = 0

    for okazja in okazje:
        klucz_alertu = utworz_klucz_alertu(
            okazja
        )

        podpis_kursow = utworz_podpis_kursow(
            okazja
        )

        poprzedni_podpis = wyslane_okazje.get(
            klucz_alertu
        )

        if poprzedni_podpis == podpis_kursow:
            pominiete_okazje_count += 1
            continue

        okazja["_klucz_alertu"] = (
            klucz_alertu
        )

        okazja["_podpis_kursow"] = (
            podpis_kursow
        )

        nowe_lub_zmienione_okazje.append(
            okazja
        )

    okazje = nowe_lub_zmienione_okazje

    print(
        f"[INFO] Wszystkie znalezione okazje: "
        f"{wszystkie_okazje_count}"
    )

    print(
        f"[INFO] Pominięte bez zmian: "
        f"{pominiete_okazje_count}"
    )

    print(
        f"[INFO] Nowe lub zmienione: "
        f"{len(okazje)}"
    )

    if not okazje:
        print(
            "[INFO] Wszystkie dzisiejsze okazje "
            "zostały już wcześniej wysłane "
            "z identycznymi kursami."
        )

        return

    print(
        f"[INFO] Do wysłania pozostało "
        f"{len(okazje)} nowych lub "
        f"zmienionych okazji."
    )

    naglowek_wyslany = wyslij_naglowek_discord(
        webhook_url,
        len(okazje)
    )

    if naglowek_wyslany:
        print(
            "[WAIT] Krótka przerwa po wysłaniu "
            "nagłówka aktualizacji."
        )

        time.sleep(
            DISCORD_DELAY_SECONDS
        )

    # Discord przyjmuje maksymalnie 10 embedów
    # w jednym żądaniu.
    paczki = [
        okazje[index:index + 10]
        for index in range(
            0,
            len(okazje),
            10
        )
    ]

    for numer_paczki, paczka in enumerate(
        paczki,
        start=1
    ):
        embeds = []

        for okazja in paczka:
            tytul = (
                "🔥 Okazja! | "
                f"Różnica = {okazja['edge']:.2f}"
            )

            kolor = 3447003

            embeds.append({
                "title": tytul,
                "color": kolor,
                "description": (
                    f"**{okazja['mecz']}**\n"
                    f"{okazja['sport']} | "
                    f"{okazja['data']}"
                ),
                "fields": [
                    {
                        "name": "Wytypowano",
                        "value": (
                            f"Rynek: **{okazja['rynek']}** | "
                            f"Typ: **{okazja['wybor']}**"
                        ),
                        "inline": False
                    },
                    {
                        "name": (
                            f"{okazja['niski_buk'].upper()} "
                            f"({okazja['niski_typ']})"
                        ),
                        "value": (
                            f"{okazja['niski_kurs']:.2f}"
                        ),
                        "inline": True
                    },
                    {
                        "name": "➡",
                        "value": " ",
                        "inline": True
                    },
                    {
                        "name": (
                            f"{okazja['wysoki_buk'].upper()} "
                            f"({okazja['wysoki_typ']})"
                        ),
                        "value": (
                            f"**{okazja['wysoki_kurs']:.2f}**\n"
                            f"Różnica: **+{okazja['edge']:.2f}**"
                        ),
                        "inline": True
                    },
                    {
                        "name": "Rodzaj porównania",
                        "value": okazja["rodzaj"],
                        "inline": False
                    }
                ]
            })

        paczka_wyslana = False

        for numer_proby in range(
            1,
            DISCORD_MAX_RETRIES + 1
        ):
            try:
                response = requests.post(
                    webhook_url,
                    json={
                        "embeds": embeds
                    },
                    timeout=30
                )

                if response.status_code == 429:
                    try:
                        response_data = response.json()

                    except ValueError:
                        response_data = {}

                    retry_after = response_data.get(
                        "retry_after",
                        DISCORD_DELAY_SECONDS
                    )

                    try:
                        retry_after = float(
                            retry_after
                        )

                    except (
                        TypeError,
                        ValueError
                    ):
                        retry_after = (
                            DISCORD_DELAY_SECONDS
                        )

                    wait_seconds = max(
                        retry_after
                        + DISCORD_RETRY_BUFFER_SECONDS,
                        1.0
                    )

                    print(
                        f"[RATE LIMIT] Paczka "
                        f"{numer_paczki}/{len(paczki)}. "
                        f"Discord wymaga przerwy "
                        f"{retry_after:.3f} s. "
                        f"Czekam {wait_seconds:.3f} s. "
                        f"Próba {numer_proby}/"
                        f"{DISCORD_MAX_RETRIES}."
                    )

                    time.sleep(
                        wait_seconds
                    )

                    continue

                response.raise_for_status()

                print(
                    f"[OK] Wysłano paczkę "
                    f"{numer_paczki}/{len(paczki)} "
                    f"zawierającą "
                    f"{len(embeds)} alertów."
                )

                paczka_wyslana = True

                for wyslana_okazja in paczka:
                    klucz_alertu = (
                        wyslana_okazja.get(
                            "_klucz_alertu"
                        )
                    )

                    podpis_kursow = (
                        wyslana_okazja.get(
                            "_podpis_kursow"
                        )
                    )

                    if (
                        klucz_alertu
                        and podpis_kursow
                    ):
                        wyslane_okazje[
                            klucz_alertu
                        ] = podpis_kursow

                historia_discord[
                    "data"
                ] = DZIS_STR

                historia_discord[
                    "okazje"
                ] = wyslane_okazje

                zapisz_historie_discord(
                    historia_discord
                )

                break

            except requests.RequestException as error:
                status_code = getattr(
                    error.response,
                    "status_code",
                    None
                )

                response_text = getattr(
                    error.response,
                    "text",
                    ""
                )

                print(
                    f"[ERROR] Błąd wysyłki paczki "
                    f"{numer_paczki}, próba "
                    f"{numer_proby}/"
                    f"{DISCORD_MAX_RETRIES}: "
                    f"{error}"
                )

                if status_code is not None:
                    print(
                        f"[ERROR] Kod odpowiedzi "
                        f"Discorda: {status_code}"
                    )

                if response_text:
                    print(
                        f"[ERROR] Odpowiedź Discorda: "
                        f"{response_text[:500]}"
                    )

                if (
                    numer_proby
                    < DISCORD_MAX_RETRIES
                ):
                    wait_seconds = min(
                        2 ** numer_proby,
                        30
                    )

                    print(
                        f"[RETRY] Ponawiam tę samą "
                        f"paczkę za {wait_seconds} s."
                    )

                    time.sleep(
                        wait_seconds
                    )

        if not paczka_wyslana:
            print(
                f"[ERROR] Nie udało się wysłać "
                f"paczki "
                f"{numer_paczki}/{len(paczki)} "
                f"po "
                f"{DISCORD_MAX_RETRIES} próbach."
            )

        if numer_paczki < len(paczki):
            print(
                f"[WAIT] Przerwa "
                f"{DISCORD_DELAY_SECONDS:.1f} s "
                f"przed kolejną paczką."
            )

            time.sleep(
                DISCORD_DELAY_SECONDS
            )


# ============================================================
# TŁUMACZENIA I NORMALIZACJA
# ============================================================

TRANSLATIONS = {
    "canada": "kanada",
    "ireland": "irlandia",
    "germany": "niemcy",
    "italy": "wlochy",
    "france": "francja",
    "spain": "hiszpania",
    "poland": "polska",
    "usa": "usa",
    "netherlands": "holandia",
    "belgium": "belgia",
    "switzerland": "szwajcaria",
    "austria": "austria",
    "denmark": "dania",
    "norway": "norwegia",
    "sweden": "szwecja",
    "finland": "finlandia",
    "turkey": "turcja",
    "greece": "grecja",
    "brazil": "brazylia",
    "argentina": "argentyna"
}


POLSCY_BUKMACHERZY = {
    "sts",
    "sts.pl",
    "betclic",
    "betclic.pl",
    "fortuna",
    "fortuna.pl",
    "efortuna",
    "efortuna.pl",
    "superbet",
    "superbet.pl",
    "betfan",
    "betfan.pl",
    "lvbet",
    "lvbet.pl",
    "lv bet",
    "lv bet.pl",
    "fuksiarz",
    "fuksiarz.pl",
    "etoto",
    "etoto.pl",
    "goplusbet",
    "totalbet",
    "betters"
}


MARKER_MAP = {
    "rezerwy": "reserves",
    "rezerwa": "reserves",
    "reserves": "reserves",
    "res": "reserves",
    "ii": "reserves",
    "b": "reserves",
    "r": "reserves",
    "2": "reserves",

    "kobiety": "women",
    "kobiet": "women",
    "women": "women",
    "k": "women",
    "w": "women",

    "u19": "u19",
    "sub19": "u19",

    "u20": "u20",
    "sub20": "u20",

    "u21": "u21",
    "sub21": "u21",

    "u23": "u23",
    "sub23": "u23",

    "esport": "esport",
    "cyber": "esport"
}


STOP_WORDS = {
    "bk",
    "fc",
    "bc",
    "sc",
    "hc",
    "ks",
    "cez",
    "gks",
    "cf",
    "ac",
    "as"
}


def remove_accents(value):
    value = str(
        value or ""
    )

    normalized = unicodedata.normalize(
        "NFKD",
        value
    )

    return "".join(
        character
        for character in normalized
        if not unicodedata.combining(
            character
        )
    )


def normalize_text(value):
    value = remove_accents(
        value
    ).lower()

    value = re.sub(
        r"[^a-z0-9 ]+",
        " ",
        value
    )

    value = re.sub(
        r"\s+",
        " ",
        value
    )

    return value.strip()


def bezpieczny_id(value):
    value = normalize_text(
        value
    )

    value = re.sub(
        r"[^a-z0-9]+",
        "_",
        value
    )

    return value.strip("_")


def normalize_date(value):
    if not value:
        return ""

    value = str(
        value
    ).strip()

    value = value.replace(
        "/",
        "-"
    ).replace(
        ".",
        "-"
    )

    formats = [
        "%d-%m-%Y",
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S"
    ]

    for date_format in formats:
        try:
            result = datetime.strptime(
                value[:19],
                date_format
            )

            return result.strftime(
                "%Y-%m-%d"
            )

        except ValueError:
            continue

    match = re.search(
        r"\b(\d{4})-(\d{2})-(\d{2})\b",
        value
    )

    if match:
        return match.group(0)

    return ""


def normalize_time(value):
    value = str(
        value or ""
    ).strip()

    match = re.search(
        r"\b([01]\d|2[0-3]):[0-5]\d\b",
        value
    )

    if match:
        return match.group(0)

    return "00:00"


def clean_odds(value):
    if value is None:
        return None

    if isinstance(
        value,
        bool
    ):
        return None

    value = str(
        value
    ).strip()

    if value.lower() in {
        "",
        "-",
        "none",
        "null",
        "n/a"
    }:
        return None

    value = value.replace(
        ",",
        "."
    )

    try:
        result = float(
            value
        )
    except ValueError:
        return None

    if result <= 0:
        return None

    return result


def normalize_sport(value):
    normalized = normalize_text(
        value
    )

    if (
        "pilka nozna" in normalized
        or "football" in normalized
        or "soccer" in normalized
    ):
        return "⚽ Piłka nożna"

    if (
        "koszykowka" in normalized
        or "basketball" in normalized
    ):
        return "🏀 Koszykówka"

    if (
        "tenis" in normalized
        or "tennis" in normalized
    ):
        return "🎾 Tenis"

    if (
        "pilka reczna" in normalized
        or "handball" in normalized
    ):
        return "🏐 Piłka ręczna"

    if (
        "boks" in normalized
        or "boxing" in normalized
    ):
        return "🥊 Boks"

    return str(
        value or "Inne"
    ).strip()


def get_words(name):
    normalized = normalize_text(
        name
    )

    words = normalized.split()

    filtered = [
        word
        for word in words
        if word not in STOP_WORDS
    ]

    if not filtered:
        filtered = words

    return {
        TRANSLATIONS.get(
            word,
            word
        )
        for word in filtered
    }


def normalize_team_name(name):
    words = get_words(
        name
    )

    normalized_words = normalize_markers(
        words
    )

    return " ".join(
        sorted(
            normalized_words
        )
    )



def times_are_compatible(
    first_time,
    second_time
):
    first_time = normalize_time(
        first_time
    )

    second_time = normalize_time(
        second_time
    )

    # Brak godziny nie blokuje połączenia.
    if (
        first_time == "00:00"
        or second_time == "00:00"
    ):
        return True

    return first_time == second_time


def normalize_markers(words):
    return {
        MARKER_MAP.get(
            word,
            word
        )
        for word in words
    }


def is_similar_words(
    first_words,
    second_words
):
    if not first_words or not second_words:
        return False

    first = normalize_markers(
        first_words
    )

    second = normalize_markers(
        second_words
    )

    if first == second:
        return True

    all_markers = set(
        MARKER_MAP.values()
    )

    first_markers = (
        first & all_markers
    )

    second_markers = (
        second & all_markers
    )

    if first_markers != second_markers:
        return False

    intersection = (
        first & second
    )

    union = (
        first | second
    )

    if not union:
        return False

    similarity = (
        len(intersection)
        / len(union)
    )

    return similarity >= 0.5


def normalize_bookie_key(name):
    return normalize_text(
        name
    ).replace(
        " ",
        ""
    )


def bookie_type(
    name,
    source_type
):
    if source_type in {
        "polski",
        "zagraniczny"
    }:
        return source_type

    key = normalize_bookie_key(
        name
    )

    polish_keys = {
        normalize_bookie_key(
            item
        )
        for item in POLSCY_BUKMACHERZY
    }

    if key in polish_keys:
        return "polski"

    return "zagraniczny"


# ============================================================
# ŁADOWANIE PLIKÓW
# ============================================================

def load_json(path):
    if not os.path.exists(
        path
    ):
        print(
            f"[WARN] Nie znaleziono pliku: "
            f"{path}"
        )

        return []

    try:
        with open(
            path,
            "r",
            encoding="utf-8"
        ) as file:
            data = json.load(
                file
            )

    except json.JSONDecodeError as error:
        print(
            f"[WARN] Niepoprawny JSON "
            f"{path}: {error}"
        )

        return []

    except Exception as error:
        print(
            f"[WARN] Nie udało się załadować "
            f"{path}: {error}"
        )

        return []

    if isinstance(
        data,
        list
    ):
        return data

    if isinstance(
        data,
        dict
    ):
        result = []

        for value in data.values():
            if isinstance(
                value,
                list
            ):
                result.extend(
                    value
                )

            elif isinstance(
                value,
                dict
            ):
                result.append(
                    value
                )

        return result

    return []


# ============================================================
# NORMALIZOWANIE RYNKÓW
# ============================================================

def normalize_simple_market(
    source,
    keys
):
    if not isinstance(
        source,
        dict
    ):
        return {}

    result = {}

    for key in keys:
        value = clean_odds(
            source.get(
                key
            )
        )

        if value is not None:
            result[key] = value

    return result


def normalize_nested_market(
    source,
    value_keys
):
    if not isinstance(
        source,
        dict
    ):
        return {}

    result = {}

    for line_name, line_data in source.items():
        if not isinstance(
            line_data,
            dict
        ):
            continue

        normalized_line = {}

        for key in value_keys:
            value = clean_odds(
                line_data.get(
                    key
                )
            )

            if value is not None:
                normalized_line[key] = value

        if normalized_line:
            result[
                str(line_name)
            ] = normalized_line

    return result


def build_markets(record):
    market_1x2 = {}

    course_1 = clean_odds(
        record.get(
            "kurs_1"
        )
    )

    course_x = clean_odds(
        record.get(
            "kurs_X"
        )
    )

    course_2 = clean_odds(
        record.get(
            "kurs_2"
        )
    )

    if course_1 is not None:
        market_1x2["1"] = course_1

    if course_x is not None:
        market_1x2["X"] = course_x

    if course_2 is not None:
        market_1x2["2"] = course_2

    return {
        "1x2": market_1x2,
        "btts": normalize_simple_market(
            record.get(
                "btts",
                {}
            ),
            [
                "tak",
                "nie"
            ]
        ),
        "podwojna_szansa": normalize_simple_market(
            record.get(
                "podwojna_szansa",
                {}
            ),
            [
                "1X",
                "12",
                "X2"
            ]
        ),
        "over_under": normalize_nested_market(
            record.get(
                "over_under",
                {}
            ),
            [
                "over",
                "under"
            ]
        ),
        "handicap": normalize_nested_market(
            record.get(
                "handicap",
                {}
            ),
            [
                "1",
                "2"
            ]
        )
    }


def reverse_markets(
    markets
):
    result = {
        "1x2": dict(
            markets.get(
                "1x2",
                {}
            )
        ),
        "btts": dict(
            markets.get(
                "btts",
                {}
            )
        ),
        "podwojna_szansa": dict(
            markets.get(
                "podwojna_szansa",
                {}
            )
        ),
        "over_under": dict(
            markets.get(
                "over_under",
                {}
            )
        ),
        "handicap": {}
    }

    market_1x2 = result[
        "1x2"
    ]

    first = market_1x2.get(
        "1"
    )

    second = market_1x2.get(
        "2"
    )

    if second is not None:
        market_1x2["1"] = second
    else:
        market_1x2.pop(
            "1",
            None
        )

    if first is not None:
        market_1x2["2"] = first
    else:
        market_1x2.pop(
            "2",
            None
        )

    double_chance = result[
        "podwojna_szansa"
    ]

    first_x = double_chance.get(
        "1X"
    )

    x_second = double_chance.get(
        "X2"
    )

    if x_second is not None:
        double_chance["1X"] = x_second
    else:
        double_chance.pop(
            "1X",
            None
        )

    if first_x is not None:
        double_chance["X2"] = first_x
    else:
        double_chance.pop(
            "X2",
            None
        )

    for line_name, line_data in markets.get(
        "handicap",
        {}
    ).items():
        if not isinstance(
            line_data,
            dict
        ):
            continue

        reversed_line = {}

        if line_data.get(
            "2"
        ) is not None:
            reversed_line["1"] = line_data[
                "2"
            ]

        if line_data.get(
            "1"
        ) is not None:
            reversed_line["2"] = line_data[
                "1"
            ]

        if reversed_line:
            result["handicap"][
                line_name
            ] = reversed_line

    return result


def merge_dictionary(
    existing,
    incoming
):
    if not isinstance(
        incoming,
        dict
    ):
        return

    for key, value in incoming.items():
        if isinstance(
            value,
            dict
        ):
            if (
                key not in existing
                or not isinstance(
                    existing[key],
                    dict
                )
            ):
                existing[key] = {}

            merge_dictionary(
                existing[key],
                value
            )

        elif (
            key not in existing
            or existing[key] is None
        ):
            existing[key] = value


# ============================================================
# ŁĄCZENIE MECZÓW
# ============================================================

merged_matches = []


def find_match(
    sport,
    date,
    time_value,
    home,
    away,
    home_words,
    away_words
):
    normalized_home = normalize_team_name(
        home
    )

    normalized_away = normalize_team_name(
        away
    )

    # Etap 1: dokładne dopasowanie nazw.
    for existing in merged_matches:
        if existing.get(
            "dyscyplina"
        ) != sport:
            continue

        if existing.get(
            "dzien"
        ) != date:
            continue

        if not times_are_compatible(
            time_value,
            existing.get(
                "godzina",
                "00:00"
            )
        ):
            continue

        existing_home = normalize_team_name(
            existing.get(
                "home",
                ""
            )
        )

        existing_away = normalize_team_name(
            existing.get(
                "away",
                ""
            )
        )

        if (
            normalized_home == existing_home
            and normalized_away == existing_away
        ):
            return existing, False

        if (
            normalized_home == existing_away
            and normalized_away == existing_home
        ):
            return existing, True

    # Etap 2: przybliżone dopasowanie nazw.
    for existing in merged_matches:
        if existing.get(
            "dyscyplina"
        ) != sport:
            continue

        if existing.get(
            "dzien"
        ) != date:
            continue

        if not times_are_compatible(
            time_value,
            existing.get(
                "godzina",
                "00:00"
            )
        ):
            continue

        normal_order = (
            is_similar_words(
                home_words,
                existing["_home_words"]
            )
            and is_similar_words(
                away_words,
                existing["_away_words"]
            )
        )

        if normal_order:
            print(
                f"[MERGE FUZZY] "
                f"{home} - {away} "
                f"połączono z "
                f"{existing['mecz']}"
            )

            return existing, False

        reversed_order = (
            is_similar_words(
                home_words,
                existing["_away_words"]
            )
            and is_similar_words(
                away_words,
                existing["_home_words"]
            )
        )

        if reversed_order:
            print(
                f"[MERGE REVERSED] "
                f"{home} - {away} "
                f"połączono odwrotnie z "
                f"{existing['mecz']}"
            )

            return existing, True

    return None, False


def create_match_id(
    sport,
    date,
    home,
    away
):
    return bezpieczny_id(
        f"{sport}_{date}_{home}_{away}"
    )


def add_record(record, source_type):
    if not isinstance(record, dict):
        return

    home = str(
        record.get(
            "home",
            record.get("home_team", "")
        )
    ).strip()

    away = str(
        record.get(
            "away",
            record.get("away_team", "")
        )
    ).strip()

    if not home or not away:
        return

    sport = normalize_sport(
        record.get(
            "dyscyplina",
            record.get("sport", "Inne")
        )
    )

    date = normalize_date(
        record.get(
            "dzien",
            record.get(
                "date",
                record.get("startTime", "")
            )
        )
    )

    if not date:
        return

    if (
        TYLKO_JUTRO_I_POJUTRZE
        and date not in DOZWOLONE_DATY
    ):
        return

    time_value = normalize_time(
        record.get(
            "godzina",
            record.get(
                "czas",
                record.get(
                    "time",
                    record.get("startTime", "")
                )
            )
        )
    )

    bookie_name = str(
        record.get(
            "bukmacher",
            "Nieznany"
        )
    ).strip()

    if not bookie_name:
        bookie_name = "Nieznany"

    home_words = get_words(home)
    away_words = get_words(away)

    existing_match, is_reversed = find_match(
        sport=sport,
        date=date,
        time_value=time_value,
        home=home,
        away=away,
        home_words=home_words,
        away_words=away_words
    )

    if existing_match is not None:
        print(
            f"[MERGE] "
            f"{bookie_name}: "
            f"{home} - {away} "
            f"dołączono do meczu "
            f"{existing_match['mecz']} | "
            f"odwrócony={is_reversed}"
        )
    else:
        print(
            f"[NEW MATCH] "
            f"{bookie_name}: "
            f"{home} - {away}"
        )

    markets = build_markets(record)

    if is_reversed:
        markets = reverse_markets(markets)

    if existing_match is None:
        existing_match = {
            "id": create_match_id(
                sport,
                date,
                home,
                away
            ),
            "mecz": f"{home} - {away}",
            "dyscyplina": sport,
            "dzien": date,
            "godzina": time_value,
            "home": home,
            "away": away,
            "bukmacherzy": [],
            "_home_words": home_words,
            "_away_words": away_words
        }

        merged_matches.append(existing_match)

    elif (
        existing_match["godzina"] == "00:00"
        and time_value != "00:00"
    ):
        existing_match["godzina"] = time_value

    bookie_key = normalize_bookie_key(bookie_name)
    existing_bookie = None

    for bookie in existing_match["bukmacherzy"]:
        existing_key = normalize_bookie_key(
            bookie.get("nazwa", "")
        )

        if existing_key == bookie_key:
            existing_bookie = bookie
            break

    if existing_bookie is None:
        existing_bookie = {
            "nazwa": bookie_name,
            "typ": bookie_type(
                bookie_name,
                source_type
            ),
            "zrodlo": (
                "polscy_bukmacherzy.json"
                if source_type == "polski"
                else "zagraniczni.json"
            ),
            "kursy": {
                "1x2": {},
                "btts": {},
                "podwojna_szansa": {},
                "over_under": {},
                "handicap": {}
            }
        }

        existing_match["bukmacherzy"].append(
            existing_bookie
        )

    merge_dictionary(
        existing_bookie["kursy"],
        markets
    )


# ============================================================
# PRZETWARZANIE PLIKÓW
# ============================================================

print(
    f"[DEBUG] Uruchomiony plik: "
    f"{os.path.abspath(__file__)}"
)

print(
    f"[DEBUG] Folder danych: "
    f"{DATA_DIR}"
)

print(
    f"[DEBUG] Plik polski: "
    f"{PLIK_POLSCY}"
)

print(
    f"[DEBUG] Plik zagraniczny: "
    f"{PLIK_ZAGRANICZNI}"
)

print(
    f"[DEBUG] Plik wynikowy: "
    f"{PLIK_WYNIKOWY}"
)

polish_records = load_json(
    PLIK_POLSCY
)

foreign_records = load_json(
    PLIK_ZAGRANICZNI
)

print(
    f"[INFO] Polskie rekordy: "
    f"{len(polish_records)}"
)

print(
    f"[INFO] Zagraniczne rekordy: "
    f"{len(foreign_records)}"
)

for record in polish_records:
    add_record(
        record,
        "polski"
    )

for record in foreign_records:
    add_record(
        record,
        "zagraniczny"
    )


# ============================================================
# CZYSZCZENIE I SORTOWANIE
# ============================================================

final_matches = []

for match in merged_matches:
    match.pop(
        "_home_words",
        None
    )

    match.pop(
        "_away_words",
        None
    )

    match[
        "bukmacherzy"
    ].sort(
        key=lambda bookie: (
            0
            if bookie.get(
                "typ"
            ) == "polski"
            else 1,
            normalize_text(
                bookie.get(
                    "nazwa",
                    ""
                )
            )
        )
    )

    match[
        "liczba_bukmacherow"
    ] = len(
        match[
            "bukmacherzy"
        ]
    )

    match[
        "is_today"
    ] = (
        match.get(
            "dzien"
        )
        == DZIS_STR
    )

    if match[
        "bukmacherzy"
    ]:
        final_matches.append(
            match
        )

# Ostateczne usunięcie meczów innych niż jutro i pojutrze.
final_matches = [
    match
    for match in final_matches
    if match.get("dzien") in DOZWOLONE_DATY
]

final_matches.sort(
    key=lambda match: (
        match.get(
            "dzien",
            "9999-12-31"
        ),
        match.get(
            "godzina",
            "99:99"
        ),
        normalize_text(
            match.get(
                "mecz",
                ""
            )
        )
    )
)


# ============================================================
# ZAPIS PLIKU WYNIKOWEGO
# ============================================================

try:
    with open(
        PLIK_WYNIKOWY,
        "w",
        encoding="utf-8"
    ) as file:
        json.dump(
            final_matches,
            file,
            indent=4,
            ensure_ascii=False
        )

except Exception as error:
    print(
        f"[ERROR] Nie udało się zapisać "
        f"pliku wynikowego: {error}"
    )

    raise


# ============================================================
# PODSUMOWANIE
# ============================================================

liczba_polskich = sum(
    1
    for match in final_matches
    for bookie in match[
        "bukmacherzy"
    ]
    if bookie.get(
        "typ"
    ) == "polski"
)

liczba_zagranicznych = sum(
    1
    for match in final_matches
    for bookie in match[
        "bukmacherzy"
    ]
    if bookie.get(
        "typ"
    ) == "zagraniczny"
)

print(
    f"[OK] Połączono "
    f"{len(final_matches)} unikalnych meczów."
)

print(
    f"[INFO] Wpisy polskich bukmacherów: "
    f"{liczba_polskich}"
)

print(
    f"[INFO] Wpisy zagranicznych bukmacherów: "
    f"{liczba_zagranicznych}"
)

print(
    f"[OK] Zapisano plik: "
    f"{PLIK_WYNIKOWY}"
)

# Uruchomienie skanera i wysyłka alertów
znajdz_i_wyslij_okazje(final_matches, DISCORD_WEBHOOK_URL, MIN_EDGE)
