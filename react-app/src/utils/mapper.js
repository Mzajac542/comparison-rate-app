export function mapRawMatch(raw) {
  const odds = Object.entries(raw.markets?.h2h || {}).map(
    ([bookmaker, values]) => ({
      bookmaker,
      home: values.home,
      away: values.away
    })
  );

  return {
    id: raw.fixtureId,
    sport: raw.sportName,
    sportName: raw.sportName,
    tournamentName: raw.tournamentName,
    categoryName: raw.categoryName,
    startTime: raw.startTime,
    home: raw.participant1Name,
    away: raw.participant2Name,
    odds
  };
}