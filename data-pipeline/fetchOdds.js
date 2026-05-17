/**
 * fetchOdds.js
 * ------------
 * LOKALNE MOCK API
 */

import fs from "fs";
import { ODDS_FILE } from "../paths.js"; // ✅ POPRAWNA ŚCIEŻKA

/**
 * Zwraca WSZYSTKIE kursy
 */
export function getOdds() {
  return JSON.parse(
    fs.readFileSync(ODDS_FILE, "utf-8")
  );
}

/**
 * Zwraca kursy dla jednego meczu
 */
export function getOddsForMatch(fixtureId) {
  const allOdds = getOdds();
  return allOdds.find(match => match.fixtureId === fixtureId);
}

/**
 * TRYB TESTOWY
 * node Script/fetchOdds.js test
 */
if (process.argv[2] === "test") {
  const data = getOdds();

  console.log("📦 Liczba meczów:", data.length);

  for (const match of data) {
    console.log("\n========================================");
    console.log(`${match.home} vs ${match.away}`);
    console.log(`Sport: ${match.sport}`);
    console.log(`Turniej: ${match.tournament}`);
    console.log("========================================");

    const rows = Object.entries(match.markets.h2h).map(
      ([bookmaker, odds]) => ({
        bookmaker,
        home: odds.home,
        away: odds.away
      })
    );
    
  // ✅ NAJWIĘKSZY / NAJMNIEJSZY KURS HOME
  const maxHome = rows.reduce((a, b) => (b.home > a.home ? b : a));
  const minHome = rows.reduce((a, b) => (b.home < a.home ? b : a));

  // ✅ NAJWIĘKSZY / NAJMNIEJSZY KURS AWAY
  const maxAway = rows.reduce((a, b) => (b.away > a.away ? b : a));
  const minAway = rows.reduce((a, b) => (b.away < a.away ? b : a));

  console.table(rows);

  console.log("HOME:");
  console.log(`Najwyższy: ${maxHome.bookmaker} (${maxHome.home})`);
  console.log(`Najniższy: ${minHome.bookmaker} (${minHome.home})`);

  console.log("AWAY:");
  console.log(`Najwyższy: ${maxAway.bookmaker} (${maxAway.away})`);
  console.log(`Najniższy: ${minAway.bookmaker} (${minAway.away})`);

  }
}
