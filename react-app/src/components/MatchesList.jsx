function MatchesList({
  matches,
  selectedSport,
  selectedLeague,
  selectedMatch,
  onSelect
}) {
  if (!matches || matches.length === 0) {
    return <p>Brak meczów</p>;
  }

  // ✅ FILTR: najpierw SPORT, potem (opcjonalnie) LIGA
  const visibleMatches = matches
    .filter(m => m.sport === selectedSport)
    .filter(m =>
      selectedLeague ? m.tournamentName === selectedLeague : true
    );

  if (visibleMatches.length === 0) {
    return <p>Brak meczów w tej lidze</p>;
  }

  return (
    <div>
      <h3>Mecze</h3>
      <ul>
        {visibleMatches.map(match => (
          <li
            key={match.id}
            className={selectedMatch?.id === match.id ? "active" : ""}
            onClick={() => onSelect(match)}
          >
            {match.home} vs {match.away}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MatchesList;