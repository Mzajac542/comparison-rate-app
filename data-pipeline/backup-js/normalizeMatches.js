import fs from "fs";
// ✅ Wczytanie plików
const file1 = JSON.parse(
  fs.readFileSync("../data/odds.json", "utf-8")
);

const file2 = JSON.parse(
  fs.readFileSync("../data/odds.json", "utf-8")
);

// ✅ sprawdzamy czy drużyna jest "prawdziwa"
function isRealTeam(name) {
  if (!name) return false;

  return !(
    /^W\d+$/.test(name) ||       // np. W73
    /^\d[A-Z]/.test(name) ||     // np. 2D, 1B
    name.includes("/")           // np. 3E/3F
  );
}

// ✅ Normalizacja
function normalize(match) {
  return {
    id: match.id,
    home: match.home,
    away: match.away,
    date: match.date,

    sport: {
      name: match.sport?.name || "Football"
    },

    league: {
      name:
        typeof match.league === "string"
          ? match.league
          : match.league?.name || "Unknown"
    },

    status: match.status || "pending"
  };
}

// ✅ Mapowanie wszystkich
const all = [
  ...file1.map(normalize),
  ...file2.map(normalize)
];

// ✅ ✅ FILTR — usuń placeholdery
const filtered = all.filter(match =>
  isRealTeam(match.home) &&
  isRealTeam(match.away)
);

// ✅ ✅ DEDUPLIKACJA
const unique = Object.values(
  filtered.reduce((acc, match) => {
    acc[match.id] = match;
    return acc;
  }, {})
);

// ✅ Zapis
fs.writeFileSync(
  "../data/merged.json",
  JSON.stringify(unique, null, 2)
);


console.log("✅ Zapisano realne mecze:", unique.length);