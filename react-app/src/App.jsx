import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import MatchesList from "./components/MatchesList";
import MatchDetails from "./components/MatchDetails";
import OddsPanel from "./components/OddsPanel";
import Top5 from "./components/Top5";
import { calculateTop5 } from "./utils/top5";
import { mapRawMatch } from "./utils/mapper";
import UserMenu from './components/UserMenu';

const parseMatchDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr.includes('.')) {
    const datePart = dateStr.split(',')[0].trim();
    const parts = datePart.split('.');
    if (parts.length === 3) {
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
  }
  return new Date(dateStr);
};

function App() {
  // ✅ INICJALIZACJA Z LOCALSTORAGE (Zapamiętywanie po F5)
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("bet_activeTab") || "matches");
  const [selectedSport, setSelectedSport] = useState(() => localStorage.getItem("bet_selectedSport") || null);
  const [selectedLeague, setSelectedLeague] = useState(() => localStorage.getItem("bet_selectedLeague") || null);
  const [timeFilter, setTimeFilter] = useState(() => localStorage.getItem("bet_timeFilter") || "all");
  const [showOnlyCommon, setShowOnlyCommon] = useState(() => localStorage.getItem("bet_showOnlyCommon") === "true");

  const [matches, setMatches] = useState([]);
  const [favorites, setFavorites] = useState([]); 
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // ✅ NOWY STAN DLA TIMERA
  const [timeLeft, setTimeLeft] = useState("00:00:00");

  // ✅ NOWY USEEFFECT - LOGIKA ODLICZANIA DO PÓŁNOCY (24H)
  useEffect(() => {
    const getNextMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 0, 0); // Ustawienie na najbliższą północ
      return next.getTime();
    };

    let targetTime = getNextMidnight();

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft("Aktualizowanie...");
        targetTime = getNextMidnight(); // Reset na kolejny dzień
        return;
      }

      const h = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
      const m = String(Math.floor((diff / 1000 / 60) % 60)).padStart(2, '0');
      const s = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
      
      setTimeLeft(`${h}:${m}:${s}`);
    };

    updateTimer(); // Pierwsze wywołanie, żeby nie było mignięcia
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId); // Czyszczenie interwału po odmontowaniu
  }, []);

  // ✅ ZAPISYWANIE DO LOCALSTORAGE PRZY KAŻDEJ ZMIANIE
  useEffect(() => {
    localStorage.setItem("bet_activeTab", activeTab);
    
    if (selectedSport) localStorage.setItem("bet_selectedSport", selectedSport);
    else localStorage.removeItem("bet_selectedSport");
    
    if (selectedLeague) localStorage.setItem("bet_selectedLeague", selectedLeague);
    else localStorage.removeItem("bet_selectedLeague");
    
    localStorage.setItem("bet_timeFilter", timeFilter);
    localStorage.setItem("bet_showOnlyCommon", showOnlyCommon);
  }, [activeTab, selectedSport, selectedLeague, timeFilter, showOnlyCommon]);

  // ✅ LOAD DATA
  useEffect(() => {
    fetch("http://localhost:3001/api/matches")
      .then(res => res.json())
      .then(data => {
        const mapped = data.map((m, i) => mapRawMatch(m, i));
        setMatches(mapped);
        setLoading(false);
      })
      .catch(err => {
        console.error("Błąd pobierania meczów:", err);
        setLoading(false);
      });

    fetch("http://localhost:3001/api/favorites", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setFavorites(data);
      })
      .catch(err => console.error("Błąd pobierania ulubionych:", err));
  }, []);

  // ✅ OBSŁUGA ULUBIONYCH
  const handleToggleFavorite = async (matchName) => {
    const isFav = favorites.includes(matchName);
    const method = isFav ? 'DELETE' : 'POST';
    const url = isFav 
      ? `http://localhost:3001/api/favorites/${encodeURIComponent(matchName)}` 
      : `http://localhost:3001/api/favorites`;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: isFav ? null : JSON.stringify({ match_name: matchName })
      });

      if (res.ok) {
        if (isFav) {
          setFavorites(prev => prev.filter(name => name !== matchName));
        } else {
          setFavorites(prev => [...prev, matchName]);
        }
      }
    } catch (err) {
      console.error("Błąd zapisu ulubionych:", err);
    }
  };

  const SPORTS_ORDER = ["Piłka nożna", "Koszykówka", "Tenis", "Piłka ręczna", "Boks"];
  const sports = Array.from(new Set(matches.map(m => m.sport))).filter(s => s && s !== "Inne").sort((a, b) => SPORTS_ORDER.indexOf(a) - SPORTS_ORDER.indexOf(b));

  const filteredMatches = matches.filter(m => {
    const matchSport = (!selectedSport || m.sport === selectedSport);
    const matchLeague = (!selectedLeague || m.league === selectedLeague);
    const matchSearch = m.match.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchCommon = true;
    if (showOnlyCommon) {
      const hasValidOdd = (bookie) => bookie && ((bookie.home && bookie.home !== "-") || (bookie.draw && bookie.draw !== "-") || (bookie.away && bookie.away !== "-"));
      matchCommon = hasValidOdd(m.betclic) && hasValidOdd(m.superbet);
    }

    let matchTime = true;
    if (timeFilter !== "all") {
      const matchDateObj = parseMatchDate(m.date);
      if (!matchDateObj || isNaN(matchDateObj)) {
        matchTime = false; 
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const matchDay = new Date(matchDateObj);
        matchDay.setHours(0, 0, 0, 0);

        const diffDays = Math.round((matchDay - today) / (1000 * 60 * 60 * 24));

        if (timeFilter === "today") {
          matchTime = diffDays === 0;
        } else if (timeFilter === "tomorrow") {
          matchTime = diffDays === 1;
        } else if (timeFilter === "dayAfter") {
          matchTime = diffDays === 2;
        }
      }
    }

    return matchSport && matchLeague && matchSearch && matchCommon && matchTime;
  });

  const top5 = calculateTop5(filteredMatches);
  const favoriteMatches = filteredMatches.filter(m => favorites.includes(m.match));

  if (loading) return <p style={{ padding: "20px" }}>Ładowanie danych…</p>;

  function handleSelectMatch(match) {
    setSelectedMatch(match);
    window.scrollTo(0, 0); 
  }

  const timeBtnStyle = (filterType) => ({
    padding: "8px 12px",
    borderRadius: "6px",
    border: timeFilter === filterType ? "1px solid #3b82f6" : "1px solid #444",
    backgroundColor: timeFilter === filterType ? "#3b82f6" : "#1e1e1e",
    color: timeFilter === filterType ? "white" : "#aaa",
    cursor: "pointer",
    fontWeight: timeFilter === filterType ? "bold" : "normal",
    transition: "all 0.2s ease"
  });

  return (
    <div className="app">
      <header className="header" style={{ position: "relative" }}>
        <h1>Comparing rates</h1>
        
        {/* ✅ ZMODYFIKOWANY KONTENER: Panel statystyk + Polubione mecze */}
        <div style={{ 
          position: "absolute", right: "150px", top: "50%", transform: "translateY(-50%)", 
          display: "flex", alignItems: "center", gap: "15px", zIndex: 100 
        }}>
          
          {/* NOWY PANEL INFORMACYJNY (Licznik + Timer) */}
          <div style={{ 
            display: "flex", alignItems: "center", gap: "10px", color: "#a0aec0", 
            fontSize: "14px", fontWeight: "500", backgroundColor: "rgba(255, 255, 255, 0.05)", 
            padding: "8px 12px", borderRadius: "6px", border: "1px solid #444" 
          }}>
            <span>Aktywne mecze: <strong>{filteredMatches.length}</strong></span>
            <span style={{ color: "#4a5568" }}>|</span>
            <span>Nowe za: <strong style={{ color: "#fff" }}>{timeLeft}</strong></span>
          </div>

          <button 
            onClick={() => {
              setActiveTab("favorites");
              setSelectedMatch(null); 
              setSelectedSport(null);  
              setSelectedLeague(null); 
            }} 
            style={{ 
              backgroundColor: activeTab === "favorites" ? "#2a2a2a" : "transparent",
              color: activeTab === "favorites" ? "#fbbf24" : "#aaa",
              border: activeTab === "favorites" ? "1px solid #fbbf24" : "1px solid #444",
              padding: "8px 15px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold",
              transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: "6px"
            }}
          >
            ⭐ Polubione mecze ({favorites.length})
          </button>

        </div>

        <UserMenu />
      </header>

      <div className="layout">
        <aside className="sidebar">
          <Sidebar
            sports={sports}
            matches={matches}
            selectedSport={selectedSport}
            selectedLeague={selectedLeague}
            onSelectSport={(s) => { setSelectedSport(s); setSelectedMatch(null); }}
            onSelectLeague={(l) => { setSelectedLeague(l); setSelectedMatch(null); }}
            showOnlyCommon={showOnlyCommon}
            onToggleCommon={() => setShowOnlyCommon(!showOnlyCommon)}
          />
        </aside>

        <main className="content">
          {selectedMatch ? (
            <div className="match-subpage" style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
              <button 
                onClick={() => setSelectedMatch(null)}
                style={{ background: "#3b82f6", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", marginBottom: "20px", fontSize: "1em", display: "flex", alignItems: "center", gap: "8px" }}
              >
                ⬅ Wróć do listy meczów
              </button>
              <div className="card" style={{ marginBottom: "20px" }}><MatchDetails match={selectedMatch} /></div>
              <div className="card"><OddsPanel match={selectedMatch} /></div>
            </div>
          ) : (
            <div className="matches-column" style={{ width: "100%", maxWidth: "1000px", margin: "0 auto" }}>
              
              <div className="top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                
                {/* DODANO margin: 0, żeby nadpisać ewentualne marginesy z CSS */}
                <div className="tabs" style={{ display: 'flex', alignItems: 'center', margin: 0 }}>
                  <button className={activeTab === "matches" ? "tab active" : "tab"} onClick={() => setActiveTab("matches")}>Mecze</button>
                  <button className={activeTab === "top" ? "tab active" : "tab"} onClick={() => setActiveTab("top")}>Najlepsze okazje</button>
                </div>

                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', margin: 0 }}>
                  
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button style={timeBtnStyle("all")} onClick={() => setTimeFilter("all")}>Wszystkie</button>
                    <button style={timeBtnStyle("today")} onClick={() => setTimeFilter("today")}>Mecze na dzisiaj</button>
                    <button style={timeBtnStyle("tomorrow")} onClick={() => setTimeFilter("tomorrow")}>Mecze na jutro</button>
                    <button style={timeBtnStyle("dayAfter")} onClick={() => setTimeFilter("dayAfter")}>Mecze na pojutrze</button>
                  </div>

                  <div className="search-bar" style={{ margin: 0 }}>
                    <input placeholder="Szukaj meczu…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="card">
                {activeTab === "matches" && (
                  <MatchesList matches={filteredMatches} selectedMatch={selectedMatch} onSelect={handleSelectMatch} favorites={favorites} onToggleFavorite={handleToggleFavorite} />
                )}
                {activeTab === "favorites" && (
                  <MatchesList matches={favoriteMatches} selectedMatch={selectedMatch} onSelect={handleSelectMatch} favorites={favorites} onToggleFavorite={handleToggleFavorite} groupBySport={true} />
                )}
                {activeTab === "top" && (
                  <Top5 items={top5} onSelect={(match) => { setActiveTab("matches"); handleSelectMatch(match); }} />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;