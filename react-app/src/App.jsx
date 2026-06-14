import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import MatchesList, { getMatchStatus } from "./components/MatchesList";
import MatchDetails from "./components/MatchDetails";
import OddsPanel from "./components/OddsPanel";
import Top5 from "./components/Top5";
import { calculateTop5 } from "./utils/top5";
import { mapRawMatch } from "./utils/mapper";
import UserMenu from './components/UserMenu';
import "./App.css";
import { supabase } from './supabaseClient';
import { createClient } from '@supabase/supabase-js';

// Lista polskich bukmacherów do podziału na kolumny
const POLISH_BOOKMAKERS = [
  "superbet", "betclic", "fortuna", "sts", "forbet", 
  "fuksiarz", "lv bet", "totalbet", "betfan", "goplusbet"
];

// 🔥 Nowa, niezawodna funkcja - czyta format DD.MM.YYYY
const parseMatchDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Zabezpieczenie, by wziąć tylko pierwszą część (np. z "06.06.2026")
  const datePart = String(dateStr).split(' ')[0].split(',')[0].trim();

  if (datePart.includes('.')) {
    const parts = datePart.split('.');
    if (parts.length === 3) {
      // Zwracamy w formacie, który przeglądarka bezbłędnie przelicza (YYYY-MM-DD)
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
    }
  }
  
  return new Date(dateStr); // Fallback w razie czego
};

