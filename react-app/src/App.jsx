import { useState } from "react";
import Sidebar from "./components/Sidebar";
import MatchesList from "./components/MatchesList";
import MatchDetails from "./components/MatchDetails";
import OddsPanel from "./components/OddsPanel";

function App() {
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const sports = ["Football", "Basketball"];

  const matches = [
    {
      id: 1,
      sport: "Football",
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
      sport: "Basketball",
      sportName: "Basketball",
      tournamentName: "NBA",
      categoryName: "USA",
      startTime: "2026-05-18 02:00",
      home: "Lakers",
      away: "Heat",
      odds: []
    }
  ];

  // ✅ LOGIKA POCHODNA (ETAP 3)
  const filteredMatches = selectedSport
    ? matches.filter(m => m.sport === selectedSport)
    : [];

  return (
    <div>
      <h1>Odds Comparison App (React)</h1>

      <Sidebar
        sports={sports}
        onSelectSport={(sport) => {
          setSelectedSport(sport);
          setSelectedMatch(null); // ✅ reset
        }}
      />

      <MatchesList
        matches={filteredMatches}
        onSelect={setSelectedMatch}
      />

      <MatchDetails match={selectedMatch} />
      <OddsPanel odds={selectedMatch?.odds} />
    </div>
  );
}

export default App;