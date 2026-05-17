const SPORT_MAP = {
  Soccer: "Football",
  Football: "Football",
  Basketball: "Basketball",
  Boxing: "Boxing",
  Baseball: "Baseball"
};

export function mapRawMatch(raw) {
  const normalizedSport = SPORT_MAP[raw.sport] || raw.sport;

  const odds = Object.entries(raw.markets?.h2h || {}).map(
    ([bookmaker, values]) => ({
      bookmaker,
      home: values.home,
      away: values.away
    })
  );

  return {
    id: raw.fixtureId,

    // ✅ SPORT
    sport: normalizedSport,
    sportName: normalizedSport,

    // ✅ LIGA / TURNIEJ
    tournamentName: raw.tournament,

    // ✅ KRAJ – TU BYŁ BŁĄD
    categoryName: raw.categoryName || raw.categorySlug || "—",

    // ✅ DATA
    startTime: raw.startTime || null,

    // ✅ DRUŻYNY
    home: raw.home,
    away: raw.away,

    // ✅ KURSY
    odds
  };
}