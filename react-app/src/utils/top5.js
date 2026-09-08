const MIN_DIFFERENCE_PERCENT = 0.15;
const MATCH_DURATION_MINS = 120;

const POLISH_BOOKMAKERS = new Set([
  "betclic",
  "betclic.pl",
  "superbet",
  "superbet.pl",
  "fortuna",
  "fortuna.pl",
  "efortuna",
  "efortuna.pl",
  "sts",
  "sts.pl",
  "lvbet",
  "lvbet.pl",
  "lv bet",
  "lv bet.pl",
  "betfan",
  "betfan.pl",
  "forbet",
  "fuksiarz",
  "fuksiarz.pl",
  "totalbet",
  "etoto",
  "etoto.pl",
  "goplusbet",
  "betters"
]);

const MARKET_LABELS = {
  "1x2": "1X2 / Home-Away",
  btts: "BTTS",
  podwojna_szansa: "Podwójna szansa",
  over_under: "Over / Under",
  handicap: "Handicap"
};

const OUTCOME_LABELS = {
  "1": "Gospodarz / zawodnik 1",
  X: "Remis (X)",
  "2": "Gość / zawodnik 2",
  tak: "Tak",
  nie: "Nie",
  "1X": "1X",
  "12": "12",
  X2: "X2",
  over: "Over",
  under: "Under"
};

const normalizeBookmakerName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const parseOdd = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "-"
  ) {
    return null;
  }

  const parsed = Number.parseFloat(
    String(value).replace(",", ".")
  );

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
};

const getBookmakerType = (bookmaker) => {
  const explicitType = String(
    bookmaker?.typ || ""
  )
    .toLowerCase()
    .trim();

  if (
    explicitType === "polski" ||
    explicitType === "zagraniczny"
  ) {
    return explicitType;
  }

  const normalizedName = normalizeBookmakerName(
    bookmaker?.nazwa
  );

  return POLISH_BOOKMAKERS.has(normalizedName)
    ? "polski"
    : "zagraniczny";
};

const normalizeMatchDate = (match) => {
  let value = String(
    match?.dzien ||
      match?.date ||
      ""
  ).trim();

  if (value.includes(" ")) {
    value = value.split(" ")[0];
  }

  if (value.includes("T")) {
    value = value.split("T")[0];
  }

  if (value.includes(".")) {
    const parts = value.split(".");

    if (parts.length === 3) {
      const [day, month, year] = parts;

      value = `${year}-${month}-${day}`;
    }
  }

  return value;
};

const getMatchTime = (match) => {
  let value = String(
    match?.godzina ||
      match?.time ||
      ""
  ).trim();

  if (
    !value &&
    String(match?.date || "").includes(" ")
  ) {
    value = String(match.date).split(" ")[1];
  }

  const matchResult = value.match(
    /\b([01]\d|2[0-3]):[0-5]\d\b/
  );

  return matchResult
    ? matchResult[0]
    : "";
};

