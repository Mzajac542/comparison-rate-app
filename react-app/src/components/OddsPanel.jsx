import { useState } from "react";

function analyzeOdds(odds) {
  const homeOdds = odds.map(o => o.home);
  const awayOdds = odds.map(o => o.away);

  return {
    home: {
      max: Math.max(...homeOdds),
      min: Math.min(...homeOdds)
    },
    away: {
      max: Math.max(...awayOdds),
      min: Math.min(...awayOdds)
    }
  };
}

function OddsPanel({ odds }) {
  if (!odds || odds.length === 0) {
    return <p>Brak kursów dla tego meczu.</p>;
  }

  const analysis = analyzeOdds(odds);

  // ✅ STAN SORTOWANIA
  const [sortKey, setSortKey] = useState(null); // "home" | "away"
  const [sortDir, setSortDir] = useState("desc"); // "asc" | "desc"

  // ✅ OBSŁUGA KLIKNIĘCIA W NAGŁÓWEK
  function handleSort(key) {
    if (sortKey === key) {
      // zmiana kierunku
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      // nowa kolumna
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // ✅ POSORTOWANE KURSY
  const sortedOdds = [...odds].sort((a, b) => {
    if (!sortKey) return 0;

    const valueA = a[sortKey];
    const valueB = b[sortKey];

    return sortDir === "asc"
      ? valueA - valueB
      : valueB - valueA;
  });

  // ✅ STRZAŁKA
  function arrow(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div>
      <h3>Kursy</h3>

      <div className="odds-layout">
        {/* TABELA */}
        <div className="odds-table">
          <table>
            <thead>
              <tr>
                <th>Bukmacher</th>
                <th
                  className="sortable"
                  onClick={() => handleSort("home")}
                >
                  HOME{arrow("home")}
                </th>
                <th
                  className="sortable"
                  onClick={() => handleSort("away")}
                >
                  AWAY{arrow("away")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedOdds.map((o, index) => {
                const homeClass =
                  o.home === analysis.home.max
                    ? "max-odd"
                    : o.home === analysis.home.min
                    ? "min-odd"
                    : "";

                const awayClass =
                  o.away === analysis.away.max
                    ? "max-odd"
                    : o.away === analysis.away.min
                    ? "min-odd"
                    : "";

                return (
                  <tr key={index}>
                    <td>{o.bookmaker}</td>
                    <td className={homeClass}>{o.home}</td>
                    <td className={awayClass}>{o.away}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ANALIZA */}
        <div className="odds-analysis">
          <h4>Analiza kursów</h4>

          <div className="analysis-block">
            <strong>HOME</strong>
            <p>min: {analysis.home.min}</p>
            <p>max: {analysis.home.max}</p>
          </div>

          <div className="analysis-block">
            <strong>AWAY</strong>
            <p>min: {analysis.away.min}</p>
            <p>max: {analysis.away.max}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OddsPanel;
