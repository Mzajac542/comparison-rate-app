function Sidebar({
  sports,
  matches,
  selectedSport,
  selectedLeague,
  onSelectSport,
  onSelectLeague
}) {
  const leagues = selectedSport
  ? [
      ...new Set(
        matches
          .filter(m => m.sport === selectedSport)
          .map(m => m.tournamentName)
      )
    ]
  : [];

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
              onSelectLeague(null); // reset ligi
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
              Wszystkie
            </li>

            {leagues.map((league) => (
              <li
                key={league}
                className={league === selectedLeague ? "active" : ""}
                onClick={() => onSelectLeague(league)}
              >
                {league}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default Sidebar;