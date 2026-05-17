export function getMatchesBySport(fixturesWithOdds, sport) {
  return fixturesWithOdds.filter(
    f => f.sportName.toLowerCase() === sport.toLowerCase()
  );
}