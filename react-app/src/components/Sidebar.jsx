function Sidebar({
  sports,
  matches,
  selectedSport,
  selectedLeague,
  onSelectSport,
  onSelectLeague
}) {
  // ✅ 1. NAJPIERW FUNKCJE POMOCNICZE

  const getLeagueCount = (leagueName) => {
    return matches.filter(
      m =>
        m.sport === selectedSport &&
        m.tournamentName === leagueName
    ).length;
  };

  const allMatchesCount = selectedSport
    ? matches.filter(m => m.sport === selectedSport).length
    : 0;

  // ✅ 2. POTEM LOGIKA + SORTOWANIE

  const leagues = selectedSport
  ? [
      ...new Set(
        matches
          .filter(m => m.sport === selectedSport)
          .map(m => m.tournamentName)
      )
    ].sort((a, b) => a.localeCompare(b))
  : [];

  const popularLeagues = [
    "Premier League",
    "La Liga",
    "Bundesliga",
    "Serie A",
    "Ligue 1"
  ];

  const popular = leagues.filter(league =>
    popularLeagues.includes(league)
  );

  const others = leagues.filter(league =>
    !popularLeagues.includes(league)
  );

  return (
    <div>
      <h3>Sporty</h3>
      <ul>
        {sports.map((sport) => (
          <li
            key={sport}
            className={sport === selectedSport ? "active" : ""}
            onClick={() => {
              onSelectSport(sport);
              onSelectLeague(null);
            }}
          >
            {sport}
          </li>
        ))}
      </ul>

      {selectedSport && (
        <>
          <h4>Ligi</h4>
          <ul>
            <li
              className={selectedLeague === null ? "active" : ""}
              onClick={() => onSelectLeague(null)}
            >
              Wszystkie ({allMatchesCount})
            </li>
           {popular.length > 0 && (
                <>
                  <h5>🔥 Popularne ligi</h5>
                  <ul>
                    {popular.map((league) => (
                      <li
                        key={league}
                        className={league === selectedLeague ? "active" : ""}
                        onClick={() => onSelectLeague(league)}
                      >
                        {league} ({getLeagueCount(league)})
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {others.length > 0 && (
                <>
                  <h5>Pozostałe ligi</h5>
                  <ul>
                    {others.map((league) => (
                      <li
                        key={league}
                        className={league === selectedLeague ? "active" : ""}
                        onClick={() => onSelectLeague(league)}
                      >
                        {league} ({getLeagueCount(league)})
                      </li>
                    ))}
                  </ul>
                </>
              )}
          </ul>
        </>
      )}
    </div>
  );
}

export default Sidebar;
