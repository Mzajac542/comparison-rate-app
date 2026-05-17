import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import MatchesList from "./components/MatchesList";
import MatchDetails from "./components/MatchDetails";
import OddsPanel from "./components/OddsPanel";
import { calculateTop5 } from "./utils/top5";
import Top5 from "./components/Top5";
import { mapRawMatch } from "./utils/mapper";

function App() {
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const sports = ["Football", "Basketball"];

  
  useEffect(() => {
    const files = [
      "/data/fixtures_2026-05-17.json",
      "/data/fixtures_2026-05-19.json",
      "/data/fixtures_2026-05-21.json",
      "/data/fixtures_2026-05-23.json"
    ];

    Promise.all(files.map(url =>
      fetch(url).then(res => {
        if (!res.ok) throw new Error("Błąd pobierania " + url);
        return res.json();
      })
    ))
      .then(results => {
        // ✅ SCALANIE DANYCH
        const allRawMatches = results.flat();
        const mapped = allRawMatches.map(mapRawMatch);

        setMatches(mapped);
        setSelectedSport(null);
        setSelectedMatch(null);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);


  const filteredMatches = selectedSport
    ? matches.filter(m => m.sport === selectedSport)
    : [];
  const top5 = calculateTop5(matches);

  if (loading) {
    return <p style={{ padding: "20px" }}>Ładowanie danych…</p>;
  }

  if (error) {
    return <p style={{ padding: "20px", color: "red" }}>Błąd: {error}</p>;
  }

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