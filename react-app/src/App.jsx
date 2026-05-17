import MatchDetails from "./components/MatchDetails";

function App() {
  const mockMatch = {
    sportName: "Football",
    tournamentName: "Premier League",
    categoryName: "England",
    startTime: "2026-05-17 18:00",
    home: "Arsenal",
    away: "Chelsea"
  };

  return (
    <div>
      <h1>Odds Comparison App (React)</h1>
      <MatchDetails match={mockMatch} />
    </div>
  );
}

export default App;
