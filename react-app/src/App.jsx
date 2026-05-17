import { useState } from "react";
import MatchDetails from "./components/MatchDetails";
import MatchesList from "./components/MatchesList";
import OddsPanel from "./components/OddsPanel";

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
      away: "Chelsea",
      odds: [
        { bookmaker: "Bet365", home: 1.8, away: 2.1 },
        { bookmaker: "Unibet", home: 1.9, away: 2.0 }
      ]
    },
    {
      id: 2,
      sportName: "Football",
      tournamentName: "La Liga",
      categoryName: "Spain",
      startTime: "2026-05-18 20:00",
      home: "Real Madrid",
      away: "Barcelona",
      odds: []
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

      <OddsPanel odds={selectedMatch?.odds} />
    </div>
  );
}

export default App;
