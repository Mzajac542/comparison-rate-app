import { useEffect, useState } from "react";

import Sidebar from "./components/Sidebar";
import MatchesList from "./components/MatchesList";
import MatchDetails from "./components/MatchDetails";
import OddsPanel from "./components/OddsPanel";
import OddsCalculator from "./components/OddsCalculator";
import Top5 from "./components/Top5";
import UserMenu from "./components/UserMenu";

import { calculateTop5 } from "./utils/top5";
import { mapRawMatch } from "./utils/mapper";

import "./App.css";

const POLISH_BOOKMAKERS = [
  "superbet",
  "superbet.pl",
  "betclic",
  "betclic.pl",
  "fortuna",
  "fortuna.pl",
  "efortuna",
  "efortuna.pl",
  "sts",
  "sts.pl",
  "forbet",
  "fuksiarz",
  "fuksiarz.pl",
  "lv bet",
  "lv bet.pl",
  "lvbet",
  "lvbet.pl",
  "totalbet",
  "betfan",
  "betfan.pl",
  "goplusbet",
  "etoto",
  "etoto.pl"
];

const SPORTS_ORDER = [
  "Piłka nożna",
  "Koszykówka",
  "Tenis",
  "Piłka ręczna",
  "Boks"
];

const parseMatchDate = (dateStr) => {
  if (!dateStr) {
    return null;
  }

  const datePart = String(dateStr)
    .split(" ")[0]
    .split(",")[0]
    .trim();

  if (datePart.includes(".")) {
    const parts = datePart.split(".");

    if (parts.length === 3) {
      const [day, month, year] = parts;

      return new Date(
        `${year}-${month}-${day}T00:00:00`
      );
    }
  }

  if (datePart.includes("-")) {
    const parts = datePart.split("-");

    if (parts.length === 3) {
      const [year, month, day] = parts;

      return new Date(
        `${year}-${month}-${day}T00:00:00`
      );
    }
  }

  const fallbackDate = new Date(dateStr);

  return Number.isNaN(fallbackDate.getTime())
    ? null
    : fallbackDate;
};

const normalizeBookmakerName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const getBookmakersCount = (match) => {
  const rawCount = Number(
    match?.rawMatch
      ?.liczba_bukmacherow
  );

  if (
    Number.isFinite(rawCount) &&
    rawCount >= 0
  ) {
    return rawCount;
  }

  const mappedCount = Number(
    match?.liczba_bukmacherow
  );

  if (
    Number.isFinite(mappedCount) &&
    mappedCount >= 0
  ) {
    return mappedCount;
  }

  if (
    Array.isArray(
      match?.rawMatch?.bukmacherzy
    )
  ) {
    return (
      match.rawMatch.bukmacherzy.length
    );
  }

  if (
    Array.isArray(
      match?.bukmacherzy
    )
  ) {
    return match.bukmacherzy.length;
  }

  return 0;
};