const getMatchStatus = (match) => {
  const now = new Date();

  const todayString =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}`;

  const status = String(
    match?.status || ""
  )
    .toUpperCase()
    .trim();

  let isFinished =
    status === "ZAKOŃCZONO" ||
    status === "ZAKONCZONO" ||
    status === "FINISHED";

  let isLive =
    Boolean(match?.isLive) ||
    status === "LIVE";

  const matchDate = normalizeMatchDate(match);
  const matchTime = getMatchTime(match);

  if (
    matchDate &&
    matchDate < todayString
  ) {
    isFinished = true;
  }

  const isToday =
    Boolean(match?.is_today) ||
    matchDate === todayString;

  if (
    isToday &&
    matchTime &&
    !isFinished
  ) {
    const [hour, minute] = matchTime
      .split(":")
      .map(Number);

    if (
      Number.isFinite(hour) &&
      Number.isFinite(minute)
    ) {
      const matchDateTime = new Date(now);

      matchDateTime.setHours(
        hour,
        minute,
        0,
        0
      );

      const differenceMinutes =
        (
          now.getTime() -
          matchDateTime.getTime()
        ) /
        (1000 * 60);

      if (
        differenceMinutes >
        MATCH_DURATION_MINS
      ) {
        isFinished = true;
        isLive = false;
      } else if (
        differenceMinutes >= 0
      ) {
        isLive = true;
      }
    }
  }

  return {
    isFinished,
    isLive,
    matchDate,
    matchTime
  };
};

const getBookmakers = (match) => {
  if (Array.isArray(match?.bukmacherzy)) {
    return match.bukmacherzy;
  }

  /*
   * Awaryjna obsługa starszego formatu.
   */
  return Object.entries(
    match?.kursy || {}
  ).map(([name, data]) => ({
    nazwa: name,
    typ: POLISH_BOOKMAKERS.has(
      normalizeBookmakerName(name)
    )
      ? "polski"
      : "zagraniczny",

    kursy: {
      "1x2": {
        "1":
          data?.["1"] ??
          data?.home ??
          null,

        X:
          data?.X ??
          data?.draw ??
          null,

        "2":
          data?.["2"] ??
          data?.away ??
          null
      },

      btts: data?.btts || {},

      podwojna_szansa:
        data?.podwojna_szansa || {},

      over_under:
        data?.over_under || {},

      handicap:
        data?.handicap || {}
    }
  }));
};

const collectOdds = (match) => {
  const oddsMap = {};

  const addOdd = (
    market,
    line,
    outcome,
    bookmakerName,
    bookmakerType,
    rawOdd
  ) => {
    const odd = parseOdd(rawOdd);

    if (odd === null) {
      return;
    }

    const marketKey = line
      ? `${market}::${line}`
      : market;

    if (!oddsMap[marketKey]) {
      oddsMap[marketKey] = {
        market,
        line: line || "",
        outcomes: {}
      };
    }

    if (!oddsMap[marketKey].outcomes[outcome]) {
      oddsMap[marketKey].outcomes[outcome] = [];
    }

    oddsMap[marketKey].outcomes[outcome].push({
      bookmaker: bookmakerName,
      type: bookmakerType,
      odd
    });
  };

  getBookmakers(match).forEach(
    (bookmaker) => {
      const bookmakerName = String(
        bookmaker?.nazwa || "Nieznany"
      ).trim();

      const bookmakerType =
        getBookmakerType(bookmaker);

      const markets =
        bookmaker?.kursy || {};

      Object.entries(markets).forEach(
        ([market, marketData]) => {
          if (
            !marketData ||
            typeof marketData !== "object"
          ) {
            return;
          }

          if (
            market === "over_under" ||
            market === "handicap"
          ) {
            Object.entries(marketData).forEach(
              ([line, lineData]) => {
                if (
                  !lineData ||
                  typeof lineData !== "object"
                ) {
                  return;
                }

                Object.entries(lineData).forEach(
                  ([outcome, odd]) => {
                    addOdd(
                      market,
                      line,
                      outcome,
                      bookmakerName,
                      bookmakerType,
                      odd
                    );
                  }
                );
              }
            );

            return;
          }

          Object.entries(marketData).forEach(
            ([outcome, odd]) => {
              addOdd(
                market,
                "",
                outcome,
                bookmakerName,
                bookmakerType,
                odd
              );
            }
          );
        }
      );
    }
  );

  return oddsMap;
};

const buildOpportunity = ({
  match,
  statusData,
  market,
  line,
  outcome,
  comparisonType,
  lowEntry,
  highEntry
}) => {
  const matchName =
    match?.mecz ||
    match?.match ||
    match?.name ||
    (
      match?.home && match?.away
        ? `${match.home} - ${match.away}`
        : "Nieznany mecz"
    );

  const sport =
    match?.dyscyplina ||
    match?.sport ||
    "Sport";

  const difference =
    highEntry.odd - lowEntry.odd;

  const yieldPercent =
    lowEntry.odd > 0
      ? (
          (
            highEntry.odd /
            lowEntry.odd -
            1
          ) * 100
        )
      : 0;

  const marketLabel =
    MARKET_LABELS[market] || market;

  const outcomeLabel =
    OUTCOME_LABELS[outcome] ||
    outcome;

  const typeLabel = line
    ? `${marketLabel} ${line} | ${outcomeLabel}`
    : `${marketLabel} | ${outcomeLabel}`;

  const dateTime = [
    statusData.matchDate,
    statusData.matchTime
  ]
    .filter(Boolean)
    .join(" ");

  const id = [
    match?.id || matchName,
    market,
    line || "bez_linii",
    outcome,
    comparisonType,
    lowEntry.bookmaker,
    highEntry.bookmaker
  ].join("::");

  return {
    id,
    key: id,
    mecz: matchName,
    dyscyplina: sport,
    data: dateTime || "Brak daty",
    isLive: statusData.isLive,

    okazja: {
      rynek: marketLabel,
      rynekID: market,
      linia: line || "",
      wybor: outcomeLabel,
      wyborID: outcome,
      typZwyciestwa: typeLabel,
      rodzaj: comparisonType,

      bukMin: lowEntry.bookmaker,
      minTyp: lowEntry.type,
      minKurs: lowEntry.odd.toFixed(2),

      bukMax: highEntry.bookmaker,
      maxTyp: highEntry.type,
      maxKurs: highEntry.odd.toFixed(2),

      roznica: difference.toFixed(2),
      yield: yieldPercent.toFixed(1)
    },

    rawMatch: match
  };
};

export const calculateTop5 = (matches) => {
  if (!Array.isArray(matches)) {
    return [];
  }

  const opportunities = [];
  const seenOpportunities = new Set();

  matches.forEach((match) => {
    const statusData = getMatchStatus(match);

    if (statusData.isFinished) {
      return;
    }

    const oddsMap = collectOdds(match);

    Object.values(oddsMap).forEach(
      ({
        market,
        line,
        outcomes
      }) => {
        Object.entries(outcomes).forEach(
          ([outcome, odds]) => {
            const polishOdds = odds.filter(
              (entry) =>
                entry.type === "polski"
            );

            const foreignOdds = odds.filter(
              (entry) =>
                entry.type === "zagraniczny"
            );

            /*
             * 1. Polski kontra zagraniczny.
             *
             * Zgodnie z botem:
             * najwyższy polski kurs
             * kontra najniższy zagraniczny.
             */
            if (
              polishOdds.length > 0 &&
              foreignOdds.length > 0
            ) {
              const bestPolish = polishOdds.reduce(
                (best, current) =>
                  current.odd > best.odd
                    ? current
                    : best
              );

              const lowestForeign =
                foreignOdds.reduce(
                  (lowest, current) =>
                    current.odd < lowest.odd
                      ? current
                      : lowest
                );

              const difference =
                bestPolish.odd -
                lowestForeign.odd;

            const differencePercent =
                lowestForeign.odd > 0
                    ? difference /
                      lowestForeign.odd
                    : 0;

            if (
                bestPolish.odd >
                    lowestForeign.odd &&
                differencePercent >=
                    MIN_DIFFERENCE_PERCENT
            ) {
                const opportunity =
                  buildOpportunity({
                    match,
                    statusData,
                    market,
                    line,
                    outcome,
                    comparisonType:
                      "Polski vs zagraniczny",
                    lowEntry:
                      lowestForeign,
                    highEntry:
                      bestPolish
                  });

                if (
                  !seenOpportunities.has(
                    opportunity.id
                  )
                ) {
                  seenOpportunities.add(
                    opportunity.id
                  );

                  opportunities.push(
                    opportunity
                  );
                }
              }
            }

            /*
             * 2. Polski kontra polski.
             */
            if (polishOdds.length >= 2) {
              const lowestPolish =
                polishOdds.reduce(
                  (lowest, current) =>
                    current.odd < lowest.odd
                      ? current
                      : lowest
                );

              const highestPolish =
                polishOdds.reduce(
                  (highest, current) =>
                    current.odd > highest.odd
                      ? current
                      : highest
                );

              const difference =
                  highestPolish.odd -
                  lowestPolish.odd;

              const differencePercent =
                  lowestPolish.odd > 0
                      ? difference /
                        lowestPolish.odd
                      : 0;

              if (
                  highestPolish.bookmaker !==
                      lowestPolish.bookmaker &&
                  highestPolish.odd >
                      lowestPolish.odd &&
                  differencePercent >=
                      MIN_DIFFERENCE_PERCENT
              ) {
                const opportunity =
                  buildOpportunity({
                    match,
                    statusData,
                    market,
                    line,
                    outcome,
                    comparisonType:
                      "Polski vs polski",
                    lowEntry:
                      lowestPolish,
                    highEntry:
                      highestPolish
                  });

                if (
                  !seenOpportunities.has(
                    opportunity.id
                  )
                ) {
                  seenOpportunities.add(
                    opportunity.id
                  );

                  opportunities.push(
                    opportunity
                  );
                }
              }
            }
          }
        );
      }
    );

  });

  return opportunities.sort(
      (first, second) =>
          Number.parseFloat(
              second.okazja.yield
          ) -
          Number.parseFloat(
              first.okazja.yield
          )
  );
};