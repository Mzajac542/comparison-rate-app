import os
import time
import requests
from dotenv import load_dotenv


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


def pobierz_webhook_discord():
    webhook_url = os.getenv(
        "DISCORD_SCRAPER_WEBHOOK_URL",
        ""
    ).strip()

    if not webhook_url:
        raise RuntimeError(
            "Brak DISCORD_SCRAPER_WEBHOOK_URL "
            "w głównym pliku .env."
        )

    if not webhook_url.startswith(
        "https://discord.com/api/webhooks/"
    ):
        raise RuntimeError(
            "DISCORD_SCRAPER_WEBHOOK_URL nie wygląda "
            "jak prawidłowy webhook Discorda."
        )

    return webhook_url


def wyslij_alert_discord(
    tytul,
    opis,
    poziom="info",
    pola=None,
    max_prob=3
):
    webhook_url = pobierz_webhook_discord()

    kolory = {
        "success": 0x2ECC71,
        "warning": 0xF1C40F,
        "critical": 0xE74C3C,
        "info": 0x3498DB
    }

    kolor = kolory.get(
        poziom,
        kolory["info"]
    )

    pola_discord = []

    for nazwa, wartosc in (pola or {}).items():
        pola_discord.append(
            {
                "name": str(nazwa)[:256],
                "value": str(wartosc)[:1024],
                "inline": True
            }
        )

    payload = {
        "username": "Scraper Monitor",
        "embeds": [
            {
                "title": str(tytul)[:256],
                "description": str(opis)[:4096],
                "color": kolor,
                "fields": pola_discord[:25]
            }
        ]
    }

    ostatni_blad = None

    for proba in range(
        1,
        max_prob + 1
    ):
        try:
            response = requests.post(
                webhook_url,
                json=payload,
                timeout=15
            )

            if response.status_code in {
                200,
                204
            }:
                print(
                    "[DISCORD] Powiadomienie wysłane."
                )
                return True

            if response.status_code == 429:
                try:
                    odpowiedz = response.json()
                    retry_after = float(
                        odpowiedz.get(
                            "retry_after",
                            1
                        )
                    )
                except Exception:
                    retry_after = 2

                print(
                    f"[DISCORD] Limit zapytań. "
                    f"Ponowienie za "
                    f"{retry_after:.1f} s."
                )

                time.sleep(
                    max(
                        retry_after,
                        1
                    )
                )

                continue

            ostatni_blad = RuntimeError(
                f"Discord zwrócił HTTP "
                f"{response.status_code}: "
                f"{response.text[:300]}"
            )

        except Exception as blad:
            ostatni_blad = blad

        if proba < max_prob:
            time.sleep(
                proba * 2
            )

    print(
        f"[DISCORD] Nie udało się wysłać "
        f"powiadomienia: {ostatni_blad}"
    )

    return False