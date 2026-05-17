function MatchesList({ matches, selectedMatch, onSelect }) {
  if (!matches || matches.length === 0) {
    return <p>Brak meczów</p>;
  }

  return (
    <div>
      <h3>Mecze</h3>
      <ul>
        {matches.map((match) => (
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
