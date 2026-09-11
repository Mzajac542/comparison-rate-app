import React, { useEffect, useMemo, useState } from "react";

const SPORT_META = {
  "Piłka nożna": { icon: "⚽", slug: "football" },
  "Koszykówka": { icon: "🏀", slug: "basketball" },
  "Tenis": { icon: "🎾", slug: "tennis" },
  "Piłka ręczna": { icon: "🤾", slug: "handball" },
  "Boks": { icon: "🥊", slug: "boxing" }
};

function parseMatchDate(value) {
  if (!value) return null;
  const raw = String(value).split(" ")[0].split(",")[0].trim();
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = raw.match(/^(\d{2})[.-](\d{2})[.-](\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = parseMatchDate(value);
  if (!date) return value || "Brak daty";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function MatchesList({ matches, onSelect, favorites, onToggleFavorite }) {
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = Number.parseInt(localStorage.getItem("matchesListPage") || "1", 10);
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });

  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem("matchesViewMode") === "compact" ? "compact" : "cards"
  );

  const matchesPerPage = viewMode === "compact" ? 30 : 18;

  useEffect(() => {
    localStorage.setItem("matchesListPage", String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    localStorage.setItem("matchesViewMode", viewMode);
    setCurrentPage(1);
  }, [viewMode]);

  const getBestOdds = (match) => {
    let best1 = 0;
    let bestX = 0;
    let best2 = 0;
    let bookmaker1 = "";
    let bookmakerX = "";
    let bookmaker2 = "";

    Object.entries(match.kursy || {}).forEach(([bookmaker, values]) => {
      if (!values) return;
      const value1 = Number.parseFloat(values["1"] || values.home || 0);
      const valueX = Number.parseFloat(values.X || values.draw || 0);
      const value2 = Number.parseFloat(values["2"] || values.away || 0);
      if (value1 > best1) { best1 = value1; bookmaker1 = bookmaker; }
      if (valueX > bestX) { bestX = valueX; bookmakerX = bookmaker; }
      if (value2 > best2) { best2 = value2; bookmaker2 = bookmaker; }
    });

    return [
      { label: "1", value: best1 > 0 ? best1.toFixed(2) : "-", bookmaker: bookmaker1 },
      ...(bestX > 0 ? [{ label: "X", value: bestX.toFixed(2), bookmaker: bookmakerX }] : []),
      { label: "2", value: best2 > 0 ? best2.toFixed(2) : "-", bookmaker: bookmaker2 }
    ];
  };

  const activeMatches = useMemo(() => {
    return (matches || []).filter((match) => {
      const matchDate = parseMatchDate(match.dzien || match.date);
      if (!matchDate) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      matchDate.setHours(0, 0, 0, 0);
      const difference = Math.round((matchDate - today) / 86400000);
      return difference === 1 || difference === 2;
    });
  }, [matches]);

  const totalPages = Math.ceil(activeMatches.length / matchesPerPage);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const currentMatches = activeMatches.slice(
    (currentPage - 1) * matchesPerPage,
    currentPage * matchesPerPage
  );

  const changePage = (page) => {
    if (!totalPages) return;
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
    window.requestAnimationFrame(() => {
      const element = document.getElementById("matches-list-start");
      if (element) {
        window.scrollTo({
          top: Math.max(element.getBoundingClientRect().top + window.scrollY - 105, 0),
          behavior: "smooth"
        });
      }
    });
  };

  const visiblePages = [];
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  for (let number = start; number <= end; number += 1) visiblePages.push(number);

  return (
    <section id="matches-list-start" className={`matches-stage2 matches-stage2--${viewMode}`}>
      <div className="matches-stage2-toolbar">
        <div>
          <span className="matches-stage2-eyebrow">LISTA WYDARZEŃ</span>
          <h2>Mecze do porównania</h2>
          <p>{activeMatches.length} aktywnych wydarzeń na jutro i pojutrze</p>
        </div>

        <div className="view-mode-switch" aria-label="Wybierz wygląd listy">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
            aria-pressed={viewMode === "cards"}
          >
            <span aria-hidden="true">▦</span> Karty
          </button>
          <button
            type="button"
            className={viewMode === "compact" ? "active" : ""}
            onClick={() => setViewMode("compact")}
            aria-pressed={viewMode === "compact"}
          >
            <span aria-hidden="true">☷</span> Kompaktowy
          </button>
        </div>
      </div>

      {!activeMatches.length && (
        <div className="matches-empty-state">
          <span aria-hidden="true">⌕</span>
          <h3>Brak aktywnych meczów</h3>
          <p>Zmień filtry lub wybierz inną dyscyplinę.</p>
        </div>
      )}

      {!!activeMatches.length && (
        <div className="matches-stage2-grid">
          {currentMatches.map((match, index) => {
            const title = match.mecz || match.match || "Nieznany mecz";
            const sport = match.dyscyplina || match.sport || "Inne";
            const date = match.dzien || match.date || "";
            const time = match.godzina || match.time || "";
            const favorite = Boolean(favorites?.includes(title));
            const odds = getBestOdds(match);
            const meta = SPORT_META[sport] || { icon: "◆", slug: "other" };

            return (
              <article
                key={match.id || `${title}-${index}`}
                className={`match-stage2-card sport-${meta.slug} ${favorite ? "is-favorite" : ""}`}
                onClick={() => onSelect(match)}
              >
                <div className="match-stage2-accent" />
                <header className="match-stage2-header">
                  <span className="match-stage2-sport">
                    <span aria-hidden="true">{meta.icon}</span> {sport}
                  </span>
                  <div className="match-stage2-time">
                    <strong>{time && time !== "00:00" ? time : "Termin wkrótce"}</strong>
                    <span>{formatDate(date)}</span>
                  </div>
                </header>

                <h3>{title}</h3>

                <div className="match-stage2-odds-label">
                  <span>Najlepsze kursy</span>
                  <span className="match-stage2-best-badge">BEST</span>
                </div>

                <div className={`match-stage2-odds match-stage2-odds--${odds.length}`}>
                  {odds.map((odd) => (
                    <div className="match-stage2-odd" key={odd.label}>
                      <span>{odd.label}</span>
                      <strong>{odd.value}</strong>
                      <small title={odd.bookmaker}>{odd.bookmaker || "Brak kursu"}</small>
                    </div>
                  ))}
                </div>

                <footer className="match-stage2-footer">
                  <span className="match-stage2-open">Zobacz porównanie <b>→</b></span>
                  <button
                    type="button"
                    className={favorite ? "match-favorite-button active" : "match-favorite-button"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(title);
                    }}
                    aria-label={favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                    title={favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                  >
                    {favorite ? "★" : "☆"}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="matches-stage2-pagination" aria-label="Strony listy meczów">
          <button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1}>←</button>
          {visiblePages[0] > 1 && (
            <><button type="button" onClick={() => changePage(1)}>1</button>{visiblePages[0] > 2 && <span>…</span>}</>
          )}
          {visiblePages.map((page) => (
            <button
              type="button"
              key={page}
              onClick={() => changePage(page)}
              className={page === currentPage ? "active" : ""}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </button>
          ))}
          {visiblePages[visiblePages.length - 1] < totalPages && (
            <>{visiblePages[visiblePages.length - 1] < totalPages - 1 && <span>…</span>}<button type="button" onClick={() => changePage(totalPages)}>{totalPages}</button></>
          )}
          <button type="button" onClick={() => changePage(currentPage + 1)} disabled={currentPage === totalPages}>→</button>
        </nav>
      )}
    </section>
  );
}

export default MatchesList;
