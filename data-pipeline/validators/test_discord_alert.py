from discord_alerts import wyslij_alert_discord


def main():
    wyslano = wyslij_alert_discord(
        tytul="Test monitoringu scraperów",
        opis=(
            "Połączenie z webhookiem Discorda "
            "działa prawidłowo."
        ),
        poziom="success",
        pola={
            "Scraper polski": "Gotowy",
            "Scraper zagraniczny": "Gotowy",
            "Tryb": "Test połączenia"
        }
    )

    if not wyslano:
        raise SystemExit(
            "Nie udało się wysłać testu."
        )


if __name__ == "__main__":
    main()