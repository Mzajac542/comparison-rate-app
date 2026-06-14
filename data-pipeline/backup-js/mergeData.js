import fs from "fs";

// ✅ wczytanie danych
const betclic = JSON.parse(fs.readFileSync("./data/betclic_all.json"));
const superbet = JSON.parse(fs.readFileSync("./data/superbet.json"));

// ✅ mapa po meczach
const map = new Map();

// ✅ funkcja normalizacji nazwy
function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ✅ BETCLIC
betclic.forEach(m => {
  const key = normalize(m.match);

  map.set(key, {
    match: m.match,
    date: m.date,
    betclic: m.odds,
    superbet: null
  });
});

// ✅ SUPERBET
superbet.forEach(m => {
  const key = normalize(m.match);

  if (map.has(key)) {
    map.get(key).superbet = m.odds;
  } else {
    map.set(key, {
      match: m.match,
      date: m.date,
      betclic: null,
      superbet: m.odds
    });
  }
});

// ✅ BEST ODDS
const result = Array.from(map.values()).map(m => {
  const best = {
    home: Math.max(
      m.betclic?.home || 0,
      m.superbet?.home || 0
    ),
    draw: Math.max(
      m.betclic?.draw || 0,
      m.superbet?.draw || 0
    ),
    away: Math.max(
      m.betclic?.away || 0,
      m.superbet?.away || 0
    )
  };

  return {
    ...m,
    bestOdds: best
  };
});

fs.writeFileSync("./data/merged.json", JSON.stringify(result, null, 2));

console.log("✅ MERGED:", result.length);
``