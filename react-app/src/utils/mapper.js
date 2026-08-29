// Normalizacja nazw sportów.
const SPORT_NAMES_MAP = {
  "pilka nozna": "Piłka nożna",
  "pilka_nozna": "Piłka nożna",
  "piłka nożna": "Piłka nożna",
  "piłka_nożna": "Piłka nożna",
  "⚽ pilka nozna": "Piłka nożna",
  "⚽ piłka nożna": "Piłka nożna",

  "pilka reczna": "Piłka ręczna",
  "pilka_reczna": "Piłka ręczna",
  "piłka ręczna": "Piłka ręczna",
  "piłka_ręczna": "Piłka ręczna",
  "🏐 pilka reczna": "Piłka ręczna",
  "🏐 piłka ręczna": "Piłka ręczna",

  "koszykowka": "Koszykówka",
  "koszykówka": "Koszykówka",
  "🏀 koszykowka": "Koszykówka",
  "🏀 koszykówka": "Koszykówka",

  "tenis": "Tenis",
  "🎾 tenis": "Tenis",

  "boks": "Boks",
  "🥊 boks": "Boks"
};

const normalizeSport = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  return SPORT_NAMES_MAP[normalized] || value || "Inne";
};

const normalizeMarkets = (markets = {}) => {
  const mainMarket =
    markets["1x2"] ||
    markets["12"] ||
    {};

  return {
    "1x2": {
      ...mainMarket
    },

    btts: {
      ...(markets.btts || {})
    },

    podwojna_szansa: {
      ...(markets.podwojna_szansa || {})
    },

    over_under: {
      ...(markets.over_under || {})
    },

    handicap: {
      ...(markets.handicap || {})
    }
  };
};

const normalizeBookmaker = (
  bookmaker,
  matchId,
  bookmakerIndex
) => {
  const markets = normalizeMarkets(
    bookmaker?.kursy || {}
  );

  return {
    id: `${matchId}_bookmaker_${bookmakerIndex}`,

    nazwa:
      bookmaker?.nazwa ||
      bookmaker?.bukmacher ||
      "Nieznany",

    typ:
      bookmaker?.typ ||
      "zagraniczny",

    zrodlo:
      bookmaker?.zrodlo ||
      "",

    kursy: markets
  };
};

/*
 * Tworzy stary format match.kursy, wykorzystywany jeszcze
 * przez MatchesList, kalkulator i niektóre inne komponenty.
 */
const buildLegacyOdds = (bookmakers) => {
  const legacyOdds = {};

  bookmakers.forEach((bookmaker) => {
    const mainMarket =
      bookmaker.kursy?.["1x2"] || {};

    legacyOdds[bookmaker.nazwa] = {
      "1": mainMarket["1"] ?? null,
      "X": mainMarket["X"] ?? null,
      "2": mainMarket["2"] ?? null,

      home: mainMarket["1"] ?? null,
      draw: mainMarket["X"] ?? null,
      away: mainMarket["2"] ?? null,

      typ: bookmaker.typ,
      zrodlo: bookmaker.zrodlo,

      /*
       * Pełne dane wszystkich rynków.
       */
      rynki: bookmaker.kursy,

      "1x2": bookmaker.kursy["1x2"],
      btts: bookmaker.kursy.btts,
      podwojna_szansa:
        bookmaker.kursy.podwojna_szansa,
      over_under:
        bookmaker.kursy.over_under,
      handicap:
        bookmaker.kursy.handicap
    };
  });

  return legacyOdds;
};

