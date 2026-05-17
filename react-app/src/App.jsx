import { useState } from "react";
import MatchDetails from "./components/MatchDetails";

function App() {
  const [selectedMatch, setSelectedMatch] = useState(null);

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

      <button onClick={() => setSelectedMatch(mockMatch)}>
        Wybierz mecz
      </button>

      <MatchDetails match={selectedMatch} />
    </div>
  );
}

export default App;