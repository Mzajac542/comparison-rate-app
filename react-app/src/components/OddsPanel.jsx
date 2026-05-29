import { useState } from 'react';

function getMinMax(betclic, superbet, type) {
  const values = [
    betclic?.[type],
    superbet?.[type]
  ].filter(v => v != null && v !== "-"); // Upewniamy się, że omijamy puste myślniki

  if (values.length === 0) return { min: "-", max: "-" };

  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function OddsPanel({ match }) {
  // ✅ STAN DLA KALKULATORA (domyślnie 100 PLN)
  const [stake, setStake] = useState(100);

  if (!match) {
    return <p>Wybierz mecz</p>;
  }

  const { betclic, superbet } = match;

  const home = getMinMax(betclic, superbet, "home");
  const draw = getMinMax(betclic, superbet, "draw");
  const away = getMinMax(betclic, superbet, "away");

  // ✅ FUNKCJA LICZĄCA RÓŻNICĘ ZYSKU
  const renderProfit = (label, bOdd, sOdd) => {
    // Sprawdzamy, czy w ogóle mamy dwa kursy do porównania
    if (!bOdd || !sOdd || bOdd === "-" || sOdd === "-") return null;

    const b = parseFloat(bOdd);
    const s = parseFloat(sOdd);
    if (isNaN(b) || isNaN(s)) return null;

    if (b === s) return null; // Brak różnicy, więc nie pokazujemy komunikatu

    const maxOdd = Math.max(b, s);
    const minOdd = Math.min(b, s);
    
    // Matematyka: (Większy kurs * stawka) - (Mniejszy kurs * stawka)
    const diff = (maxOdd * stake) - (minOdd * stake);
    const bestBookie = maxOdd === b ? "Betclic" : "Superbet";

    if (diff <= 0) return null;

    return (
      <div style={{ background: "#2a2a2a", padding: "12px", borderRadius: "6px", marginBottom: "8px", fontSize: "0.95em", borderLeft: "4px solid #3b82f6" }}>
        Typ <strong style={{color: "white"}}>{label}</strong>: 
        Graj w <span style={{color: "#10b981", fontWeight: "bold"}}>{bestBookie}</span> 
        ➔ Jesteś do przodu o <strong style={{color: "#3b82f6", fontSize: "1.1em"}}>{diff.toFixed(2)} PLN</strong> w porównaniu do konkurencji!
      </div>
    );
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{match.match}</h3>

      {/* ✅ TABELA KURSÓW */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "25px" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", paddingBottom: "10px", color: "#aaa" }}></th>
            <th style={{ paddingBottom: "10px", color: "#aaa" }}>Betclic</th>
            <th style={{ paddingBottom: "10px", color: "#aaa" }}>Superbet</th>
            <th style={{ paddingBottom: "10px", color: "#aaa" }}>MIN</th>
            <th style={{ paddingBottom: "10px", color: "#aaa" }}>MAX</th>
          </tr>
        </thead>
        <tbody>
          {/* HOME */}
          <tr>
            <td style={{ padding: "8px 0", borderBottom: "1px solid #333" }}>Gospodarz</td>
            <td style={{ textAlign: "center", borderBottom: "1px solid #333", color: betclic?.home === home.max ? "#10b981" : "white" }}>
              {betclic?.home ?? "-"}
            </td>
            <td style={{ textAlign: "center", borderBottom: "1px solid #333", color: superbet?.home === home.max ? "#10b981" : "white" }}>
              {superbet?.home ?? "-"}
            </td>
            <td style={{ textAlign: "center", borderBottom: "1px solid #333", color: "#888" }}>{home.min}</td>
            <td style={{ textAlign: "center", borderBottom: "1px solid #333", color: "#10b981", fontWeight: "bold" }}>{home.max}</td>
          </tr>

          {/* DRAW */}
          <tr>
            <td style={{ padding: "8px 0", borderBottom: "1px solid #333" }}>Remis</td>
            <td style={{ textAlign: "center", borderBottom: "1px solid #333", color: betclic?.draw === draw.max ? "#10b981" : "white" }}>
              {betclic?.draw ?? "-"}
            </td>
            <td style={{ textAlign: "center", borderBottom: "1px solid #333", color: superbet?.draw === draw.max ? "#10b981" : "white" }}>
              {superbet?.draw ?? "-"}
            </td>
            <td style={{ textAlign: "center", borderBottom: "1px solid #333", color: "#888" }}>{draw.min}</td>
            <td style={{ textAlign: "center", borderBottom: "1px solid #333", color: "#10b981", fontWeight: "bold" }}>{draw.max}</td>
          </tr>

          {/* AWAY */}
          <tr>
            <td style={{ padding: "8px 0" }}>Gość</td>
            <td style={{ textAlign: "center", color: betclic?.away === away.max ? "#10b981" : "white" }}>
              {betclic?.away ?? "-"}
            </td>
            <td style={{ textAlign: "center", color: superbet?.away === away.max ? "#10b981" : "white" }}>
              {superbet?.away ?? "-"}
            </td>
            <td style={{ textAlign: "center", color: "#888" }}>{away.min}</td>
            <td style={{ textAlign: "center", color: "#10b981", fontWeight: "bold" }}>{away.max}</td>
          </tr>
        </tbody>
      </table>

      {/* ✅ NOWA SEKCJA: KALKULATOR */}
      <div style={{ borderTop: "1px solid #444", paddingTop: "20px" }}>
        <h4 style={{ margin: "0 0 15px 0", color: "#fff", fontSize: "1.1em" }}>💰 Kalkulator przewagi kursowej</h4>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <label htmlFor="stake" style={{ fontSize: "0.95em", color: "#aaa" }}>Kwota zakładu (PLN):</label>
          <input
            id="stake"
            type="number"
            min="1"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            style={{
              padding: "10px", borderRadius: "6px", border: "1px solid #444",
              background: "#111", color: "white", width: "120px", fontSize: "1.1em", fontWeight: "bold"
            }}
          />
        </div>

        <div>
          {renderProfit("Gospodarz (1)", betclic?.home, superbet?.home)}
          {renderProfit("Remis (X)", betclic?.draw, superbet?.draw)}
          {renderProfit("Gość (2)", betclic?.away, superbet?.away)}

          {/* Komunikat, jeśli w meczu nie da się wyliczyć żadnej różnicy */}
          {(!betclic?.home || !superbet?.home || betclic?.home === superbet?.home) &&
           (!betclic?.draw || !superbet?.draw || betclic?.draw === superbet?.draw) &&
           (!betclic?.away || !superbet?.away || betclic?.away === superbet?.away) && (
            <div style={{ padding: "10px", color: "#888", fontStyle: "italic" }}>
              Brak różnic kursowych między bukmacherami do wyliczenia przewagi.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OddsPanel;