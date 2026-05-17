function MatchDetails({ match }) {
  if (!match) {
    return <p>Wybierz mecz</p>;
  }

  return (
    <div>
      <p><strong>Sport:</strong> {match.sportName}</p>
      <p><strong>Liga:</strong> {match.tournamentName}</p>
      <p><strong>Kraj:</strong> {match.categoryName}</p>
      <p><strong>Data:</strong> {match.startTime}</p>
      <p><strong>Mecz:</strong> {match.home} vs {match.away}</p>
    </div>
  );
}

export default MatchDetails;