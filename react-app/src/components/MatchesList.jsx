import React, { useRef, useEffect, useState } from 'react';

export default function MatchesList({
  matches,
  selectedMatch,
  onSelect,
  favorites = [],
  onToggleFavorite,
  groupBySport = false
}) {
  const itemRefs = useRef({});
  
  // ✅ STAN PAGINACJI
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; // Ilość meczów na jednej stronie

  // ✅ RESETOWANIE STRONY: Jeśli zmienisz sport, ligę lub użyjesz wyszukiwarki, wróć na 1 stronę
  useEffect(() => {
    setCurrentPage(1);
  }, [matches.length]);

  // Animacja scrolla (dla wybranego meczu)
  useEffect(() => {
    if (selectedMatch && itemRefs.current[selectedMatch.id]) {
      itemRefs.current[selectedMatch.id].scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedMatch]);

  if (matches.length === 0) {
    return <p style={{ color: "#888", padding: "10px" }}>Brak meczów do wyświetlenia.</p>;
  }

  // ✅ OBLICZENIA PAGINACJI (Wycinamy tylko te 50 meczów, które mają być na danej stronie)
  const totalPages = Math.ceil(matches.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedMatches = matches.slice(startIndex, startIndex + itemsPerPage);

  const getSportIcon = (sport) => {
    switch(sport) {
      case "Piłka nożna": return "⚽";
      case "Koszykówka": return "🏀";
      case "Tenis": return "🎾";
      case "Piłka ręczna": return "🤾‍♂️";
      case "Boks": return "🥊";
      default: return "🏆";
    }
  };

  const renderMatchCard = (m, i) => {
    const isFav = favorites.includes(m.match);

    return (
      <div
        key={m.id || i}
        ref={el => itemRefs.current[m.id] = el}
        onClick={() => onSelect(m)}
        style={{
          border: selectedMatch?.id === m.id ? "2px solid #3b82f6" : "1px solid #444",
          margin: "10px 0",
          padding: "12px",
          borderRadius: "8px",
          cursor: "pointer",
          backgroundColor: selectedMatch?.id === m.id ? "#1a2a3a" : "transparent",
          transition: "all 0.2s ease",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <div>
          <strong style={{ color: selectedMatch?.id === m.id ? "#3b82f6" : "white", fontSize: "1.05em" }}>
            {m.match}
          </strong>
          <div style={{ marginTop: "5px", fontSize: "0.9em", color: "#aaa" }}>
            ✅ BEST: {m.bestOdds?.home} / {m.bestOdds?.draw} / {m.bestOdds?.away}
          </div>
        </div>

        <div 
          onClick={(e) => {
            e.stopPropagation();
            if(onToggleFavorite) onToggleFavorite(m.match);
          }}
          style={{
            fontSize: "1.5em", cursor: "pointer", padding: "5px",
            color: isFav ? "#fbbf24" : "#555",
            transition: "transform 0.2s, color 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.2)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          title={isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
        >
          {isFav ? "★" : "☆"}
        </div>
      </div>
    );
  };

  // ✅ RENDEROWANIE PRZYCISKÓW PAGINACJI (Sprytny pasek nawigacji)
  const renderPaginationBar = () => {
    if (totalPages <= 1) return null; // Ukryj, jeśli jest tylko 1 strona

    const pages = [];
    const maxVisiblePages = 5; // Pokaż max 5 numerków obok siebie
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => { setCurrentPage(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          style={{
            margin: "0 4px", padding: "8px 14px",
            backgroundColor: currentPage === i ? "#3b82f6" : "#2a2a2a",
            color: currentPage === i ? "white" : "#aaa",
            border: currentPage === i ? "1px solid #3b82f6" : "1px solid #444",
            borderRadius: "6px", cursor: "pointer", fontWeight: "bold",
            transition: "all 0.2s"
          }}
        >
          {i}
        </button>
      );
    }

    const btnStyle = (disabled) => ({
      padding: "8px 15px", borderRadius: "6px",
      backgroundColor: disabled ? "transparent" : "#2a2a2a",
      color: disabled ? "#555" : "white",
      border: "1px solid #444",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      fontWeight: "bold"
    });

    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: "30px", gap: "5px", flexWrap: "wrap" }}>
        <button
          onClick={() => { setCurrentPage(prev => Math.max(prev - 1, 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          disabled={currentPage === 1}
          style={btnStyle(currentPage === 1)}
        >
          ⬅ Poprzednia
        </button>
        
        {pages}
        
        <button
          onClick={() => { setCurrentPage(prev => Math.min(prev + 1, totalPages)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          disabled={currentPage === totalPages}
          style={btnStyle(currentPage === totalPages)}
        >
          Następna ➡
        </button>
      </div>
    );
  };

  // ==========================================
  // WIDOK 1: Z GRUPOWANIEM (Zwracamy uwagę na paginatedMatches zamiast matches)
  // ==========================================
  if (groupBySport) {
    const groupedMatches = paginatedMatches.reduce((acc, m) => {
      const sport = m.sport || "Inne";
      if (!acc[sport]) acc[sport] = [];
      acc[sport].push(m);
      return acc;
    }, {});

    const SPORTS_ORDER = ["Piłka nożna", "Koszykówka", "Tenis", "Piłka ręczna", "Boks"];
    const sortedSports = Object.keys(groupedMatches).sort((a, b) => {
      const indexA = SPORTS_ORDER.indexOf(a);
      const indexB = SPORTS_ORDER.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });

    return (
      <div>
        {sortedSports.map(sport => (
          <div key={sport} style={{ marginBottom: "25px" }}>
            <h3 style={{ 
              color: "#fff", borderBottom: "2px solid #3b82f6", paddingBottom: "8px",
              marginTop: "20px", marginBottom: "10px", fontSize: "1.1em",
              textTransform: "uppercase", letterSpacing: "1px", display: "inline-block"
            }}>
              {getSportIcon(sport)} {sport}
            </h3>
            {groupedMatches[sport].map((m, i) => renderMatchCard(m, i))}
          </div>
        ))}
        {renderPaginationBar()}
      </div>
    );
  }

  // ==========================================
  // WIDOK 2: PŁASKA LISTA 
  // ==========================================
  return (
    <div>
      {paginatedMatches.map((m, i) => renderMatchCard(m, i))}
      {renderPaginationBar()}
    </div>
  );
}