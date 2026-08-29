import React, {
  useEffect,
  useMemo,
  useState
} from "react";

const MARKET_LABELS = {
  "1x2": "1X2",
  home_away: "Home / Away",
  btts: "BTTS",
  podwojna_szansa: "Podwójna szansa",
  over_under: "Over / Under",
  handicap: "Handicap"
};

const SPORT_MARKETS = {
  "piłka nożna": [
    "1x2",
    "btts",
    "podwojna_szansa",
    "over_under"
  ],

  "koszykówka": [
    "home_away",
    "over_under",
    "handicap"
  ],

  "tenis": [
    "home_away",
    "over_under",
    "handicap"
  ],

  "piłka ręczna": [
    "home_away"
  ],

  "boks": [
    "home_away"
  ]
};

const normalizeSport = (sport) =>
  String(sport || "")
    .toLowerCase()
    .replace(/[⚽🏀🎾🏐🥊]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const formatOdd = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "-"
  ) {
    return "-";
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "-";
  }

  return parsed.toFixed(2);
};

const getBookmakers = (match) => {
  if (Array.isArray(match?.bukmacherzy)) {
    return match.bukmacherzy;
  }

  /*
   * Fallback dla starego formatu danych.
   */
  return Object.entries(
    match?.kursy || {}
  ).map(([name, bookmaker]) => ({
    nazwa: name,
    typ: bookmaker?.typ || "zagraniczny",

    kursy: {
      "1x2": bookmaker?.["1x2"] || {
        "1":
          bookmaker?.["1"] ??
          bookmaker?.home ??
          null,

        "X":
          bookmaker?.["X"] ??
          bookmaker?.draw ??
          null,

        "2":
          bookmaker?.["2"] ??
          bookmaker?.away ??
          null
      },

      btts:
        bookmaker?.btts || {},

      podwojna_szansa:
        bookmaker?.podwojna_szansa || {},

      over_under:
        bookmaker?.over_under || {},

      handicap:
        bookmaker?.handicap || {}
    }
  }));
};

const hasObjectValues = (value) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).length > 0;

const getMarketData = (
  bookmaker,
  market
) => {
  const markets =
    bookmaker?.kursy || {};

  if (market === "home_away") {
    return markets["1x2"] || {};
  }

  return markets[market] || {};
};

const bookmakerHasMarket = (
  bookmaker,
  market
) => {
  const marketData = getMarketData(
    bookmaker,
    market
  );

  if (
    market === "1x2" ||
    market === "home_away"
  ) {
    return ["1", "X", "2"].some(
      (key) =>
        marketData[key] !== null &&
        marketData[key] !== undefined &&
        marketData[key] !== ""
    );
  }

  return hasObjectValues(
    marketData
  );
};

const sortLines = (
  first,
  second
) => {
  const firstNumber =
    Number.parseFloat(first);

  const secondNumber =
    Number.parseFloat(second);

  if (
    Number.isFinite(firstNumber) &&
    Number.isFinite(secondNumber)
  ) {
    return firstNumber - secondNumber;
  }

  return String(first).localeCompare(
    String(second),
    "pl"
  );
};

const getColumns = (
  market,
  bookmakers
) => {
  if (market === "1x2") {
    const hasDraw = bookmakers.some(
      (bookmaker) => {
        const values =
          bookmaker?.kursy?.["1x2"] || {};

        return (
          values["X"] !== undefined &&
          values["X"] !== null
        );
      }
    );

    return hasDraw
      ? [
          {
            key: "1",
            label: "Gospodarz (1)"
          },
          {
            key: "X",
            label: "Remis (X)"
          },
          {
            key: "2",
            label: "Gość (2)"
          }
        ]
      : [
          {
            key: "1",
            label: "Gospodarz (1)"
          },
          {
            key: "2",
            label: "Gość (2)"
          }
        ];
  }

  if (market === "home_away") {
    return [
      {
        key: "1",
        label: "Zawodnik / drużyna 1"
      },
      {
        key: "2",
        label: "Zawodnik / drużyna 2"
      }
    ];
  }

  if (market === "btts") {
    return [
      {
        key: "tak",
        label: "Tak"
      },
      {
        key: "nie",
        label: "Nie"
      }
    ];
  }

  if (market === "podwojna_szansa") {
    return [
      {
        key: "1X",
        label: "1X"
      },
      {
        key: "12",
        label: "12"
      },
      {
        key: "X2",
        label: "X2"
      }
    ];
  }

  if (market === "over_under") {
    return [
      {
        key: "over",
        label: "Over"
      },
      {
        key: "under",
        label: "Under"
      }
    ];
  }

  if (market === "handicap") {
    return [
      {
        key: "1",
        label: "1"
      },
      {
        key: "2",
        label: "2"
      }
    ];
  }

  return [];
};

