import { useState } from "react";
import Sidebar from "./components/Sidebar";
import MatchesList from "./components/MatchesList";
import MatchDetails from "./components/MatchDetails";
import OddsPanel from "./components/OddsPanel";
import { calculateTop5 } from "./utils/top5";
import Top5 from "./components/Top5";


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
  const top5 = calculateTop5(matches);

  return (
    <div className="app">
      <header className="header">
        <h1>Odds Comparison App (React)</h1>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <Sidebar
            sports={sports}
            selectedSport={selectedSport}
            onSelectSport={(sport) => {
              setSelectedSport(sport);
              setSelectedMatch(null);
            }}
          />
        </aside>

        <main className="content">
          <div className="card">
            <MatchesList
              matches={filteredMatches}
              selectedMatch={selectedMatch}
              onSelect={setSelectedMatch}
            />
          </div>

          <div className="card">
            <MatchDetails match={selectedMatch} />
          </div>

          <div className="card">
            <OddsPanel odds={selectedMatch?.odds} />
          </div>

          <div className="card">
            <Top5
              items={top5}
              onSelect={(item) => {
                setSelectedSport(item.sport);
                setSelectedMatch(
                  matches.find(m => m.id === item.id) || null
                );
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;