import React, { useState, useEffect } from 'react';

// Słownik czasów trwania meczów w minutach dla poszczególnych dyscyplin
const SPORT_DURATIONS = {
  "piłka nożna": 120,
  "⚽ piłka nożna": 120,
  "tenis": 150,
  "🎾 tenis": 150,
  "koszykówka": 120,
  "🏀 koszykówka": 120,
  "siatkówka": 120,
  "🏐 siatkówka": 120,
  "piłka ręczna": 120,
  "🏐 piłka ręczna": 120,
  "hokej": 150
};

export const getMatchStatus = (match) => {
  let dateStr = match.dzien || match.date;
  let timeStr = match.godzina || match.time || "00:00";
  
  if (!dateStr) return { text: "ZAPLANOWANY", color: "#718096" };

  dateStr = String(dateStr).trim();
  timeStr = String(timeStr).trim();

  let year, month, day;
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
    return { text: "ZAPLANOWANY", color: "#718096" };
  }

  const timeParts = timeStr.split(':');
  const hours = parseInt(timeParts[0], 10) || 0;
  const minutes = parseInt(timeParts[1], 10) || 0;

  const matchStart = new Date(year, month - 1, day, hours, minutes, 0);
  if (isNaN(matchStart.getTime())) return { text: "ZAPLANOWANY", color: "#718096" };

  const now = new Date();
  const diffInMinutes = (now - matchStart) / 1000 / 60;

  const sportKey = String(match.dyscyplina || match.sport || "").toLowerCase().trim();
  const duration = SPORT_DURATIONS[sportKey] || 120;

  if (diffInMinutes < 0) {
    const isToday = matchStart.getFullYear() === now.getFullYear() &&
                    matchStart.getMonth() === now.getMonth() &&
                    matchStart.getDate() === now.getDate();
                    
    return isToday ? { text: "OCZEKUJE", color: "#ffa500" } : { text: "ZAPLANOWANY", color: "#718096" };
  } else if (diffInMinutes >= 0 && diffInMinutes < duration) {
    return { text: "LIVE", color: "#e53e3e" };
  } else {
    return { text: "ZAKOŃCZONO", color: "#4a5568" };
  }
};

function MatchesList({ matches, onSelect, favorites, onToggleFavorite, groupBySport }) {
  const [tick, setTick] = useState(0);
  
  const [currentPage, setCurrentPage] = useState(() => {
    const savedPage = localStorage.getItem('matchesListPage');
    return savedPage ? parseInt(savedPage, 10) : 1;
  });

  const matchesPerPage = 20;

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

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
  // Odrzucamy wszystkie zakończone mecze przed operacjami na paginacji
  const activeMatches = matches ? matches.filter(match => getMatchStatus(match).text !== "ZAKOŃCZONO") : [];

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

  return (
    <div className="matches-list">
      <style>{`
        @keyframes liveDotPulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(229, 62, 62, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(229, 62, 62, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(229, 62, 62, 0); }
        }
        .live-pulse-dot { width: 8px; height: 8px; background-color: #e53e3e; border-radius: 50%; display: inline-block; animation: liveDotPulse 1.8s infinite ease-in-out; }
      `}</style>

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
        const status = getMatchStatus(match);
        const isLive = status && status.text === "LIVE";
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
              {status && isLive && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="live-pulse-dot" />
                  <span style={{ backgroundColor: status.color, color: "#fff", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold", fontSize: "0.85em" }}>{status.text}</span>
                </div>
              )}
              {/* Opcjonalny fallback: Jeśli jednak przez jakiś powód mignie inny status na frontendzie */}
              {status && !isLive && status.text !== "ZAKOŃCZONO" && (
                 <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                   <span style={{ backgroundColor: status.color, color: "#fff", padding: "3px 8px", borderRadius: "4px", fontWeight: "bold", fontSize: "0.85em" }}>{status.text}</span>
                 </div>
              )}
              <div onClick={(e) => { e.stopPropagation(); onToggleFavorite(matchTitle); }} style={{ cursor: "pointer", fontSize: "1.5em" }}>{isFav ? "⭐" : "☆"}</div>
            </div>
          </div>
        );
      })}

      {hasMatches && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "20px" }}>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} style={{ padding: "8px", background: "#333", color: "#fff", border: "none", cursor: "pointer" }}>&lt;</button>
          {getPaginationRange().map(p => (
            <button key={p} onClick={() => setCurrentPage(p)} style={{ padding: "8px 12px", backgroundColor: currentPage === p ? "#22c55e" : "#333", color: "#fff", border: "none", cursor: "pointer" }}>{p}</button>
          ))}
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} style={{ padding: "8px", background: "#333", color: "#fff", border: "none", cursor: "pointer" }}>&gt;</button>
        </div>
      )}
    </div>
  );
}

export default MatchesList;