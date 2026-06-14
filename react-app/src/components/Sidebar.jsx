import React from 'react';

function Sidebar({ sports, matches, selectedSport, selectedLeague, onSelectSport, onSelectLeague, showOnlyCommon, onToggleCommon }) {
  
  // Funkcja grupująca i zliczająca mecze dla wybranego sportu (TYLKO jeśli mają zapisaną ligę)
  const getLeaguesForSport = (sportName) => {
    const sportMatches = matches.filter(m => m.sport === sportName);
    const counts = {};

    sportMatches.forEach(m => {
      // Dodajemy do listy tylko wtedy, gdy mecz faktycznie posiada nazwę ligi
      if (m.league && m.league.trim() !== "") {
        counts[m.league] = (counts[m.league] || 0) + 1;
      }
    });

    // Sortujemy alfabetycznie, żeby ładnie wyglądało na liście
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // Funkcja zliczająca WSZYSTKIE mecze w danej dyscyplinie (do przycisku "Wszystkie")
  const getSportTotalCount = (sportName) => {
    return matches.filter(m => m.sport === sportName).length;
  };

  return (
    <div className="sidebar-container" style={{ paddingRight: "10px" }}>
      
      {/* PRZEŁĄCZNIK "WSPÓLNE KURSY" (Customowy Toggle) */}
      <div
        style={{
          padding: "12px 15px",
          backgroundColor: "#1e1e1e",
          borderRadius: "8px",
          border: "1px solid #333",
          marginBottom: "25px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          transition: "background 0.2s"
        }}
        onClick={onToggleCommon}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2a2a2a"}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1e1e1e"}
      >
        <span style={{ color: "#fff", fontWeight: "bold", fontSize: "0.85em", lineHeight: "1.2" }}>
          WSPÓLNE<br />KURSY
        </span>
        <div style={{
          position: "relative",
          width: "44px",
          height: "22px",
          backgroundColor: showOnlyCommon ? "#3b82f6" : "#444",
          borderRadius: "12px",
          transition: "background-color 0.3s"
        }}>
          <div style={{
            position: "absolute",
            top: "3px",
            left: showOnlyCommon ? "25px" : "3px",
            width: "16px",
            height: "16px",
            backgroundColor: "#fff",
            borderRadius: "50%",
            transition: "left 0.3s"
          }} />
        </div>
      </div>

      {/* LISTA SPORTÓW I LIG */}
      <h3 style={{ marginBottom: "15px", color: "#fff", fontSize: "1.1em", paddingLeft: "5px" }}>Sporty</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {sports.map(sport => {
          const isSelected = selectedSport === sport;
          const leagues = isSelected ? getLeaguesForSport(sport) : [];
          const totalSportCount = getSportTotalCount(sport); // Pobieramy sumę meczów

          return (
            <li key={sport} style={{ marginBottom: "5px" }}>
              {/* Główny przycisk Sportu */}
              <button
                onClick={() => {
                  onSelectSport(isSelected ? null : sport);
                  onSelectLeague(null); // Reset ligi przy zmianie sportu
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 15px",
                  backgroundColor: isSelected ? "#1f2937" : "transparent",
                  color: isSelected ? "#60a5fa" : "#aaa",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: isSelected ? "bold" : "normal",
                  transition: "all 0.2s"
                }}
              >
                {sport}
              </button>

              {/* ROZWIJANA LISTA LIG (Pojawia się tylko gdy sport jest aktywny) */}
              {isSelected && (
                <ul style={{ listStyle: "none", padding: "8px 0 8px 15px", margin: 0 }}>
                  
                  {/* Przycisk "Wszystkie" (teraz z licznikiem) */}
                  <li style={{ marginBottom: "4px" }}>
                    <button
                      onClick={() => onSelectLeague(null)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 12px",
                        backgroundColor: selectedLeague === null ? "#064e3b" : "transparent",
                        color: selectedLeague === null ? "#fff" : "#888",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.9em",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "all 0.2s"
                      }}
                    >
                      <span>Wszystkie</span>
                      <span style={{ 
                        color: selectedLeague === null ? "#6ee7b7" : "#555",
                        fontSize: "0.9em",
                        fontWeight: "bold"
                      }}>
                        ({totalSportCount})
                      </span>
                    </button>
                  </li>
                  
                  {/* Pętla renderująca konkretne ligi z licznikami (ukryte dopóki skrypt ich nie pobierze) */}
                  {leagues.map(([leagueName, count]) => (
                    <li key={leagueName} style={{ marginBottom: "4px" }}>
                      <button
                        onClick={() => onSelectLeague(leagueName)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 12px",
                          backgroundColor: selectedLeague === leagueName ? "#064e3b" : "transparent",
                          color: selectedLeague === leagueName ? "#fff" : "#888",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.9em",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.2s"
                        }}
                      >
                        <span style={{ 
                          overflow: "hidden", 
                          textOverflow: "ellipsis", 
                          whiteSpace: "nowrap",
                          maxWidth: "75%"
                        }}>
                          {leagueName}
                        </span>
                        <span style={{ 
                          color: selectedLeague === leagueName ? "#6ee7b7" : "#555",
                          fontSize: "0.9em",
                          fontWeight: "bold"
                        }}>
                          ({count})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default Sidebar;