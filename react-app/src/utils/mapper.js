// ✅ MAPA NAZW SPORTÓW (NAPRAWA NAZW)
const SPORT_NAMES_MAP = {
  "pilka_nozna": "Piłka nożna",
  "piłka_nożna": "Piłka nożna",
  "pilka reczna": "Piłka ręczna",
  "pilka_reczna": "Piłka ręczna",
  "piłka ręczna": "Piłka ręczna",
  "koszykowka": "Koszykówka",
  "koszykóWka": "Koszykówka",
  "tenis": "Tenis",
  "boks": "Boks"
};

export function mapRawMatch(raw, idIndex) {
  // ✅ NORMALIZACJA nazwy sportu (klucz)
  const rawSport = raw.dyscyplina?.toLowerCase().trim();

  return {
    id: `match_${idIndex}`,

    // ✅ TU NAPRAWIAMY PROBLEM
    sport: SPORT_NAMES_MAP[rawSport] || raw.dyscyplina,

    // DATA
    date: raw.dzien || raw.data || "-", 
    time: raw.godzina || "00:00",

    match: raw.mecz,

    // BETCLIC
    betclic: raw.kursy?.Betclic ? {
      home: raw.kursy.Betclic["1"] || null,
      draw: raw.kursy.Betclic["X"] || null,
      away: raw.kursy.Betclic["2"] || null,
    } : null,

    // SUPERBET
    superbet: raw.kursy?.Superbet ? {
      home: raw.kursy.Superbet["1"] || null,
      draw: raw.kursy.Superbet["X"] || null,
      away: raw.kursy.Superbet["2"] || null,
    } : null,

    // FORTUNA
    fortuna: raw.kursy?.Fortuna ? {
      home: raw.kursy.Fortuna["1"] || null,
      draw: raw.kursy.Fortuna["X"] || null,
      away: raw.kursy.Fortuna["2"] || null,
    } : null,

    // DLA TABELI
    kursy: raw.kursy || {}
  };
}