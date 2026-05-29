import React from 'react';

export default function Sidebar({
  sports,
  matches,
  selectedSport,
  selectedLeague,
  onSelectSport,
  onSelectLeague,
  showOnlyCommon,
  onToggleCommon
}) {
  
  // ✅ LOGIKA WYCIĄGANIA LIG I ZLICZANIA MECZÓW
  let currentSportMatches = selectedSport ? matches.filter(m => m.sport === selectedSport) : [];

  // Jeśli włączono przełącznik, liczymy tylko mecze wspólne dla obu buków
  if (showOnlyCommon) {
    currentSportMatches = currentSportMatches.filter(m => {
      const hasValidOdd = (bookie) => bookie && (
        (bookie.home && bookie.home !== "-") ||
        (bookie.draw && bookie.draw !== "-") ||
        (bookie.away && bookie.away !== "-")
      );
      return hasValidOdd(m.betclic) && hasValidOdd(m.superbet);
    });
  }

  // Grupujemy ligi i zliczamy ile mają meczów
  const leagueCounts = {};
  currentSportMatches.forEach(m => {
    if (m.league) {
      leagueCounts[m.league] = (leagueCounts[m.league] || 0) + 1;
    }
  });

  // Sortujemy alfabetycznie nazwy lig
  const leaguesForSport = Object.keys(leagueCounts).sort();

  return (
    <div style={{ padding: "20px" }}>
      
      {/* ✅ PRZEŁĄCZNIK: TYLKO WSPÓLNE MECZE */}
      <div 
        onClick={onToggleCommon} 
        style={{
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginBottom: "25px", 
          padding: "15px", 
          background: showOnlyCommon ? "#1a2a3a" : "#2a2a2a",
          borderRadius: "8px",
          border: showOnlyCommon ? "1px solid #3b82f6" : "1px solid #444",
          cursor: "pointer",
          transition: "all 0.3s ease"
      }}>
        <span style={{ 
          fontSize: "0.80em", 
          color: showOnlyCommon ? "#fff" : "#aaa", 
          fontWeight: "bold", 
          textTransform: "uppercase", 
          transition: "color 0.3s" 
        }}>
          Wspólne kursy
        </span>
        
        <div style={{
          width: "44px", height: "24px",
          backgroundColor: showOnlyCommon ? "#3b82f6" : "#444", 
          borderRadius: "24px", position: "relative",
          transition: "background-color 0.3s ease"
        }}>
          <div style={{
            position: "absolute", top: "3px",
            left: showOnlyCommon ? "23px" : "3px", 
            width: "18px", height: "18px",
            backgroundColor: "white", borderRadius: "50%",
            transition: "left 0.3s ease",
            boxShadow: showOnlyCommon ? "0 0 5px rgba(59,130,246,0.8)" : "none"
          }} />
        </div>
      </div>

      {/* ✅ LISTA SPORTÓW I LIG */}
      <h2 style={{ fontSize: "1.2em", marginBottom: "15px", color: "#fff" }}>Sporty</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        
        {/* Generowanie poszczególnych sportów */}
        {sports.map(s => (
          <React.Fragment key={s}>
            <li
              onClick={() => {
                if (selectedSport === s) {
                  // Jeśli klikamy w już wybrany sport, ODZNACZAMY go (zwijamy do głównej listy)
                  onSelectSport(null);
                  onSelectLeague(null);
                } else {
                  // Jeśli klikamy w nowy sport, WYBIERAMY go (rozwijamy ligi)
                  onSelectSport(s);
                  onSelectLeague(null);
                }
              }}
              style={{
                padding: "10px 15px", cursor: "pointer", borderRadius: "6px",
                backgroundColor: selectedSport === s ? "#1a2a3a" : "transparent",
                color: selectedSport === s ? "#3b82f6" : "#aaa",
                fontWeight: selectedSport === s ? "bold" : "normal",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => { if(selectedSport !== s) e.currentTarget.style.color = "#fff" }}
              onMouseLeave={(e) => { if(selectedSport !== s) e.currentTarget.style.color = "#aaa" }}
            >
              {s}
            </li>

            {/* ROZWIJANA LISTA LIG (pokazuje się tylko pod aktywnym sportem) */}
            {selectedSport === s && (
              <ul style={{ listStyle: "none", padding: "5px 0 10px 15px", margin: 0 }}>
                
                {/* Opcja "Wszystkie" wewnątrz danej dyscypliny */}
                <li
                  onClick={() => onSelectLeague(null)}
                  style={{
                    padding: "8px 15px", cursor: "pointer", borderRadius: "6px",
                    backgroundColor: selectedLeague === null ? "#102a20" : "transparent",
                    color: selectedLeague === null ? "#10b981" : "#888",
                    fontSize: "0.9em",
                    fontWeight: selectedLeague === null ? "bold" : "normal",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => { if(selectedLeague !== null) e.currentTarget.style.color = "#ddd" }}
                  onMouseLeave={(e) => { if(selectedLeague !== null) e.currentTarget.style.color = "#888" }}
                >
                  Wszystkie
                </li>

                {/* Konkretne ligi z licznikiem */}
                {leaguesForSport.map(l => (
                  <li
                    key={l}
                    onClick={() => onSelectLeague(l)}
                    style={{
                      padding: "8px 15px", cursor: "pointer", borderRadius: "6px",
                      backgroundColor: selectedLeague === l ? "#102a20" : "transparent",
                      color: selectedLeague === l ? "#10b981" : "#888",
                      fontSize: "0.9em",
                      fontWeight: selectedLeague === l ? "bold" : "normal",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => { if(selectedLeague !== l) e.currentTarget.style.color = "#ddd" }}
                    onMouseLeave={(e) => { if(selectedLeague !== l) e.currentTarget.style.color = "#888" }}
                  >
                    {l} <span style={{ opacity: 0.6, fontSize: "0.9em" }}>({leagueCounts[l]})</span>
                  </li>
                ))}
              </ul>
            )}
          </React.Fragment>
        ))}
      </ul>

    </div>
  );
}