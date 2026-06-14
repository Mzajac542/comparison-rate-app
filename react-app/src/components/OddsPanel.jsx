import React from 'react';

function OddsPanel({ match }) {
  if (!match) return null;

  // Bezpieczne pobieranie kursów z JSONa
  const kursyObject = match.kursy || {};
  
  // Przekształcamy obiekt na stabilną listę
  const bookmakers = Object.entries(kursyObject).map(([name, data]) => ({
    name: name,
    data: data || {} // Ochrona przed null data
  }));

  // Funkcja znajdująca najlepsze kursy ze wszystkich wierszy (Zielone pogrubienie)
  const getBestOdds = () => {
    let best1 = 0, bestX = 0, best2 = 0;
    bookmakers.forEach(b => {
      if (b.data) {
        const v1 = parseFloat(b.data['1'] || 0);
        const vX = parseFloat(b.data['X'] || 0);
        const v2 = parseFloat(b.data['2'] || 0);
        
        if (v1 > best1) best1 = v1;
        if (vX > bestX) bestX = vX;
        if (v2 > best2) best2 = v2;
      }
    });
    return { best1, bestX, best2 };
  };

  const bestOdds = getBestOdds();

  // Liczymy MIN i MAX tylko dla pojedynczego bukmachera w poziomie (zwraca min/max z trójki: 1, X, 2)
  const getMinMax = (home, draw, away) => {
    const rawOdds = [home, draw, away];
    const odds = rawOdds.filter(val => val !== null && val !== undefined && val !== "-" && !isNaN(parseFloat(val)));
    
    if (odds.length === 0) return { min: "-", max: "-" };
    
    const minVal = Math.min(...odds).toFixed(2);
    const maxVal = Math.max(...odds).toFixed(2);
    return { min: minVal, max: maxVal };
  };

  return (
    <div className="odds-panel">
      <h3 style={{ marginBottom: "15px", borderBottom: "1px solid #444", paddingBottom: "10px" }}>
        Porównanie kursów
      </h3>
      
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center" }}>
          <thead>
            <tr style={{ backgroundColor: "#2a2a2a", color: "#aaa" }}>
              <th style={{ padding: "12px", borderBottom: "1px solid #444", textAlign: "left" }}>Bukmacher</th>
              <th style={{ padding: "12px", borderBottom: "1px solid #444" }}>Gospodarz (1)</th>
              <th style={{ padding: "12px", borderBottom: "1px solid #444" }}>Remis (X)</th>
              <th style={{ padding: "12px", borderBottom: "1px solid #444" }}>Gość (2)</th>
              <th style={{ padding: "12px", borderBottom: "1px solid #444", color: "#ef4444" }}>MIN</th>
              <th style={{ padding: "12px", borderBottom: "1px solid #444", color: "#22c55e" }}>MAX</th>
            </tr>
          </thead>
          <tbody>
            {bookmakers.map((bookie, idx) => {
              
              // Weryfikacja czy w ogóle mamy cokolwiek w tym wierszu
              const v1 = bookie.data['1'];
              const vX = bookie.data['X'];
              const v2 = bookie.data['2'];
              
              if (v1 === null && vX === null && v2 === null) return null;
              if (v1 === undefined && vX === undefined && v2 === undefined) return null;

              const minMax = getMinMax(v1, vX, v2);

              return (
                <tr key={idx} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "12px", textAlign: "left", fontWeight: "bold" }}>
                    {bookie.name}
                  </td>
                  
                  {/* 1 */}
                  <td style={{ 
                    padding: "12px", 
                    color: parseFloat(v1) === bestOdds.best1 && parseFloat(v1) > 0 ? "#22c55e" : "#fff",
                    fontWeight: parseFloat(v1) === bestOdds.best1 && parseFloat(v1) > 0 ? "bold" : "normal"
                  }}>
                    {v1 || "-"}
                  </td>
                  
                  {/* X */}
                  <td style={{ 
                    padding: "12px", 
                    color: parseFloat(vX) === bestOdds.bestX && parseFloat(vX) > 0 ? "#22c55e" : "#fff",
                    fontWeight: parseFloat(vX) === bestOdds.bestX && parseFloat(vX) > 0 ? "bold" : "normal"
                  }}>
                    {vX || "-"}
                  </td>

                  {/* 2 */}
                  <td style={{ 
                    padding: "12px", 
                    color: parseFloat(v2) === bestOdds.best2 && parseFloat(v2) > 0 ? "#22c55e" : "#fff",
                    fontWeight: parseFloat(v2) === bestOdds.best2 && parseFloat(v2) > 0 ? "bold" : "normal"
                  }}>
                    {v2 || "-"}
                  </td>

                  {/* MIN (Czerwony) */}
                  <td style={{ padding: "12px", color: "#ef4444", fontWeight: "bold" }}>
                    {minMax.min}
                  </td>

                  {/* MAX (Zielony) */}
                  <td style={{ padding: "12px", color: "#22c55e", fontWeight: "bold" }}>
                    {minMax.max}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OddsPanel;