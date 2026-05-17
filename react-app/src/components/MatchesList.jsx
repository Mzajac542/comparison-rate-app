function MatchesList({ matches, onSelect }) {
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
            style={{ cursor: "pointer" }}
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