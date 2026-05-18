function MatchesList({
  matches,
  selectedSport,
  selectedLeague,
  selectedMatch,
  onSelect,
  searchQuery
}) {
  if (!matches || matches.length === 0) {
    return <p>Brak meczów</p>;
  }

  const visibleMatches = matches
    .filter(m => m.sport === selectedSport)
    .filter(m =>
      selectedLeague ? m.tournamentName === selectedLeague : true
    )
    .filter(m =>
      searchQuery
        ? `${m.home} ${m.away}`.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    );


  if (visibleMatches.length === 0) {
    return 
<p className="empty-state">
  ℹ️ Brak meczów w tej lidze
</p>
  }

  return (
    <div>
      <h3>
        {selectedSport}
        {" › "}
        {selectedLeague ? selectedLeague : "Wszystkie ligi"}
      </h3>

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