function App() {
  // ✅ INICJALIZACJA Z LOCALSTORAGE (Zapamiętywanie po F5)
  const [activeTab, setActiveTab] = useState(() => {
  try {
    return localStorage.getItem("bet_activeTab") || "matches";
  } catch {
    return "matches";
  }
});
  const [selectedSport, setSelectedSport] = useState(() => localStorage.getItem("bet_selectedSport") || null);
  const [selectedLeague, setSelectedLeague] = useState(() => localStorage.getItem("bet_selectedLeague") || null);
  const [timeFilter, setTimeFilter] = useState(() => localStorage.getItem("bet_timeFilter") || "all");
  const [showOnlyCommon, setShowOnlyCommon] = useState(false);

  const [matches, setMatches] = useState([]);
  const [favorites, setFavorites] = useState([]); 
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // ✅ NOWY STAN DLA TIMERA I BUKMACHERÓW
  const [timeLeft, setTimeLeft] = useState("00:00:00");
  const [showBookmakers, setShowBookmakers] = useState(false);

  // ✅ STANY KALKULATORA
  const [showCalc, setShowCalc] = useState(false);
  const [calcMatch, setCalcMatch] = useState(null);
  const [calcInputs, setCalcInputs] = useState({ amount: "", type: "", bookieA: "", bookieB: "" });

  const openCalc = (match) => {
    setCalcMatch(match);
    const bookies = Object.keys(match.kursy || {});
    setCalcInputs({ amount: 100, type: "1", bookieA: bookies[0] || "", bookieB: bookies[1] || "" });
    setShowCalc(true);
  };

  const calcResult = () => {
  const matchSource = calcMatch || selectedMatch;

  if (!matchSource || !matchSource.kursy || !calcInputs.bookieA || !calcInputs.bookieB) {
    return { gainA: 0, gainB: 0, diff: 0 };
  }

  const getOdd = (b, t) => {
  const bookieData = matchSource.kursy?.[b];

  if (!bookieData) return 0;

  let value;

  if (t === "1") {
    value = bookieData.home || bookieData["1"];
  } else if (t === "X") {
    value = bookieData.draw || bookieData["X"];
  } else {
    value = bookieData.away || bookieData["2"];
  }

  if (!value || value === "-") return 0;

  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

  const amount = parseFloat(calcInputs.amount) || 0;

  const gainA = amount * getOdd(calcInputs.bookieA, calcInputs.type);
  const gainB = amount * getOdd(calcInputs.bookieB, calcInputs.type);

  return { gainA, gainB, diff: gainB - gainA };
};

  // ✅ TIMER
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const target = new Date();
      
      // Ustawiamy cel na 00:01 dnia następnego
      target.setHours(0, 1, 0, 0);
      if (now > target) {
        target.setDate(target.getDate() + 1);
      }
      
      const diff = target - now;
      
      const h = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
      const m = String(Math.floor((diff / 1000 / 60) % 60)).padStart(2, '0');
      const s = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
      
      setTimeLeft(`${h}:${m}:${s}`);
    };

    updateTimer(); // Wywołaj raz od razu
    const intervalId = setInterval(updateTimer, 1000); // Odświeżaj co sekundę
    
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
  if (selectedMatch) {
    setCalcInputs({
      amount: "",
      type: "",
      bookieA: "",
      bookieB: ""
    });
  }
}, [selectedMatch]);


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

  // ✅ LOAD DATA Z SUPABASE
  useEffect(() => {
    async function loadData() {
      try {
        // Zmień ten fragment w useEffect:
        const { data, error } = await supabase
          .from('matches')
          .select('data') // Pobierz wszystkie kolumny dla wiersza
          .eq('id', 1)
          .single();

        if (error) throw error;

        // Teraz dostęp do danych będzie przez data.data
        if (data && data.data) {
            const mapped = data.data.map((m, i) => mapRawMatch(m, i));
            setMatches(mapped);
        }
      } catch (err) {
        console.error("Błąd pobierania z Supabase:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

useEffect(() => {
  async function loadFavorites() {
    const { data, error } = await supabase
      .from('favorites')
      .select('match_name'); // Pobieramy tylko nazwy meczów

    if (error) {
      console.error("Błąd pobierania ulubionych z Supabase:", error);
    } else {
      setFavorites(data.map(item => item.match_name));
    }
  }
  loadFavorites();
}, []);

  // ✅ OBSŁUGA ULUBIONYCH
  const handleToggleFavorite = async (matchName) => {
  const isFav = favorites.includes(matchName);

  if (isFav) {
    // USUWANIE z Supabase
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('match_name', matchName);

    if (!error) {
      setFavorites(prev => prev.filter(name => name !== matchName));
    }
  } else {
    // DODAWANIE do Supabase
    const { error } = await supabase
      .from('favorites')
      .insert([{ match_name: matchName }]);

    if (!error) {
      setFavorites(prev => [...prev, matchName]);
    }
  }
};

  // ✅ KALKULACJA BUKMACHERÓW (ZMODYFIKOWANA)
  const getBookmakerStats = () => {
    const stats = { polish: [], foreign: [] };
    const rawStats = {};

    matches.forEach(match => {
      if (match.kursy) {
        Object.keys(match.kursy).forEach(bookie => {
          rawStats[bookie] = (rawStats[bookie] || 0) + 1;
        });
      }
    });

    // Podział na polskie i zagraniczne oraz sortowanie malejąco
    Object.entries(rawStats).forEach(([name, count]) => {
      const isPolish = POLISH_BOOKMAKERS.includes(name.toLowerCase());
      if (isPolish) {
        stats.polish.push([name, count]);
      } else {
        stats.foreign.push([name, count]);
      }
    });

    stats.polish.sort((a, b) => b[1] - a[1]);
    stats.foreign.sort((a, b) => b[1] - a[1]);

    return stats;
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
      matchCommon = hasValidOdd(m.betclic) && hasValidOdd(m.superbet) && hasValidOdd(m.fortuna);
    }

    let matchTime = true;
    
    // Zawsze sprawdzamy datę, żeby odrzucić stare, zakończone mecze
    const matchDateObj = parseMatchDate(m.dzien || m.date);

    if (!matchDateObj || isNaN(matchDateObj.getTime())) {
      matchTime = false; 
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const matchDay = new Date(matchDateObj);
      matchDay.setHours(0, 0, 0, 0);

      // Różnica w dniach między dzisiaj a meczem
      const diffDays = Math.round((matchDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (timeFilter === "today") {
        matchTime = diffDays === 0;
      } else if (timeFilter === "tomorrow") {
        matchTime = diffDays === 1;
      } else if (timeFilter === "dayAfter") {
        matchTime = diffDays === 2;
      } else if (timeFilter === "all") {
        // 🔥 FIX: "Wszystkie" obejmuje teraz tylko dzisiaj (0), jutro (1) i pojutrze (2)
        matchTime = (diffDays >= 0 && diffDays <= 2);
      } else {
        matchTime = false; 
      }
    }

    const matchStatus = getMatchStatus(m);
    const isFinished = matchStatus.text === "ZAKOŃCZONO";

    return matchSport && matchLeague && matchSearch && matchCommon && matchTime && !isFinished;
  });

  const top5 = calculateTop5(filteredMatches);
  const favoriteMatches = filteredMatches.filter(m => favorites.includes(m.match));
  
  // Pobieramy statystyki podzielone na dwie grupy
  const { polish: polishBookies, foreign: foreignBookies } = getBookmakerStats();
  const totalBookmakersCount = polishBookies.length + foreignBookies.length;

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

  // Wspólny komponent do renderowania pojedynczego wiersza bukmachera
  const renderBookieItem = ([name, count]) => (
    <li key={name} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      backgroundColor: "#2a2a2a", padding: "12px 15px",
      borderRadius: "8px", color: "#e2e8f0", fontWeight: "500",
      borderLeft: "4px solid #10b981"
    }}>
      <span style={{ textTransform: "capitalize" }}>{name}</span>
      <span style={{ backgroundColor: "#10b981", color: "#fff", padding: "3px 10px", borderRadius: "12px", fontSize: "0.85em", fontWeight: "bold" }}>
        {count} {count === 1 ? "mecz" : (count > 1 && count < 5) ? "mecze" : "meczów"}
      </span>
    </li>
  );

  return (
    <div className="app">
      <header className="header" style={{ position: "relative" }}>
      <h1>Comparing <span>Rates</span></h1>
        
        <div style={{ 
          position: "absolute", right: "150px", top: "50%", transform: "translateY(-50%)", 
          display: "flex", alignItems: "center", gap: "15px", zIndex: 100 
        }}>
          
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
            onClick={() => setShowBookmakers(true)}
            style={{ 
              backgroundColor: showBookmakers ? "#2a2a2a" : "transparent",
              color: showBookmakers ? "#10b981" : "#aaa",
              border: showBookmakers ? "1px solid #10b981" : "1px solid #444",
              padding: "8px 15px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold",
              transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: "6px"
            }}
          >
            📊 Dostępni Bukmacherzy
          </button>

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
            <div className="match-subpage" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
              <button 
                onClick={() => setSelectedMatch(null)}
                style={{ background: "#3b82f6", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", marginBottom: "20px" }}
              >
                ⬅ Wróć do listy meczów
              </button>
              
              {/* Układ dwukolumnowy: tabela po lewej, kalkulator po prawej */}
              <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
                
                {/* Kolumna 1: Szczegóły i Kursy */}
                <div style={{ flex: 2 }}>
                  <div className="card" style={{ marginBottom: "20px" }}><MatchDetails match={selectedMatch} /></div>
                  <div className="card"><OddsPanel match={selectedMatch} /></div>
                </div>
                
                {/* Kolumna 2: Kalkulator */}
              <div style={{ flex: 1 }}>
                <div className="card" style={{ padding: "20px", backgroundColor: "#1e1e1e", border: "1px solid #333", borderRadius: "12px", position: "sticky", top: "20px" }}>
                  <h2 style={{ fontSize: "1.2em", marginBottom: "15px", color: "#fff" }}>Kalkulator</h2>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {/* Kwota */}
                    <label style={{ color: "#aaa", fontSize: "0.8em" }}>Kwota:</label>
                    <input 
                      type="number" 
                      value={calcInputs.amount} 
                      onChange={e => setCalcInputs({...calcInputs, amount: parseFloat(e.target.value) || 0})} 
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#2a2a2a", color: "#fff" }}
                    />

                    {/* Wybór typu */}
                    <label style={{ color: "#aaa", fontSize: "0.8em" }}>Typ:</label>
                    <select 
                      value={calcInputs.type}
                      onChange={e => setCalcInputs({...calcInputs, type: e.target.value})} 
                      style={{ padding: "8px", borderRadius: "4px", background: "#2a2a2a", color: "#fff", border: "1px solid #444" }}
                    >
                      
                      <option value="">-- wybierz typ --</option>
                      <option value="1">Typ 1</option>
                      <option value="X">Typ X</option>
                      <option value="2">Typ 2</option>

                    </select>

                    {/* Wybór Bukmacherów */}
                    <label style={{ color: "#aaa", fontSize: "0.8em" }}>Bukmacher 1:</label>
                                      
                    <select
                      value={calcInputs.bookieA}
                      onChange={e => setCalcInputs({...calcInputs, bookieA: e.target.value})}
                      style={{ padding: "8px", background: "#2a2a2a", color: "#fff", border: "1px solid #444" }}
                    >

                      <option value="">-- wybierz bukmachera --</option>

                      {Object.keys(selectedMatch.kursy || {}).map(b => 
                        <option key={b} value={b}>{b}</option>
                      )}

                    </select>
                    <label style={{ color: "#aaa", fontSize: "0.8em" }}>Bukmacher 2:</label>
                    
                      
                  <select
                    value={calcInputs.bookieB}
                    onChange={e => setCalcInputs({...calcInputs, bookieB: e.target.value})}
                    style={{ padding: "8px", background: "#2a2a2a", color: "#fff", border: "1px solid #444" }}
                  >

                    <option value="">-- wybierz bukmachera --</option>

                    {Object.keys(selectedMatch.kursy || {}).map(b => 
                      <option key={b} value={b}>{b}</option>
                    )}

                  </select>

                  </div>

                  {/* Wynik */}
                  <div style={{ marginTop: "20px", padding: "15px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
                    <p style={{ margin: "0 0 5px 0", color: "#aaa", fontSize: "0.9em" }}>Wygrywasz więcej po postawieniu na Bukmacher 2:</p>
                    <strong style={{ fontSize: "1.4em", color: calcResult().diff >= 0 ? "#10b981" : "#ef4444" }}>                   
                      {calcInputs.amount && calcInputs.type && calcInputs.bookieA && calcInputs.bookieB
                        ? `${calcResult().diff.toFixed(2)} PLN`
                        : "--"
                      }
                    </strong>
                    <div style={{ fontSize: "0.75em", color: "#666", marginTop: "5px" }}>
                      (Bukmacher 2 - Bukmacher 1)
                    </div>
                  </div>
                </div>
              </div>
                
              </div>
            </div>
          ) : (
            <div className="matches-column" style={{ width: "100%", maxWidth: "1000px", margin: "0 auto" }}>
              
              <div className="top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                
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
                  filteredMatches && filteredMatches.length > 0 ? (
                    <MatchesList 
                      matches={filteredMatches} 
                      selectedMatch={selectedMatch} 
                      onSelect={handleSelectMatch} 
                      favorites={favorites} 
                      onToggleFavorite={handleToggleFavorite} 
                      onOpenCalc={openCalc}
                    />
                  ) : (
                    <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                      <p>Brak meczów spełniających wybrane kryteria.</p>
                    </div>
                  )
                )}
                
                {activeTab === "favorites" && (
                  favoriteMatches && favoriteMatches.length > 0 ? (
                    <MatchesList 
                      matches={favoriteMatches} 
                      selectedMatch={selectedMatch} 
                      onSelect={handleSelectMatch} 
                      favorites={favorites} 
                      onToggleFavorite={handleToggleFavorite} 
                      groupBySport={true} 
                      onOpenCalc={openCalc} 
                    />
                  ) : (
                    <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                      <p>Brak polubionych meczów.</p>
                    </div>
                  )
                )}

                {activeTab === "top" && (
                  <Top5 items={filteredMatches} onSelect={(match) => { setActiveTab("matches"); handleSelectMatch(match); }} />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ✅ OKIENKO MODAL Z ROZDZIELONYMI LISTAMI BUKMACHERÓW */}
      {showBookmakers && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            backgroundColor: "#1e1e1e", border: "1px solid #333",
            borderRadius: "12px", padding: "25px", width: "95%", maxWidth: "800px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            maxHeight: "85vh", display: "flex", flexDirection: "column"
          }}>
            <h2 style={{ margin: "0 0 20px 0", color: "#fff", textAlign: "center", borderBottom: "1px solid #333", paddingBottom: "15px" }}>
              Dostępni bukmacherzy ({totalBookmakersCount})
            </h2>
            
            {/* Dwie kolumny obok siebie */}
            <div style={{ 
              display: "flex", 
              gap: "25px", 
              overflowY: "auto", 
              flexGrow: 1,
              paddingRight: "5px"
            }}>
              
              {/* Kolumna: Polskie */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <h3 style={{ color: "#10b981", fontSize: "1.1em", marginTop: 0, marginBottom: "12px", borderBottom: "1px solid #2a2a2a", paddingBottom: "5px" }}>
                  Polscy ({polishBookies.length})
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {polishBookies.length > 0 ? (
                    polishBookies.map(renderBookieItem)
                  ) : (
                    <p style={{ color: "#666", fontSize: "0.9em", margin: 0 }}>Brak danych</p>
                  )}
                </ul>
              </div>

              {/* Linia podziału pionowego */}
              <div style={{ width: "1px", backgroundColor: "#333", alignSelf: "stretch" }} />

              {/* Kolumna: Zagraniczni */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <h3 style={{ color: "#3b82f6", fontSize: "1.1em", marginTop: 0, marginBottom: "12px", borderBottom: "1px solid #2a2a2a", paddingBottom: "5px" }}>
                   Zagraniczni ({foreignBookies.length})
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {foreignBookies.length > 0 ? (
                    foreignBookies.map(renderBookieItem)
                  ) : (
                    <p style={{ color: "#666", fontSize: "0.9em", margin: 0 }}>Brak danych</p>
                  )}
                </ul>
              </div>

            </div>

            <button
              onClick={() => setShowBookmakers(false)}
              style={{
                marginTop: "20px", width: "100%", padding: "12px",
                backgroundColor: "#ef4444", color: "white", border: "none",
                borderRadius: "8px", fontWeight: "bold", cursor: "pointer",
                fontSize: "1em", transition: "background 0.2s"
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = "#dc2626"}
              onMouseOut={(e) => e.target.style.backgroundColor = "#ef4444"}
            >
              Zamknij
            </button>
          </div>
        </div>
      )}

      {showCalc && calcMatch && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "#1e1e1e", padding: "25px", borderRadius: "12px", width: "400px", color: "#fff", border: "1px solid #333" }}>
            <h2 style={{ fontSize: "1.2em", marginBottom: "15px" }}>Kalkulator: {calcMatch.match}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input type="number" placeholder="Kwota" value={calcInputs.amount} onChange={e => setCalcInputs({...calcInputs, amount: parseFloat(e.target.value) || 0})} style={{ padding: "8px" }}/>
              <select onChange={e => setCalcInputs({...calcInputs, type: e.target.value})} style={{ padding: "8px" }}>
                <option value="1">Typ 1</option><option value="X">Typ X</option><option value="2">Typ 2</option>
              </select>
              <select onChange={e => setCalcInputs({...calcInputs, bookieA: e.target.value})} style={{ padding: "8px" }}>
                {Object.keys(calcMatch.kursy).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select onChange={e => setCalcInputs({...calcInputs, bookieB: e.target.value})} style={{ padding: "8px" }}>
                {Object.keys(calcMatch.kursy).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#2a2a2a", borderRadius: "8px" }}>
              <p>Różnica (B - A): <strong style={{ color: calcResult().diff > 0 ? "#10b981" : "#ef4444" }}>{calcResult().diff.toFixed(2)} PLN</strong></p>
            </div>
            <button onClick={() => setShowCalc(false)} style={{ marginTop: "15px", width: "100%", padding: "10px", cursor: "pointer" }}>Zamknij</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;