export function mapRawMatch(raw, idIndex = 0) {
  const matchId =
    raw.id ||
    `match_${idIndex}`;

  /*
   * Nowy format backendu:
   *
   * raw.bukmacherzy = [
   *   {
   *     nazwa: "BETCLIC",
   *     typ: "polski",
   *     kursy: {
   *       "1x2": {},
   *       btts: {},
   *       ...
   *     }
   *   }
   * ]
   */
  let bookmakers = Array.isArray(raw.bukmacherzy)
    ? raw.bukmacherzy.map(
        (bookmaker, bookmakerIndex) =>
          normalizeBookmaker(
            bookmaker,
            matchId,
            bookmakerIndex
          )
      )
    : [];

  /*
   * Fallback dla starego formatu:
   *
   * raw.kursy = {
   *   BETCLIC: {
   *     "1": 2.10,
   *     "X": 3.20,
   *     "2": 3.40
   *   }
   * }
   */
  if (
    bookmakers.length === 0 &&
    raw.kursy &&
    typeof raw.kursy === "object"
  ) {
    bookmakers = Object.entries(
      raw.kursy
    ).map(
      (
        [bookmakerName, bookmakerData],
        bookmakerIndex
      ) => {
        const mainMarket =
          bookmakerData?.["1x2"] || {
            "1":
              bookmakerData?.["1"] ??
              bookmakerData?.home ??
              null,

            "X":
              bookmakerData?.["X"] ??
              bookmakerData?.draw ??
              null,

            "2":
              bookmakerData?.["2"] ??
              bookmakerData?.away ??
              null
          };

        return normalizeBookmaker(
          {
            nazwa: bookmakerName,

            typ:
              bookmakerData?.typ ||
              "zagraniczny",

            zrodlo:
              bookmakerData?.zrodlo ||
              "",

            kursy: {
              "1x2": mainMarket,

              btts:
                bookmakerData?.btts ||
                {},

              podwojna_szansa:
                bookmakerData?.podwojna_szansa ||
                {},

              over_under:
                bookmakerData?.over_under ||
                {},

              handicap:
                bookmakerData?.handicap ||
                {}
            }
          },
          matchId,
          bookmakerIndex
        );
      }
    );
  }

  const legacyOdds = buildLegacyOdds(
    bookmakers
  );

  /*
   * Nadal udostępniamy pola betclic, superbet i fortuna,
   * ponieważ App.jsx używa ich w filtrze "Wspólne kursy".
   */
  const findBookmakerOdds = (...names) => {
    const normalizedNames = names.map(
      (name) => name.toLowerCase()
    );

    const bookmaker = bookmakers.find(
      (item) =>
        normalizedNames.includes(
          String(item.nazwa)
            .toLowerCase()
            .trim()
        )
    );

    if (!bookmaker) {
      return null;
    }

    const mainMarket =
      bookmaker.kursy?.["1x2"] || {};

    return {
      home: mainMarket["1"] ?? null,
      draw: mainMarket["X"] ?? null,
      away: mainMarket["2"] ?? null
    };
  };

  const matchName =
    raw.mecz ||
    raw.match ||
    `${raw.home || ""} - ${raw.away || ""}`.trim();

  const sportName = normalizeSport(
    raw.dyscyplina ||
    raw.sport
  );

  const date =
    raw.dzien ||
    raw.data ||
    raw.date ||
    "";

  const time =
    raw.godzina ||
    raw.time ||
    "00:00";

  return {
    ...raw,

    id: matchId,

    sport: sportName,
    dyscyplina: sportName,

    date,
    dzien: date,

    time,
    godzina: time,

    match: matchName,
    mecz: matchName,

    home: raw.home || "",
    away: raw.away || "",

    country:
      raw.kraj ||
      raw.country ||
      "",

    league:
      raw.liga ||
      raw.league ||
      "",

    /*
     * Nowa docelowa struktura.
     */
    bukmacherzy: bookmakers,

    /*
     * Warstwa zgodności ze starym frontendem.
     */
    kursy: legacyOdds,

    betclic: findBookmakerOdds(
      "betclic",
      "betclic.pl"
    ),

    superbet: findBookmakerOdds(
      "superbet",
      "superbet.pl"
    ),

    fortuna: findBookmakerOdds(
      "fortuna",
      "fortuna.pl",
      "efortuna",
      "efortuna.pl"
    ),

    liczba_bukmacherow:
      raw.liczba_bukmacherow ??
      bookmakers.length
  };
}

export default mapRawMatch;