import express from "express";
import { loadAllFixtures, loadOddsMapped } from "./loadFixtures.js";
import { getMatchesBySport } from "./dataService.js";

const app = express();
const PORT = 3000;

// =====================
// STATIC FILES (HTML, CSS, JS)
// =====================
app.use(express.static("public"));

// =====================
// LOAD DATA
// =====================
const fixtures = loadAllFixtures();
const fixturesWithOdds = fixtures.filter(f => f.hasOdds === true);

const oddsMapped = loadOddsMapped();

// =====================
// MAP: fixtureId -> markets
// =====================
const oddsByFixtureId = {};
oddsMapped.forEach(o => {
  oddsByFixtureId[o.fixtureId] = o.markets;
});

// =====================
// API: SPORTS
// =====================
app.get("/api/sports", (req, res) => {
  const sports = [
    ...new Set(fixturesWithOdds.map(f => f.sportName))
  ].sort();

  res.json(sports);
});

// =====================
// API: MATCHES BY SPORT
// =====================
app.get("/api/matches", (req, res) => {
  const sport = req.query.sport;

  if (!sport) {
    return res.status(400).json({ error: "Podaj sport" });
  }

  const matches = getMatchesBySport(fixturesWithOdds, sport);

  // ✅ tylko mecze, które faktycznie mają kursy
  const matchesWithRealOdds = matches.filter(
    m => oddsByFixtureId[m.fixtureId]
  );

  res.json(matchesWithRealOdds);
});

// =====================
// API: MATCH DETAILS + ODDS ANALYSIS
// =====================
app.get("/api/match/:id", (req, res) => {
  const id = req.params.id;

  const match = fixturesWithOdds.find(
    f => String(f.fixtureId) === id
  );

  if (!match) {
    return res.status(404).json({ error: "Mecz nie znaleziony" });
  }

  const oddsH2H = oddsByFixtureId[id]?.h2h || {};

  // ===== MAP ODDS =====
  const rows = Object.entries(oddsH2H).map(
    ([bookmaker, o]) => ({
      bookmaker,
      home: Number(o.home),
      away: Number(o.away)
    })
  );

  // ===== OCHRONA: brak kursów =====
  if (rows.length === 0) {
    return res.json({
      fixtureId: match.fixtureId,
      sportName: match.sportName,
      tournamentName: match.tournamentName,
      categoryName: match.categoryName,
      startTime: match.startTime,
      odds: [],
      analysis: null
    });
  }

  // ===== ANALIZA =====
  const maxHome = rows.reduce((a, b) => b.home > a.home ? b : a);
  const minHome = rows.reduce((a, b) => b.home < a.home ? b : a);

  const maxAway = rows.reduce((a, b) => b.away > a.away ? b : a);
  const minAway = rows.reduce((a, b) => b.away < a.away ? b : a);

  res.json({
    fixtureId: match.fixtureId,
    sportName: match.sportName,
    tournamentName: match.tournamentName,
    categoryName: match.categoryName,
    startTime: match.startTime,

    odds: rows,

    analysis: {
      home: {
        max: maxHome,
        min: minHome,
        spread: Number((maxHome.home - minHome.home).toFixed(2))
      },
      away: {
        max: maxAway,
        min: minAway,
        spread: Number((maxAway.away - minAway.away).toFixed(2))
      }
    }
  });
});

// =====================
// START SERVER
// =====================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API działa\nlnk do strony: http://localhost:${PORT}`);
});