function App() {
  const [activeTab, setActiveTab] = useState(
    () =>
      localStorage.getItem("bet_activeTab") ||
      "matches"
  );

  const [selectedSport, setSelectedSport] = useState(
    () =>
      localStorage.getItem("bet_selectedSport") ||
      null
  );

  const [selectedLeague, setSelectedLeague] = useState(
    () =>
      localStorage.getItem("bet_selectedLeague") ||
      null
  );

  const [timeFilter, setTimeFilter] = useState(
    () => {
      const savedFilter =
        localStorage.getItem(
          "bet_timeFilter"
        );

      const allowedFilters = [
        "all",
        "tomorrow",
        "dayAfter"
      ];

      return allowedFilters.includes(
        savedFilter
      )
        ? savedFilter
        : "all";
    }
  );

  const [showOnlyCommon, setShowOnlyCommon] = useState(
    () =>
      localStorage.getItem("bet_showOnlyCommon") ===
      "true"
  );

  const [matches, setMatches] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [selectedMatch, setSelectedMatch] =
    useState(null);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] =
    useState("");

  const [timeLeft, setTimeLeft] =
    useState("00:00:00");

  const [showBookmakers, setShowBookmakers] =
    useState(false);

  /*
   * TIMER
   */
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const target = new Date();

      target.setHours(0, 1, 0, 0);

      if (now > target) {
        target.setDate(
          target.getDate() + 1
        );
      }

      const difference = target - now;

      const hours = String(
        Math.floor(
          difference /
            (1000 * 60 * 60)
        ) % 24
      ).padStart(2, "0");

      const minutes = String(
        Math.floor(
          difference /
            (1000 * 60)
        ) % 60
      ).padStart(2, "0");

      const seconds = String(
        Math.floor(
          difference / 1000
        ) % 60
      ).padStart(2, "0");

      setTimeLeft(
        `${hours}:${minutes}:${seconds}`
      );
    };

    updateTimer();

    const intervalId = setInterval(
      updateTimer,
      1000
    );

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  /*
   * LOCAL STORAGE
   */
  useEffect(() => {
    localStorage.setItem(
      "bet_activeTab",
      activeTab
    );

    if (selectedSport) {
      localStorage.setItem(
        "bet_selectedSport",
        selectedSport
      );
    } else {
      localStorage.removeItem(
        "bet_selectedSport"
      );
    }

    if (selectedLeague) {
      localStorage.setItem(
        "bet_selectedLeague",
        selectedLeague
      );
    } else {
      localStorage.removeItem(
        "bet_selectedLeague"
      );
    }

    localStorage.setItem(
      "bet_timeFilter",
      timeFilter
    );

    localStorage.setItem(
      "bet_showOnlyCommon",
      String(showOnlyCommon)
    );
  }, [
    activeTab,
    selectedSport,
    selectedLeague,
    timeFilter,
    showOnlyCommon
  ]);

  /*
  * POBIERANIE MECZÓW I ULUBIONYCH
  */
  useEffect(() => {
    const loadMatches = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/api/matches",
          {
              credentials: "include"
          }
      )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        const mapped = Array.isArray(data)
          ? data.map((rawMatch, index) => {
              const mappedMatch = mapRawMatch(
                rawMatch,
                index
              );

              return {
                ...mappedMatch,

                rawMatch,

                liczba_bukmacherow: Number(
                  rawMatch?.liczba_bukmacherow ??
                  (
                    Array.isArray(
                      rawMatch?.bukmacherzy
                    )
                      ? rawMatch.bukmacherzy.length
                      : 0
                  )
                )
              };
            })
          : [];

        const onlyTomorrowAndDayAfter =
          mapped.filter((match) => {
            const matchDateObject =
              parseMatchDate(
                match.dzien ||
                match.date
              );

            if (
              !matchDateObject ||
              Number.isNaN(
                matchDateObject.getTime()
              )
            ) {
              return false;
            }

            const today = new Date();

            today.setHours(
              0,
              0,
              0,
              0
            );

            const matchDay = new Date(
              matchDateObject
            );

            matchDay.setHours(
              0,
              0,
              0,
              0
            );

            const differenceInDays =
              Math.round(
                (
                  matchDay.getTime() -
                  today.getTime()
                ) /
                (
                  1000 *
                  60 *
                  60 *
                  24
                )
              );

            return (
              differenceInDays === 1 ||
              differenceInDays === 2
            );
          });

        setMatches(
          onlyTomorrowAndDayAfter
        );
      } catch (error) {
        console.error(
          "Błąd pobierania meczów:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    const loadFavorites = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/api/favorites",
          {
            credentials: "include"
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (Array.isArray(data)) {
          setFavorites(data);
        }
      } catch (error) {
        console.error(
          "Błąd pobierania ulubionych:",
          error
        );
      }
    };

    loadMatches();
    loadFavorites();
  }, []);

  /*
   * ULUBIONE
   */
  const handleToggleFavorite = async (
    matchName
  ) => {
    const isFavorite =
      favorites.includes(matchName);

    const method = isFavorite
      ? "DELETE"
      : "POST";

    const url = isFavorite
      ? `http://localhost:3001/api/favorites/${encodeURIComponent(
          matchName
        )}`
      : "http://localhost:3001/api/favorites";

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: isFavorite
          ? null
          : JSON.stringify({
              match_name: matchName
            })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (isFavorite) {
        setFavorites((previous) =>
          previous.filter(
            (name) => name !== matchName
          )
        );
      } else {
        setFavorites((previous) => [
          ...previous,
          matchName
        ]);
      }
    } catch (error) {
      console.error(
        "Błąd zapisu ulubionych:",
        error
      );
    }
  };

  /*
   * STATYSTYKI BUKMACHERÓW
   */
  const getBookmakerStats = () => {
    const stats = {
      polish: [],
      foreign: []
    };

    const bookmakerStats = {};

    matches.forEach((match) => {
      const bookmakers =
        Array.isArray(match.bukmacherzy)
          ? match.bukmacherzy
          : [];

      if (bookmakers.length > 0) {
        bookmakers.forEach(
          (bookmaker) => {
            const name =
              bookmaker.nazwa ||
              "Nieznany";

            if (!bookmakerStats[name]) {
              bookmakerStats[name] = {
                count: 0,
                type:
                  bookmaker.typ ||
                  "zagraniczny"
              };
            }

            bookmakerStats[name].count += 1;
          }
        );

        return;
      }

      /*
       * Fallback dla starego formatu.
       */
      Object.keys(
        match.kursy || {}
      ).forEach((name) => {
        if (!bookmakerStats[name]) {
          const normalizedName =
            normalizeBookmakerName(name);

          const isPolish =
            POLISH_BOOKMAKERS.includes(
              normalizedName
            );

          bookmakerStats[name] = {
            count: 0,
            type: isPolish
              ? "polski"
              : "zagraniczny"
          };
        }

        bookmakerStats[name].count += 1;
      });
    });

    Object.entries(
      bookmakerStats
    ).forEach(
      ([name, bookmakerData]) => {
        const item = [
          name,
          bookmakerData.count
        ];

        if (
          bookmakerData.type === "polski"
        ) {
          stats.polish.push(item);
        } else {
          stats.foreign.push(item);
        }
      }
    );

    stats.polish.sort(
      (first, second) =>
        second[1] - first[1]
    );

    stats.foreign.sort(
      (first, second) =>
        second[1] - first[1]
    );

    return stats;
  };

  /*
   * SPORTY
   */
  const sports = Array.from(
    new Set(
      matches.map(
        (match) => match.sport
      )
    )
  )
    .filter(
      (sport) =>
        Boolean(sport) &&
        sport !== "Inne"
    )
    .sort((first, second) => {
      const firstIndex =
        SPORTS_ORDER.indexOf(first);

      const secondIndex =
        SPORTS_ORDER.indexOf(second);

      if (
        firstIndex === -1 &&
        secondIndex === -1
      ) {
        return first.localeCompare(
          second,
          "pl"
        );
      }

      if (firstIndex === -1) {
        return 1;
      }

      if (secondIndex === -1) {
        return -1;
      }

      return firstIndex - secondIndex;
    });

  const maximumBookmakersCount =
    matches.reduce(
      (maximumCount, match) =>
        Math.max(
          maximumCount,
          getBookmakersCount(match)
        ),
      0
    );

  /*
   * FILTROWANIE MECZÓW
   */
  const filteredMatches = matches.filter(
    (match) => {
      const matchesSport =
        !selectedSport ||
        match.sport === selectedSport;

      const matchesLeague =
        !selectedLeague ||
        match.league === selectedLeague;

      const matchName =
        match.match ||
        match.mecz ||
        "";

      const matchesSearch = String(
        matchName
      )
        .toLowerCase()
        .includes(
          searchQuery
            .toLowerCase()
            .trim()
        );

      let matchesCommon = true;

      if (showOnlyCommon) {
        const bookmakersCount =
          getBookmakersCount(match);

        matchesCommon =
          maximumBookmakersCount > 0 &&
          bookmakersCount ===
            maximumBookmakersCount;
      }

      let matchesTime = true;

      const matchDateObject =
        parseMatchDate(
          match.dzien ||
            match.date
        );

      if (
        !matchDateObject ||
        Number.isNaN(
          matchDateObject.getTime()
        )
      ) {
        matchesTime = false;
      } else {
        const today = new Date();

        today.setHours(
          0,
          0,
          0,
          0
        );

        const matchDay = new Date(
          matchDateObject
        );

        matchDay.setHours(
          0,
          0,
          0,
          0
        );

        const differenceInDays =
          Math.round(
            (matchDay.getTime() -
              today.getTime()) /
              (1000 * 60 * 60 * 24)
          );

        if (timeFilter === "tomorrow") {
          matchesTime =
            differenceInDays === 1;
        } else if (
          timeFilter === "dayAfter"
        ) {
          matchesTime =
            differenceInDays === 2;
        } else if (
          timeFilter === "all"
        ) {
          matchesTime =
            differenceInDays >= 1 &&
            differenceInDays <= 2;
        } else {
          matchesTime = false;
        }

      }

      return (
        matchesSport &&
        matchesLeague &&
        matchesSearch &&
        matchesCommon &&
        matchesTime
      );
    }
  );

  const top5 = calculateTop5(
    filteredMatches
  );

  const favoriteMatches =
    filteredMatches.filter((match) =>
      favorites.includes(
        match.match
      )
    );

  const {
    polish: polishBookies,
    foreign: foreignBookies
  } = getBookmakerStats();

  const totalBookmakersCount =
    polishBookies.length +
    foreignBookies.length;

  const handleSelectMatch = (match) => {
    setSelectedMatch(match);

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  const handleResetToDefault = () => {
    setActiveTab("matches");
    setSelectedSport(null);
    setSelectedLeague(null);
    setTimeFilter("all");
    setSelectedMatch(null);
    setSearchQuery("");
    setShowOnlyCommon(false);
  };

  const timeButtonStyle = (
    filterType
  ) => ({
    padding: "8px 12px",
    borderRadius: "6px",
    border:
      timeFilter === filterType
        ? "1px solid #3b82f6"
        : "1px solid #444",
    backgroundColor:
      timeFilter === filterType
        ? "#3b82f6"
        : "#1e1e1e",
    color:
      timeFilter === filterType
        ? "#fff"
        : "#aaa",
    cursor: "pointer",
    fontWeight:
      timeFilter === filterType
        ? "bold"
        : "normal",
    transition: "all 0.2s ease"
  });

  const renderBookmakerItem = (
    [name, count],
    accentColor
  ) => (
    <li
      key={name}
      style={{
        display: "flex",
        justifyContent:
          "space-between",
        alignItems: "center",
        gap: "10px",
        backgroundColor: "#2a2a2a",
        padding: "12px 15px",
        borderRadius: "8px",
        color: "#e2e8f0",
        fontWeight: "500",
        borderLeft: `4px solid ${accentColor}`
      }}
    >
      <span>{name}</span>

      <span
        style={{
          backgroundColor:
            accentColor,
          color: "#fff",
          padding: "3px 10px",
          borderRadius: "12px",
          fontSize: "0.85em",
          fontWeight: "bold",
          whiteSpace: "nowrap"
        }}
      >
        {count}{" "}
        {count === 1
          ? "mecz"
          : count > 1 && count < 5
            ? "mecze"
            : "meczów"}
      </span>
    </li>
  );

  if (loading) {
    return (
      <p
        style={{
          padding: "20px",
          color: "#fff"
        }}
      >
        Ładowanie danych...
      </p>
    );
  }

  return (
    <div className="app">
      <header
        className="header"
        style={{
          position: "relative"
        }}
      >
        <h1
          onClick={
            handleResetToDefault
          }
          style={{
            cursor: "pointer",
            userSelect: "none"
          }}
          title="Powrót do strony głównej"
        >
          Comparing <span>Rates</span>
        </h1>

        <div
          style={{
            position: "absolute",
            right: "230px",
            top: "50%",
            transform:
              "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            zIndex: 100
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#a0aec0",
              fontSize: "14px",
              fontWeight: "500",
              backgroundColor:
                "rgba(255, 255, 255, 0.05)",
              padding: "8px 12px",
              borderRadius: "6px",
              border:
                "1px solid #444"
            }}
          >
            <span>
              Aktywne mecze:{" "}
              <strong>
                {
                  filteredMatches.length
                }
              </strong>
            </span>

            <span
              style={{
                color: "#4a5568"
              }}
            >
              |
            </span>

            <span>
              Nowe za:{" "}
              <strong
                style={{
                  color: "#fff"
                }}
              >
                {timeLeft}
              </strong>
            </span>
          </div>

          <button
            onClick={() =>
              setShowBookmakers(true)
            }
            style={{
              backgroundColor:
                showBookmakers
                  ? "#2a2a2a"
                  : "transparent",
              color: showBookmakers
                ? "#10b981"
                : "#aaa",
              border: showBookmakers
                ? "1px solid #10b981"
                : "1px solid #444",
              padding: "8px 15px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              transition:
                "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            📊 Dostępni bukmacherzy
          </button>

          <button
            onClick={() => {
              setActiveTab("favorites");
              setSelectedMatch(null);
              setSelectedSport(null);
              setSelectedLeague(null);
            }}
            style={{
              backgroundColor:
                activeTab === "favorites"
                  ? "#2a2a2a"
                  : "transparent",
              color:
                activeTab === "favorites"
                  ? "#fbbf24"
                  : "#aaa",
              border:
                activeTab === "favorites"
                  ? "1px solid #fbbf24"
                  : "1px solid #444",
              padding: "8px 15px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              transition:
                "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            ⭐ Polubione mecze (
            {favorites.length})
          </button>
        </div>

        <UserMenu />
      </header>

      <div className="layout">
        <aside className="sidebar">
          <Sidebar
            sports={sports}
            matches={matches}
            selectedSport={
              selectedSport
            }
            selectedLeague={
              selectedLeague
            }
            onSelectSport={(sport) => {
              setSelectedSport(sport);
              setSelectedMatch(null);
            }}
            onSelectLeague={(
              league
            ) => {
              setSelectedLeague(
                league
              );
              setSelectedMatch(null);
            }}
            showOnlyCommon={
              showOnlyCommon
            }
            onToggleCommon={() =>
              setShowOnlyCommon(
                (previous) =>
                  !previous
              )
            }
            commonBookmakersCount={
              maximumBookmakersCount
            }
          />
        </aside>

        <main className="content">
          {selectedMatch ? (
            <div
              className="match-subpage"
              style={{
                padding: "20px",
                maxWidth: "1400px",
                margin: "0 auto"
              }}
            >
              <button
                onClick={() =>
                  setSelectedMatch(null)
                }
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  marginBottom: "20px"
                }}
              >
                ← Wróć do listy meczów
              </button>

              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  alignItems:
                    "flex-start",
                  flexWrap: "wrap"
                }}
              >
                <div
                  style={{
                    flex: "2 1 700px",
                    minWidth: 0
                  }}
                >
                  <div
                    className="card"
                    style={{
                      marginBottom:
                        "20px"
                    }}
                  >
                    <MatchDetails
                      match={
                        selectedMatch
                      }
                    />
                  </div>

                  <div className="card">
                    <OddsPanel
                      match={
                        selectedMatch
                      }
                    />
                  </div>
                </div>

                <div
                  style={{
                    flex: "1 1 320px",
                    minWidth: "300px",
                    maxWidth: "420px"
                  }}
                >
                  <OddsCalculator
                    match={
                      selectedMatch
                    }
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              className="matches-column"
              style={{
                width: "100%",
                maxWidth: "1000px",
                margin: "0 auto"
              }}
            >
              <div
                className="top-bar"
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "15px"
                }}
              >
                <div
                  className="tabs"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    margin: 0
                  }}
                >
                  <button
                    className={
                      activeTab ===
                      "matches"
                        ? "tab active"
                        : "tab"
                    }
                    onClick={() =>
                      setActiveTab(
                        "matches"
                      )
                    }
                  >
                    Mecze
                  </button>

                  <button
                    className={
                      activeTab === "top"
                        ? "tab active"
                        : "tab"
                    }
                    onClick={() =>
                      setActiveTab("top")
                    }
                  >
                    Najlepsze okazje
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "15px",
                    alignItems: "center",
                    flexWrap: "wrap",
                    margin: 0
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "5px",
                      flexWrap: "wrap"
                    }}
                  >
                    <button
                      style={timeButtonStyle(
                        "all"
                      )}
                      onClick={() =>
                        setTimeFilter(
                          "all"
                        )
                      }
                    >
                      Wszystkie
                    </button>

                    <button
                      style={timeButtonStyle(
                        "tomorrow"
                      )}
                      onClick={() =>
                        setTimeFilter(
                          "tomorrow"
                        )
                      }
                    >
                      Mecze na jutro
                    </button>

                    <button
                      style={timeButtonStyle(
                        "dayAfter"
                      )}
                      onClick={() =>
                        setTimeFilter(
                          "dayAfter"
                        )
                      }
                    >
                      Mecze na pojutrze
                    </button>
                  </div>

                  <div
                    className="search-bar"
                    style={{ margin: 0 }}
                  >
                    <input
                      placeholder="Szukaj meczu..."
                      value={searchQuery}
                      onChange={(event) =>
                        setSearchQuery(
                          event.target
                            .value
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="card">
                {activeTab ===
                  "matches" && (
                  <MatchesList
                    matches={
                      filteredMatches
                    }
                    selectedMatch={
                      selectedMatch
                    }
                    onSelect={
                      handleSelectMatch
                    }
                    favorites={
                      favorites
                    }
                    onToggleFavorite={
                      handleToggleFavorite
                    }
                  />
                )}

                {activeTab ===
                  "favorites" && (
                  <MatchesList
                    matches={
                      favoriteMatches
                    }
                    selectedMatch={
                      selectedMatch
                    }
                    onSelect={
                      handleSelectMatch
                    }
                    favorites={
                      favorites
                    }
                    onToggleFavorite={
                      handleToggleFavorite
                    }
                    groupBySport
                  />
                )}

                {activeTab === "top" && (
                  <Top5
                    items={top5}
                    onSelect={(match) => {
                      setActiveTab("matches");
                      handleSelectMatch(match);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {showBookmakers && (
        <div
          onClick={() =>
            setShowBookmakers(false)
          }
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor:
              "rgba(0, 0, 0, 0.75)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
            padding: "20px"
          }}
        >
          <div
            onClick={(event) =>
              event.stopPropagation()
            }
            style={{
              backgroundColor:
                "#1e1e1e",
              border: "1px solid #333",
              borderRadius: "12px",
              padding: "25px",
              width: "95%",
              maxWidth: "800px",
              boxShadow:
                "0 10px 25px rgba(0, 0, 0, 0.5)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <h2
              style={{
                margin:
                  "0 0 20px 0",
                color: "#fff",
                textAlign: "center",
                borderBottom:
                  "1px solid #333",
                paddingBottom:
                  "15px"
              }}
            >
              Dostępni bukmacherzy (
              {totalBookmakersCount})
            </h2>

            <div
              style={{
                display: "flex",
                gap: "25px",
                overflowY: "auto",
                flexGrow: 1,
                paddingRight: "5px"
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection:
                    "column"
                }}
              >
                <h3
                  style={{
                    color: "#10b981",
                    fontSize: "1.1em",
                    marginTop: 0,
                    marginBottom:
                      "12px",
                    borderBottom:
                      "1px solid #2a2a2a",
                    paddingBottom:
                      "5px"
                  }}
                >
                  Polscy (
                  {polishBookies.length})
                </h3>

                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection:
                      "column",
                    gap: "8px"
                  }}
                >
                  {polishBookies.length >
                  0 ? (
                    polishBookies.map(
                      (item) =>
                        renderBookmakerItem(
                          item,
                          "#10b981"
                        )
                    )
                  ) : (
                    <li
                      style={{
                        color: "#666",
                        fontSize: "0.9em"
                      }}
                    >
                      Brak danych
                    </li>
                  )}
                </ul>
              </div>

              <div
                style={{
                  width: "1px",
                  backgroundColor:
                    "#333",
                  alignSelf: "stretch"
                }}
              />

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection:
                    "column"
                }}
              >
                <h3
                  style={{
                    color: "#3b82f6",
                    fontSize: "1.1em",
                    marginTop: 0,
                    marginBottom:
                      "12px",
                    borderBottom:
                      "1px solid #2a2a2a",
                    paddingBottom:
                      "5px"
                  }}
                >
                  Zagraniczni (
                  {foreignBookies.length})
                </h3>

                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection:
                      "column",
                    gap: "8px"
                  }}
                >
                  {foreignBookies.length >
                  0 ? (
                    foreignBookies.map(
                      (item) =>
                        renderBookmakerItem(
                          item,
                          "#3b82f6"
                        )
                    )
                  ) : (
                    <li
                      style={{
                        color: "#666",
                        fontSize: "0.9em"
                      }}
                    >
                      Brak danych
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <button
              onClick={() =>
                setShowBookmakers(false)
              }
              style={{
                marginTop: "20px",
                width: "100%",
                padding: "12px",
                backgroundColor:
                  "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "1em",
                transition:
                  "background-color 0.2s"
              }}
              onMouseOver={(event) => {
                event.currentTarget.style.backgroundColor =
                  "#dc2626";
              }}
              onMouseOut={(event) => {
                event.currentTarget.style.backgroundColor =
                  "#ef4444";
              }}
            >
              Zamknij
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;