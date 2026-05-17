export function calculateTop5(matches) {
  return matches
    .filter(m => m.odds && m.odds.length > 0)
    .map(m => {
      const homeOdds = m.odds.map(o => o.home);
      const awayOdds = m.odds.map(o => o.away);

      const spread =
        (Math.max(...homeOdds) - Math.min(...homeOdds)) +
        (Math.max(...awayOdds) - Math.min(...awayOdds));

      return {
        id: m.id,
        name: `${m.home} vs ${m.away}`,
        sport: m.sport,
        spread
      };
    })
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 5);
}