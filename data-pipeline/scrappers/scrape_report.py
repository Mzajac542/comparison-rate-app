import json
import os
from datetime import datetime


class ScrapeReport:
    def __init__(
        self,
        scraper_name,
        report_path,
        test_mode=False
    ):
        self.scraper_name = scraper_name
        self.report_path = report_path
        self.test_mode = bool(test_mode)

        self.started_at = (
            datetime.now()
            .astimezone()
            .isoformat()
        )

        self.start_monotonic = datetime.now()

        self.status = "running"
        self.finished_at = None
        self.duration_seconds = 0

        self.matches_found = 0
        self.matches_attempted = 0
        self.matches_with_table = 0
        self.matches_saved = 0
        self.records_saved = 0

        # Mecze poprawnie sprawdzone, ale bez bukmacherów
        # obsługiwanych przez aplikację.
        self.matches_skipped_no_supported_bookmakers = 0

        self.errors = {
            "list_navigation": 0,
            "invalid_match_url": 0,
            "match_navigation": 0,
            "http_error": 0,
            "ajax_error": 0,
            "table_timeout": 0,
            "missing_title": 0,
            "no_records": 0,
            "unexpected": 0
        }

        self.sports = {}

        self.last_error = None

    def _sport(self, sport):
        if sport not in self.sports:
            self.sports[sport] = {
                "found": 0,
                "attempted": 0,
                "tables_loaded": 0,
                "saved": 0,
                "records": 0,
                "skipped_no_supported_bookmakers": 0,
                "errors": {
                    "list_navigation": 0,
                    "invalid_match_url": 0,
                    "match_navigation": 0,
                    "http_error": 0,
                    "ajax_error": 0,
                    "table_timeout": 0,
                    "missing_title": 0,
                    "no_records": 0,
                    "unexpected": 0
                }
            }

        return self.sports[sport]

    def add_found(self, sport, amount):
        amount = max(
            int(amount),
            0
        )

        self.matches_found += amount
        self._sport(sport)["found"] += amount

    def add_attempted(self, sport):
        self.matches_attempted += 1
        self._sport(sport)["attempted"] += 1

    def add_table_loaded(self, sport):
        self.matches_with_table += 1
        self._sport(sport)["tables_loaded"] += 1

    def add_saved(
        self,
        sport,
        records_added
    ):
        records_added = max(
            int(records_added),
            0
        )

        self.matches_saved += 1
        self.records_saved += records_added

        sport_data = self._sport(sport)
        sport_data["saved"] += 1
        sport_data["records"] += records_added

    
    def add_skipped_no_supported_bookmakers(
        self,
        sport
    ):
        """
        Rejestruje mecz, którego strona i tabela
        zostały poprawnie załadowane, ale tabela
        nie zawiera żadnego bukmachera obsługiwanego
        przez aplikację.

        Nie jest to błąd scrapera.
        """
        self.matches_skipped_no_supported_bookmakers += 1

        sport_data = self._sport(sport)

        sport_data[
            "skipped_no_supported_bookmakers"
        ] += 1

    def add_error(
        self,
        sport,
        error_type,
        details=None
    ):
        if error_type not in self.errors:
            error_type = "unexpected"

        self.errors[error_type] += 1

        sport_data = self._sport(sport)
        sport_data["errors"][error_type] += 1

        if details:
            self.last_error = str(
                details
            )[:1000]

    def to_dict(self):
        qualifying_matches = max(
            self.matches_attempted
            - self.matches_skipped_no_supported_bookmakers,
            0
        )

        success_rate = (
            self.matches_saved
            / qualifying_matches
            * 100
            if qualifying_matches
            else (
                100.0
                if self.matches_attempted > 0
                else 0.0
            )
        )

        table_rate = (
            self.matches_with_table
            / self.matches_attempted
            * 100
            if self.matches_attempted
            else 0.0
        )

        return {
            "scraper": self.scraper_name,
            "status": self.status,
            "test_mode": self.test_mode,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_seconds": self.duration_seconds,
            "matches_found": self.matches_found,
            "matches_attempted": self.matches_attempted,
            "matches_with_table": self.matches_with_table,
            "matches_saved": self.matches_saved,
            "records_saved": self.records_saved,
            "matches_skipped_no_supported_bookmakers":
                self.matches_skipped_no_supported_bookmakers,
            "matches_qualifying": qualifying_matches,
            "success_rate": round(
                success_rate,
                2
            ),
            "table_rate": round(
                table_rate,
                2
            ),
            "errors": self.errors,
            "sports": self.sports,
            "last_error": self.last_error
        }

    def save(self):
        os.makedirs(
            os.path.dirname(
                self.report_path
            ),
            exist_ok=True
        )

        temporary_path = (
            self.report_path
            + ".tmp"
        )

        with open(
            temporary_path,
            "w",
            encoding="utf-8"
        ) as file:
            json.dump(
                self.to_dict(),
                file,
                ensure_ascii=False,
                indent=4
            )

        os.replace(
            temporary_path,
            self.report_path
        )

    def finish(
        self,
        status="completed",
        records_saved=None,
        error=None
    ):
        self.status = status

        self.finished_at = (
            datetime.now()
            .astimezone()
            .isoformat()
        )

        finished = datetime.now()

        self.duration_seconds = round(
            (
                finished
                - self.start_monotonic
            ).total_seconds(),
            2
        )

        if records_saved is not None:
            self.records_saved = max(
                int(records_saved),
                0
            )

        if error is not None:
            self.last_error = str(
                error
            )[:1000]

        self.save()