const getValueObject = (
  bookmaker,
  market,
  selectedLine
) => {
  const marketData = getMarketData(
    bookmaker,
    market
  );

  if (
    market === "over_under" ||
    market === "handicap"
  ) {
    return (
      marketData?.[selectedLine] ||
      {}
    );
  }

  return marketData;
};

const getBookmakerBadgeStyle = (
  type
) => {
  if (type === "polski") {
    return {
      backgroundColor:
        "rgba(16, 185, 129, 0.14)",

      border:
        "1px solid rgba(16, 185, 129, 0.4)",

      color: "#34d399"
    };
  }

  return {
    backgroundColor:
      "rgba(59, 130, 246, 0.14)",

    border:
      "1px solid rgba(59, 130, 246, 0.4)",

    color: "#60a5fa"
  };
};

function OddsPanel({ match }) {
  const bookmakers = useMemo(
    () => getBookmakers(match),
    [match]
  );

  const sport = normalizeSport(
    match?.sport ||
    match?.dyscyplina
  );

  /*
   * Rynki dozwolone dla danego sportu.
   */
  const sportMarkets =
    SPORT_MARKETS[sport] || [
      "1x2"
    ];

  /*
   * Pokazujemy tylko rynki, dla których
   * przynajmniej jeden bukmacher ma dane.
   */
  const availableMarkets = useMemo(
    () =>
      sportMarkets.filter(
        (market) =>
          bookmakers.some(
            (bookmaker) =>
              bookmakerHasMarket(
                bookmaker,
                market
              )
          )
      ),
    [bookmakers, sport]
  );

  const [selectedMarket, setSelectedMarket] =
    useState("");

  const [selectedLine, setSelectedLine] =
    useState("");

  /*
   * Po wejściu w inny mecz wybieramy
   * pierwszy dostępny rynek.
   */
  useEffect(() => {
    if (availableMarkets.length === 0) {
      setSelectedMarket("");
      return;
    }

    if (
      !availableMarkets.includes(
        selectedMarket
      )
    ) {
      setSelectedMarket(
        availableMarkets[0]
      );
    }
  }, [
    availableMarkets,
    selectedMarket,
    match?.id
  ]);

  /*
   * Linie dla Over/Under oraz handicapu.
   */
  const availableLines = useMemo(() => {
    if (
      selectedMarket !==
        "over_under" &&
      selectedMarket !==
        "handicap"
    ) {
      return [];
    }

    const lines = new Set();

    bookmakers.forEach(
      (bookmaker) => {
        const marketData =
          getMarketData(
            bookmaker,
            selectedMarket
          );

        Object.keys(
          marketData || {}
        ).forEach((line) => {
          lines.add(line);
        });
      }
    );

    return Array.from(
      lines
    ).sort(sortLines);
  }, [
    bookmakers,
    selectedMarket
  ]);

  /*
   * Automatyczny wybór pierwszej linii.
   * Dla piłki nożnej preferujemy +2.5.
   */
  useEffect(() => {
    if (availableLines.length === 0) {
      setSelectedLine("");
      return;
    }

    if (
      availableLines.includes(
        selectedLine
      )
    ) {
      return;
    }

    const preferredLine =
      availableLines.find(
        (line) =>
          line === "+2.5" ||
          line === "2.5"
      ) ||
      availableLines[0];

    setSelectedLine(
      preferredLine
    );
  }, [
    availableLines,
    selectedLine
  ]);

  if (!match) {
    return (
      <div style={emptyStyle}>
        Wybierz mecz.
      </div>
    );
  }

  if (bookmakers.length === 0) {
    return (
      <div style={panelStyle}>
        <h2 style={titleStyle}>
          Porównanie kursów
        </h2>

        <p style={warningStyle}>
          Brak dostępnych bukmacherów dla
          tego spotkania.
        </p>
      </div>
    );
  }

  if (availableMarkets.length === 0) {
    return (
      <div style={panelStyle}>
        <h2 style={titleStyle}>
          Porównanie kursów
        </h2>

        <p style={warningStyle}>
          Bukmacherzy nie mają zapisanych
          kursów dla obsługiwanych rynków.
        </p>
      </div>
    );
  }

  const columns = getColumns(
    selectedMarket,
    bookmakers
  );

  const visibleBookmakers =
    bookmakers.filter(
      (bookmaker) =>
        bookmakerHasMarket(
          bookmaker,
          selectedMarket
        )
    );

  /*
   * Obliczamy najlepszy kurs osobno
   * dla każdej kolumny.
   */
  const bestOdds = {};

  columns.forEach((column) => {
    let bestValue = 0;

    visibleBookmakers.forEach(
      (bookmaker) => {
        const values =
          getValueObject(
            bookmaker,
            selectedMarket,
            selectedLine
          );

        const value =
          Number.parseFloat(
            values?.[column.key]
          );

        if (
          Number.isFinite(value) &&
          value > bestValue
        ) {
          bestValue = value;
        }
      }
    );

    bestOdds[column.key] =
      bestValue;
  });

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={titleStyle}>
            Porównanie kursów
          </h2>

          <span style={subtitleStyle}>
            Dostępnych bukmacherów:{" "}
            {visibleBookmakers.length}
          </span>
        </div>

        <div style={controlsStyle}>
          <div>
            <label style={labelStyle}>
              Rodzaj rynku
            </label>

            <select
              value={selectedMarket}
              onChange={(event) => {
                setSelectedMarket(
                  event.target.value
                );

                setSelectedLine("");
              }}
              style={selectStyle}
            >
              {availableMarkets.map(
                (market) => (
                  <option
                    key={market}
                    value={market}
                  >
                    {MARKET_LABELS[market]}
                  </option>
                )
              )}
            </select>
          </div>

          {availableLines.length > 0 && (
            <div>
              <label style={labelStyle}>
                Linia
              </label>

              <select
                value={selectedLine}
                onChange={(event) =>
                  setSelectedLine(
                    event.target.value
                  )
                }
                style={selectStyle}
              >
                {availableLines.map(
                  (line) => (
                    <option
                      key={line}
                      value={line}
                    >
                      {line}
                    </option>
                  )
                )}
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={dividerStyle} />

      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th
                style={{
                  ...headerCellStyle,
                  textAlign: "left"
                }}
              >
                Bukmacher
              </th>

              <th style={headerCellStyle}>
                Typ
              </th>

              {availableLines.length > 0 && (
                <th style={headerCellStyle}>
                  Linia
                </th>
              )}

              {columns.map(
                (column) => (
                  <th
                    key={column.key}
                    style={headerCellStyle}
                  >
                    {column.label}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {visibleBookmakers.map(
              (bookmaker) => {
                const values =
                  getValueObject(
                    bookmaker,
                    selectedMarket,
                    selectedLine
                  );

                return (
                  <tr
                    key={
                      bookmaker.id ||
                      `${bookmaker.nazwa}_${selectedMarket}`
                    }
                    style={bodyRowStyle}
                  >
                    <td style={bookmakerCellStyle}>
                      {bookmaker.nazwa}
                    </td>

                    <td style={bodyCellStyle}>
                      <span
                        style={{
                          ...getBookmakerBadgeStyle(
                            bookmaker.typ
                          ),
                          padding: "4px 9px",
                          borderRadius: "999px",
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          display: "inline-block",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {bookmaker.typ ===
                        "polski"
                          ? "Polski"
                          : "Zagraniczny"}
                      </span>
                    </td>

                    {availableLines.length >
                      0 && (
                      <td style={lineCellStyle}>
                        {selectedLine || "-"}
                      </td>
                    )}

                    {columns.map(
                      (column) => {
                        const rawValue =
                          values?.[
                            column.key
                          ];

                        const parsedValue =
                          Number.parseFloat(
                            rawValue
                          );

                        const isBest =
                          Number.isFinite(
                            parsedValue
                          ) &&
                          parsedValue > 0 &&
                          parsedValue ===
                            bestOdds[
                              column.key
                            ];

                        return (
                          <td
                            key={column.key}
                            style={{
                              ...oddCellStyle,

                              color: isBest
                                ? "#22c55e"
                                : "#f8fafc",

                              backgroundColor:
                                isBest
                                  ? "rgba(34, 197, 94, 0.08)"
                                  : "transparent"
                            }}
                          >
                            {formatOdd(
                              rawValue
                            )}

                              {isBest && (
                              <span style={bestBadgeStyle}>
                                BEST
                              </span>
                            )}
                          </td>
                        );
                      }
                    )}
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>

      {visibleBookmakers.length === 0 && (
        <p style={warningStyle}>
          Brak kursów dla wybranego rynku.
        </p>
      )}
    </div>
  );
}

const panelStyle = {
  padding: "18px",
  color: "#fff"
};

const panelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  flexWrap: "wrap",
  gap: "16px"
};

const controlsStyle = {
  display: "flex",
  alignItems: "flex-end",
  flexWrap: "wrap",
  gap: "10px"
};

const titleStyle = {
  margin: 0,
  color: "#fff",
  fontSize: "1.2rem"
};

const subtitleStyle = {
  display: "block",
  marginTop: "6px",
  color: "#94a3b8",
  fontSize: "0.84rem"
};

const labelStyle = {
  display: "block",
  marginBottom: "5px",
  color: "#94a3b8",
  fontSize: "0.75rem"
};

const selectStyle = {
  minWidth: "190px",
  padding: "9px 12px",
  borderRadius: "6px",
  border: "1px solid #475569",
  color: "#fff",
  backgroundColor: "#252525",
  cursor: "pointer",
  outline: "none"
};

const dividerStyle = {
  width: "100%",
  height: "1px",
  margin: "16px 0",
  backgroundColor: "#3f3f46"
};

const tableWrapperStyle = {
  width: "100%",
  overflowX: "auto"
};

const tableStyle = {
  width: "100%",
  minWidth: "720px",
  borderCollapse: "collapse"
};

const headerCellStyle = {
  padding: "12px",
  border: "1px solid #444",
  backgroundColor: "#292929",
  color: "#cbd5e1",
  textAlign: "center",
  whiteSpace: "nowrap"
};

const bodyRowStyle = {
  borderBottom: "1px solid #374151"
};

const bodyCellStyle = {
  padding: "12px",
  border: "1px solid #374151",
  textAlign: "center"
};

const bookmakerCellStyle = {
  ...bodyCellStyle,
  color: "#fff",
  fontWeight: "700",
  textAlign: "left"
};

const lineCellStyle = {
  ...bodyCellStyle,
  color: "#f59e0b",
  fontWeight: "700"
};

const oddCellStyle = {
  ...bodyCellStyle,
  position: "relative",
  minWidth: "125px",
  fontWeight: "700"
};

const bestBadgeStyle = {
  display: "inline-block",
  marginLeft: "7px",
  padding: "2px 5px",
  borderRadius: "4px",
  color: "#22c55e",
  backgroundColor: "rgba(34, 197, 94, 0.14)",
  fontSize: "0.6rem",
  fontWeight: "800",
  verticalAlign: "middle"
};

const emptyStyle = {
  padding: "20px",
  color: "#94a3b8"
};

const warningStyle = {
  color: "#f59e0b",
  marginBottom: 0
};

export default OddsPanel;

                 