import React, { useState, useEffect } from 'react';


function MatchesList({ matches, onSelect, favorites, onToggleFavorite, groupBySport }) {
  
  const [currentPage, setCurrentPage] = useState(() => {
    const savedPage = localStorage.getItem('matchesListPage');
    return savedPage ? parseInt(savedPage, 10) : 1;
  });

  const matchesPerPage = 20;

  useEffect(() => {
    localStorage.setItem('matchesListPage', currentPage.toString());
  }, [currentPage]);

  const getBestOdds = (match) => {
  let best1 = 0, bestX = 0, best2 = 0;
  const kursyObject = match.kursy || {};
  
  Object.keys(kursyObject).forEach(bookieName => {
    const b = kursyObject[bookieName];
    if (b) {
      // Obsługuje zarówno "1", jak i "home", "X"/"draw", "2"/"away"
      const val1 = parseFloat(b['1'] || b.home || 0);
      const valX = parseFloat(b['X'] || b.draw || 0);
      const val2 = parseFloat(b['2'] || b.away || 0);

      if (val1 > best1) best1 = val1;
      if (valX > bestX) bestX = valX;
      if (val2 > best2) best2 = val2;
    }
  });

  return {
    home: best1 > 0 ? best1.toFixed(2) : "-",
    draw: bestX > 0 ? bestX.toFixed(2) : "-",
    away: best2 > 0 ? best2.toFixed(2) : "-"
  };
};

  // --- FILTROWANIE ---
  // Ostateczna blokada po stronie listy.
  // Wyświetlamy wyłącznie mecze na jutro i pojutrze.
  const activeMatches = matches
    ? matches.filter((match) => {
        const dateStr =
          match.dzien ||
          match.date;

        if (!dateStr) {
          return false;
        }

        const datePart = String(dateStr)
          .split(" ")[0]
          .split(",")[0]
          .trim();

        let matchDate = null;

        if (datePart.includes(".")) {
          const parts = datePart.split(".");

          if (parts.length === 3) {
            const [day, month, year] = parts;

            matchDate = new Date(
              Number(year),
              Number(month) - 1,
              Number(day)
            );
          }
        } else if (datePart.includes("-")) {
          const parts = datePart.split("-");

          if (parts.length === 3) {
            const [year, month, day] = parts;

            matchDate = new Date(
              Number(year),
              Number(month) - 1,
              Number(day)
            );
          }
        }

        if (
          !matchDate ||
          Number.isNaN(
            matchDate.getTime()
          )
        ) {
          return false;
        }

        const today = new Date();

        today.setHours(
          0,
          0,
          0,
          0
        );

        matchDate.setHours(
          0,
          0,
          0,
          0
        );

        const differenceInDays =
          Math.round(
            (
              matchDate.getTime() -
              today.getTime()
            ) /
            (
              1000 *
              60 *
              60 *
              24
            )
          );

        const isTomorrowOrDayAfter =
          differenceInDays === 1 ||
          differenceInDays === 2;

        return isTomorrowOrDayAfter;
      })
    : [];

  const hasMatches = activeMatches.length > 0;
  const totalPages = hasMatches ? Math.ceil(activeMatches.length / matchesPerPage) : 0;
  
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const currentMatches = hasMatches ? activeMatches.slice((currentPage - 1) * matchesPerPage, currentPage * matchesPerPage) : [];

  const getPaginationRange = () => {
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    const range = [];
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  };

  const visiblePages =
    getPaginationRange();

  const changePage = (pageNumber) => {
    const safePage = Math.min(
      Math.max(pageNumber, 1),
      totalPages
    );

    setCurrentPage(safePage);

    window.requestAnimationFrame(() => {
      const listElement =
        document.getElementById(
          "matches-list-start"
        );

      if (listElement) {
        const elementPosition =
          listElement.getBoundingClientRect()
            .top +
          window.scrollY -
          120;

        window.scrollTo({
          top: Math.max(
            elementPosition,
            0
          ),
          behavior: "smooth"
        });
      }
    });
  };


  return (
    <div
      id="matches-list-start"
      className="matches-list"
    >
      {!hasMatches && (
        <p style={{ padding: "40px", textAlign: "center", color: "#aaa", fontSize: "1.2em" }}>
          Brak aktywnych meczów do wyświetlenia.
        </p>
      )}

      {hasMatches && currentMatches.map((match, idx) => {
        const best = getBestOdds(match);
        const matchTitle = match.mecz || match.match || "Nieznany mecz";
        const matchSport = match.dyscyplina || match.sport || "Inne";
        const matchDate = match.date || match.dzien || "-";
        const matchTime = match.time || match.godzina || "";
        const isFav = favorites && favorites.includes(matchTitle);
        const bestText = best.draw !== "-" ? `${best.home} / ${best.draw} / ${best.away}` : `${best.home} / ${best.away}`;

        return (
          <div key={match.id || idx} onClick={() => onSelect(match)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", borderBottom: "1px solid #333", backgroundColor: "#1e1e1e", cursor: "pointer", borderRadius: "8px", marginBottom: "10px" }}>
            <div>
              <h4 style={{ margin: "0 0 10px 0", color: "#fff", fontSize: "1.1em" }}>{matchTitle}</h4>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.9em", color: "#aaa" }}>
                <span style={{ backgroundColor: "#22c55e", color: "#fff", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold" }}>✅ BEST:</span>
                <span style={{ fontWeight: "bold", color: "#eab308" }}>{bestText}</span>
                <span style={{ color: "#666", marginLeft: "15px" }}>{matchSport} | {matchDate} {matchTime !== "00:00" ? matchTime : ""}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div onClick={(e) => { e.stopPropagation(); onToggleFavorite(matchTitle); }} style={{ cursor: "pointer", fontSize: "1.5em" }}>{isFav ? "⭐" : "☆"}</div>
            </div>
          </div>
        );
      })}

      {hasMatches && totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginTop: "30px",
            paddingTop: "20px",
            borderTop:
              "1px solid #2a313c"
          }}
        >
          <button
            type="button"
            onClick={() =>
              changePage(
                currentPage - 1
              )
            }
            disabled={currentPage === 1}
            aria-label="Poprzednia strona"
            style={{
              minWidth: "38px",
              height: "38px",
              padding: "0 12px",
              borderRadius: "6px",
              border:
                "1px solid #3b3b3b",
              backgroundColor:
                currentPage === 1
                  ? "#1f2937"
                  : "#333",
              color:
                currentPage === 1
                  ? "#64748b"
                  : "#fff",
              cursor:
                currentPage === 1
                  ? "not-allowed"
                  : "pointer",
              fontWeight: "bold",
              opacity:
                currentPage === 1
                  ? 0.55
                  : 1,
              transition:
                "all 0.2s ease"
            }}
          >
            {"<"}
          </button>

          {visiblePages[0] > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  changePage(1)
                }
                style={{
                  minWidth: "38px",
                  height: "38px",
                  padding: "0 12px",
                  borderRadius: "6px",
                  border:
                    "1px solid #3b3b3b",
                  backgroundColor: "#333",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "bold",
                  transition:
                    "all 0.2s ease"
                }}
              >
                1
              </button>

              {visiblePages[0] > 2 && (
                <span
                  style={{
                    color: "#64748b",
                    padding: "0 2px",
                    userSelect: "none"
                  }}
                >
                  …
                </span>
              )}
            </>
          )}

          {visiblePages.map(
            (pageNumber) => {
              const isActive =
                currentPage ===
                pageNumber;

              return (
                <button
                  type="button"
                  key={pageNumber}
                  onClick={() =>
                    changePage(
                      pageNumber
                    )
                  }
                  aria-current={
                    isActive
                      ? "page"
                      : undefined
                  }
                  style={{
                    minWidth: "38px",
                    height: "38px",
                    padding: "0 12px",
                    borderRadius: "6px",
                    border: isActive
                      ? "1px solid #10b981"
                      : "1px solid #3b3b3b",
                    backgroundColor:
                      isActive
                        ? "#10b981"
                        : "#333",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: "bold",
                    boxShadow: isActive
                      ? "0 0 12px rgba(16, 185, 129, 0.25)"
                      : "none",
                    transition:
                      "all 0.2s ease"
                  }}
                >
                  {pageNumber}
                </button>
              );
            }
          )}

          {visiblePages[
            visiblePages.length - 1
          ] < totalPages && (
            <>
              {visiblePages[
                visiblePages.length - 1
              ] < totalPages - 1 && (
                <span
                  style={{
                    color: "#64748b",
                    padding: "0 2px",
                    userSelect: "none"
                  }}
                >
                  …
                </span>
              )}

              <button
                type="button"
                onClick={() =>
                  changePage(
                    totalPages
                  )
                }
                style={{
                  minWidth: "38px",
                  height: "38px",
                  padding: "0 12px",
                  borderRadius: "6px",
                  border:
                    "1px solid #3b3b3b",
                  backgroundColor: "#333",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "bold",
                  transition:
                    "all 0.2s ease"
                }}
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() =>
              changePage(
                currentPage + 1
              )
            }
            disabled={
              currentPage === totalPages
            }
            aria-label="Następna strona"
            style={{
              minWidth: "38px",
              height: "38px",
              padding: "0 12px",
              borderRadius: "6px",
              border:
                "1px solid #3b3b3b",
              backgroundColor:
                currentPage === totalPages
                  ? "#1f2937"
                  : "#333",
              color:
                currentPage === totalPages
                  ? "#64748b"
                  : "#fff",
              cursor:
                currentPage === totalPages
                  ? "not-allowed"
                  : "pointer",
              fontWeight: "bold",
              opacity:
                currentPage === totalPages
                  ? 0.55
                  : 1,
              transition:
                "all 0.2s ease"
            }}
          >
            {">"}
          </button>
        </div>
      )}
    </div>
  );
}

export default MatchesList;