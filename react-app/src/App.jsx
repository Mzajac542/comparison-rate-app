import { useState } from "react";
import MatchDetails from "./components/MatchDetails";
import MatchesList from "./components/MatchesList";

function App() {
  const [selectedMatch, setSelectedMatch] = useState(null);

  const matches = [
    {
      id: 1,
      sportName: "Football",
      tournamentName: "Premier League",
      categoryName: "England",
      startTime: "2026-05-17 18:00",
      home: "Arsenal",
      away: "Chelsea"
    },
    {
      id: 2,
      sportName: "Football",
      tournamentName: "La Liga",
      categoryName: "Spain",
      startTime: "2026-05-18 20:00",
      home: "Real Madrid",
      away: "Barcelona"
    }
  ];

  return (
    <div>
      <h1>Odds Comparison App (React)</h1>

      <MatchesList
        matches={matches}
        onSelect={setSelectedMatch}
      />

      <MatchDetails match={selectedMatch} />
    </div>
  );
}

export default App;