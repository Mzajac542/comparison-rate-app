function OddsPanel({ odds }) {
  if (!odds || odds.length === 0) {
    return <p>Brak kursów dla tego meczu.</p>;
  }

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
          {odds.map((o, index) => (
            <tr key={index}>
              <td>{o.bookmaker}</td>
              <td>{o.home}</td>
              <td>{o.away}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default OddsPanel;