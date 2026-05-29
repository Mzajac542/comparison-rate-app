
function formatDate(dateString) {
  if (!dateString) return "-";

  if (dateString === "Jutro" || dateString === "Pojutrze")
    return dateString;

  const d = new Date(dateString);

  if (isNaN(d)) return dateString;

  return d.toLocaleString();
}


function MatchDetails({ match }) {

  if (!match) {
    return <div>Wybierz mecz</div>;
  }

  return (
    <div>
      <p><strong>Sport:</strong> {match.sport}</p>
      <p><strong>Liga:</strong> {match.league}</p>
      <p><strong>Kraj:</strong> {match.country}</p>
      <p><strong>Data:</strong> {formatDate(match.date)}</p>
      <p><strong>Mecz:</strong> {match.match}</p>
    </div>
  );
}

export default MatchDetails;