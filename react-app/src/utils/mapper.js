const SPORT_NAMES_MAP = {
  "pilka_nozna": "Piłka nożna",
  "piłka_nożna": "Piłka nożna",
  "pilka reczna": "Piłka ręczna",
  "pilka_reczna": "Piłka ręczna",
  "piłka ręczna": "Piłka ręczna",
  "koszykowka": "Koszykówka",
  "koszykówka": "Koszykówka",
  "tenis": "Tenis",
  "boks": "Boks"
};

export function mapRawMatch(raw, idIndex) {
  // Bezpieczne pobranie nazwy sportu
  const rawSport = (raw.dyscyplina || "").toLowerCase().trim();

  // Dynamiczne mapowanie kursów - nie musisz dopisywać każdego bukmachera ręcznie
  const formattedKursy = {};
  if (raw.kursy && typeof raw.kursy === 'object') {
    Object.keys(raw.kursy).forEach(bookieName => {
      const bData = raw.kursy[bookieName];
      formattedKursy[bookieName] = {
        home: bData["1"] || bData.home || null,
        draw: bData["X"] || bData.draw || null,
        away: bData["2"] || bData.away || null,
      };
    });
  }

  return {
    id: `match_${idIndex}`,
    sport: SPORT_NAMES_MAP[rawSport] || raw.dyscyplina || "Inne",
    date: raw.dzien || raw.data || "-",
    time: raw.godzina || "00:00",
    match: raw.mecz || "Nieznany mecz",
    
    // Utrzymujemy stare pola dla kompatybilności z Twoim komponentem
    betclic: formattedKursy["Betclic"] || null,
    superbet: formattedKursy["Superbet"] || null,
    fortuna: formattedKursy["Fortuna"] || null,
    
    // Przekazujemy wszystkie przetworzone kursy
    kursy: formattedKursy 
  };
}