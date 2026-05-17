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

// ✅ 2. KOMPONENT – TYLKO RENDER
function OddsPanel({ odds }) {
  if (!odds || odds.length === 0) {
    return <p>Brak kursów dla tego meczu.</p>;
  }

  // ✅ 3. UŻYCIE LOGIKI
  const analysis = analyzeOdds(odds);

  return (
    <div>
      <h3>Kursy</h3>

      <table border="1" cellPadding="5">
        <thead>
          <tr>
            <th>Bukmacher</th>
            <th>HOME</th>
            <th>AWAY</th>
          </tr>
        </thead>
        <tbody>
          {odds.map((o, index) => {
            const homeClass =
              o.home === analysis.home.max ? "max-odd" :
              o.home === analysis.home.min ? "min-odd" : "";

            const awayClass =
              o.away === analysis.away.max ? "max-odd" :
              o.away === analysis.away.min ? "min-odd" : "";

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

      <h4>Analiza kursów</h4>
      <p>
        <strong>HOME:</strong> min {analysis.home.min}, max {analysis.home.max}
      </p>
      <p>
        <strong>AWAY:</strong> min {analysis.away.min}, max {analysis.away.max}
      </p>
    </div>
  );
}

export default OddsPanel;