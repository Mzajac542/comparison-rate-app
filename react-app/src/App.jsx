import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import MatchesList from "./components/MatchesList";
import MatchDetails from "./components/MatchDetails";
import OddsPanel from "./components/OddsPanel";
import { calculateTop5 } from "./utils/top5";
import Top5 from "./components/Top5";
import { mapRawMatch } from "./utils/mapper";

function App() {
  const [selectedSport, setSelectedSport] = useState(
    localStorage.getItem("selectedSport")
  );

  const [selectedLeague, setSelectedLeague] = useState(
    localStorage.getItem("selectedLeague")
  );

  const [activeTab, setActiveTab] = useState(
    localStorage.getItem("activeTab") || "matches"
  );

  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch Danych
  useEffect(() => {
    fetch("/data/odds_mapped.json")
      .then(res => {
        if (!res.ok) throw new Error("Błąd pobierania danych");
        return res.json();
      })
      .then(data => {
        const mapped = data.map(mapRawMatch);
        setMatches(mapped);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
  if (selectedSport) {
    localStorage.setItem("selectedSport", selectedSport);
  } else {
    localStorage.removeItem("selectedSport");
  }
}, [selectedSport]);

useEffect(() => {
  if (selectedLeague) {
    localStorage.setItem("selectedLeague", selectedLeague);
  } else {
    localStorage.removeItem("selectedLeague");
  }
}, [selectedLeague]);

useEffect(() => {
  localStorage.setItem("activeTab", activeTab);
}, [activeTab]);

  const sports = Array.from(
  new Set(
    matches
      .filter(m => m.odds && m.odds.length > 0)
      .map(m => m.sport)
  )
).sort((a, b) => a.localeCompare(b));

  // MECZE
  const filteredMatches = selectedSport
    ? matches.filter(
        m => m.sport === selectedSport && m.odds && m.odds.length > 0
      )
    : [];

  // TOP 5 OKAZJI
  const top5 = calculateTop5(matches);

  if (loading) {
    return <p style={{ padding: "20px" }}>Ładowanie danych…</p>;
  }

  if (error) {
    return (
      <p style={{ padding: "20px", color: "red" }}>
        Błąd: {error}
      </p>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Comparing rates</h1>
      </header>

      <div className="layout">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <Sidebar            
            sports={sports}
              matches={matches}
              selectedSport={selectedSport}
              selectedLeague={selectedLeague}
              onSelectSport={setSelectedSport}
              onSelectLeague={setSelectedLeague}
          />
        </aside>

        {/* CONTENT */}
        <main className="content">
          <div className="content-layout">
            {/* LEWA KOLUMNA */}
            <div className="matches-column">
              {/* ZAKŁADKI */}
              <div className="top-bar">
                <div className="tabs">
                  <button
                    className={activeTab === "matches" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("matches")}
                  >
                    Mecze
                  </button>

                  <button
                    className={activeTab === "top" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("top")}
                  >
                    Najlepsze okazje
                  </button>
                </div>

                <div className="search-bar">
                  <input
                    type="text"
                    placeholder="Szukaj meczu lub drużyny…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="card">
                {/*  MECZE  */}
                {activeTab === "matches" && (
                  <MatchesList
                    matches={matches}
                    selectedSport={selectedSport}
                    selectedLeague={selectedLeague}
                    selectedMatch={selectedMatch}
                    searchQuery={searchQuery}
                    onSelect={setSelectedMatch}
                  />
                )}

                {/*  TOP 5  */}
                {activeTab === "top" && (
                  <Top5
                    items={top5}
                    onSelect={(match) => {
                      setActiveTab("matches");
                      setSelectedSport(match.sport);
                      setSelectedMatch(match);
                    }}
                  />
                )}
              </div>
            </div>

            {/* PRAWA KOLUMNA */}
            <div className="details-column">
              <div className="card">
                <MatchDetails match={selectedMatch} />
              </div>

              <div className="card">
                <OddsPanel odds={selectedMatch?.odds} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;