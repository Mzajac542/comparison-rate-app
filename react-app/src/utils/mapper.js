export function mapRawMatch(m, index) {

  const kursy = m.kursy || {};

  const betclic = kursy.Betclic || {};
  const superbet = kursy.Superbet || {};

  const bestOdds = {
    home: Math.max(betclic["1"] || 0, superbet["1"] || 0),
    draw: Math.max(betclic["X"] || 0, superbet["X"] || 0),
    away: Math.max(betclic["2"] || 0, superbet["2"] || 0),
  };

  // ✅ SPORT
  const sport = m.dyscyplina || null;

  // ✅ LEAGUE — NIE "Inne"
  const league = extractLeague(m.mecz);

  return {
    id: index.toString(),

    match: m.mecz,
    date: formatDate(m.data),

    sport,
    league,
    country: guessCountry(m.mecz),

    betclic: {
      home: betclic["1"],
      draw: betclic["X"],
      away: betclic["2"],
    },

    superbet: {
      home: superbet["1"],
      draw: superbet["X"],
      away: superbet["2"],
    },

    bestOdds
  };
}

// ✅ usuwa "(K)" itd i bierze pierwszą drużynę
function extractLeague(name) {
  if (!name) return "Inne";

  const clean = name.replace(/\(.*?\)/g, "").trim();

  const parts = clean.split(" - ");
  if (parts.length !== 2) return "Inne";

  const team = parts[0].trim();

  // ✅ weź pierwsze słowo jako pseudo-liga
  const words = team.split(" ");

  return words[0];
}

// ✅ data fix
function formatDate(date) {
  if (!date) return "-";

  if (date === "Jutro") return "Jutro";
  if (date === "Pojutrze") return "Pojutrze";

  return date;
}
function guessCountry(name) {
  if (!name) return "Nieznany";

  const n = name.toLowerCase();

  // ✅ TOP KLUBY
  if (n.includes("seoul") || n.includes("hyundai")) return "Korea Południowa";
  if (n.includes("barcelona") || n.includes("real")) return "Hiszpania";
  if (n.includes("psg") || n.includes("paris")) return "Francja";
  if (n.includes("bayern") || n.includes("dortmund")) return "Niemcy";
  if (n.includes("milan") || n.includes("juventus")) return "Włochy";
  if (n.includes("chelsea") || n.includes("manchester")) return "Anglia";

  // ✅ ŚWIAT (ważne!)
  if (n.includes("fc")) return "Międzynarodowe";
  if (n.includes("united")) return "Międzynarodowe";

  // ✅ AFRYKA / AZJA (częste w Twoich danych)
  if (n.includes("al ")) return "Bliski Wschód";
  if (n.includes("shahr")) return "Iran";
  if (n.includes("tehran")) return "Iran";
  if (n.includes("astana")) return "Kazachstan";

  // ✅ fallback → NIE zostawiamy "-"
  return "Nieznany";
}