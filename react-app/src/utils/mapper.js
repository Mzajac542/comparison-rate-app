const SPORT_MAP = {
  Soccer: "Football",
  Football: "Football",
  Basketball: "Basketball"
};

export function mapRawMatch(raw) {
  // ✅ wyciąganie kursów z markets.h2h
  const odds = Object.entries(raw.markets?.h2h || {}).map(
    ([bookmaker, values]) => ({
      bookmaker,
      home: values.home,
      away: values.away
    })
  );

  const normalizedSport = SPORT_MAP[raw.sportName] || raw.sportName;

  return {
    id: raw.fixtureId,
    sport: normalizedSport,
    sportName: normalizedSport,
    tournamentName: raw.tournamentName,
    categoryName: raw.categoryName,
    startTime: raw.startTime,
    home: raw.participant1Name,
    away: raw.participant2Name,
    odds // ✅ TERAZ ODDSY TRAFIAJĄ DO REACTA
  };
}
``