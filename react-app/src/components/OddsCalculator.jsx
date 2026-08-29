import { useEffect, useMemo, useState } from "react";

const MARKET_CONFIG = {
  "1x2": {
    label: "1X2",
    outcomes: [
      { value: "1", label: "Gospodarz (1)" },
      { value: "X", label: "Remis (X)" },
      { value: "2", label: "Gość (2)" }
    ],
    hasLines: false
  },

  home_away: {
    label: "Home / Away",
    outcomes: [
      { value: "1", label: "Drużyna / zawodnik 1" },
      { value: "2", label: "Drużyna / zawodnik 2" }
    ],
    hasLines: false
  },

  btts: {
    label: "BTTS",
    outcomes: [
      { value: "tak", label: "Tak" },
      { value: "nie", label: "Nie" }
    ],
    hasLines: false
  },

  podwojna_szansa: {
    label: "Podwójna szansa",
    outcomes: [
      { value: "1X", label: "1X" },
      { value: "12", label: "12" },
      { value: "X2", label: "X2" }
    ],
    hasLines: false
  },

  over_under: {
    label: "Over / Under",
    outcomes: [
      { value: "over", label: "Over" },
      { value: "under", label: "Under" }
    ],
    hasLines: true
  },

  handicap: {
    label: "Handicap",
    outcomes: [
      { value: "1", label: "Drużyna / zawodnik 1" },
      { value: "2", label: "Drużyna / zawodnik 2" }
    ],
    hasLines: true
  }
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

  tenis: [
    "home_away",
    "over_under",
    "handicap"
  ],

  "piłka ręczna": [
    "home_away"
  ],

  boks: [
    "home_away"
  ]
};

const normalizeSport = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[⚽🏀🎾🏐🤾🥊]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const sortLines = (first, second) => {
  const firstNumber = Number.parseFloat(first);
  const secondNumber = Number.parseFloat(second);

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

const getBookmakers = (match) => {
  if (Array.isArray(match?.bukmacherzy)) {
    return match.bukmacherzy;
  }

  return Object.entries(match?.kursy || {}).map(
    ([name, data]) => ({
      nazwa: name,
      typ: data?.typ || "zagraniczny",

      kursy: {
        "1x2": data?.["1x2"] || {
          "1": data?.["1"] ?? data?.home ?? null,
          "X": data?.["X"] ?? data?.draw ?? null,
          "2": data?.["2"] ?? data?.away ?? null
        },

        btts: data?.btts || {},

        podwojna_szansa:
          data?.podwojna_szansa || {},

        over_under:
          data?.over_under || {},

        handicap:
          data?.handicap || {}
      }
    })
  );
};

const getMarketData = (bookmaker, market) => {
  const markets = bookmaker?.kursy || {};

  if (market === "home_away") {
    return markets["1x2"] || {};
  }

  return markets[market] || {};
};

const getOdd = (
  bookmakers,
  bookmakerName,
  market,
  line,
  outcome
) => {
  if (
    !bookmakerName ||
    !market ||
    !outcome
  ) {
    return 0;
  }

  const bookmaker = bookmakers.find(
    (item) =>
      String(item.nazwa)
        .toLowerCase()
        .trim() ===
      String(bookmakerName)
        .toLowerCase()
        .trim()
  );

  if (!bookmaker) {
    return 0;
  }

  const marketData = getMarketData(
    bookmaker,
    market
  );

  const rawValue =
    market === "over_under" ||
    market === "handicap"
      ? marketData?.[line]?.[outcome]
      : marketData?.[outcome];

  const value = Number.parseFloat(rawValue);

  return Number.isFinite(value) && value > 0
    ? value
    : 0;
};

const POLISH_BETTING_TAX_RATE = 0.12;

const isPolishBookmaker = (
  bookmakers,
  bookmakerName
) => {
  const bookmaker = bookmakers.find(
    (item) =>
      String(item?.nazwa || "")
        .toLowerCase()
        .trim() ===
      String(bookmakerName || "")
        .toLowerCase()
        .trim()
  );

  return (
    String(bookmaker?.typ || "")
      .toLowerCase()
      .trim() === "polski"
  );
};

const normalizeDeductionPercent = (value) => {
  const normalizedValue = String(value ?? "")
    .replace(",", ".")
    .trim();

  const number = Number.parseFloat(
    normalizedValue
  );

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, number)
  );
};

function OddsCalculator({ match }) {
  const [showHelp, setShowHelp] = useState(false);
  const [inputs, setInputs] = useState({
    amount: 100,
    calculationMode: "without_tax",
    foreignDeductionA: "",
    foreignDeductionB: "",
    market: "",
    line: "",
    outcome: "",
    bookieA: "",
    bookieB: ""
  });

  const bookmakers = useMemo(
    () => getBookmakers(match),
    [match]
  );

  const sport = normalizeSport(
    match?.sport || match?.dyscyplina
  );

  const availableMarkets = useMemo(() => {
    const configuredMarkets =
      SPORT_MARKETS[sport] || ["1x2"];

    return configuredMarkets.filter((market) =>
      bookmakers.some((bookmaker) => {
        const data = getMarketData(
          bookmaker,
          market
        );

        return (
          data &&
          typeof data === "object" &&
          Object.keys(data).length > 0
        );
      })
    );
  }, [bookmakers, sport]);

  const availableLines = useMemo(() => {
    if (
      !MARKET_CONFIG[inputs.market]?.hasLines
    ) {
      return [];
    }

    const lines = new Set();

    bookmakers.forEach((bookmaker) => {
      const marketData = getMarketData(
        bookmaker,
        inputs.market
      );

      Object.keys(marketData || {}).forEach(
        (line) => lines.add(line)
      );
    });

    return Array.from(lines).sort(sortLines);
  }, [bookmakers, inputs.market]);

  const outcomes =
    MARKET_CONFIG[inputs.market]?.outcomes || [];

  const availableBookmakers = useMemo(() => {
    if (!inputs.market || !inputs.outcome) {
      return [];
    }

    return bookmakers.filter(
      (bookmaker) =>
        getOdd(
          bookmakers,
          bookmaker.nazwa,
          inputs.market,
          inputs.line,
          inputs.outcome
        ) > 0
    );
  }, [
    bookmakers,
    inputs.market,
    inputs.line,
    inputs.outcome
  ]);

  useEffect(() => {
    if (!match || availableMarkets.length === 0) {
      setInputs({
        amount: 100,
        calculationMode: "without_tax",
        foreignDeductionA: "",
        foreignDeductionB: "",
        market: "",
        line: "",
        outcome: "",
        bookieA: "",
        bookieB: ""
      });

      return;
    }

    const market = availableMarkets[0];

    const marketLines = new Set();

    if (MARKET_CONFIG[market]?.hasLines) {
      bookmakers.forEach((bookmaker) => {
        const data = getMarketData(
          bookmaker,
          market
        );

        Object.keys(data || {}).forEach(
          (line) => marketLines.add(line)
        );
      });
    }

    const lines = Array.from(
      marketLines
    ).sort(sortLines);

    const line =
      lines.find(
        (item) =>
          item === "+2.5" ||
          item === "2.5"
      ) ||
      lines[0] ||
      "";

    const outcome =
      MARKET_CONFIG[market]?.outcomes?.[0]
        ?.value || "";

    const validBookmakers = bookmakers.filter(
      (bookmaker) =>
        getOdd(
          bookmakers,
          bookmaker.nazwa,
          market,
          line,
          outcome
        ) > 0
    );

    setInputs({
      amount: 100,
      calculationMode: "without_tax",
      foreignDeductionA: "",
      foreignDeductionB: "",
      market,
      line,
      outcome,
      bookieA:
        validBookmakers[0]?.nazwa || "",
      bookieB:
        validBookmakers[1]?.nazwa ||
        validBookmakers[0]?.nazwa ||
        ""
    });
  }, [match, availableMarkets, bookmakers]);

  const changeMarket = (market) => {
    const lines = new Set();

    if (MARKET_CONFIG[market]?.hasLines) {
      bookmakers.forEach((bookmaker) => {
        const marketData = getMarketData(
          bookmaker,
          market
        );

        Object.keys(marketData || {}).forEach(
          (line) => lines.add(line)
        );
      });
    }

    const sortedLines =
      Array.from(lines).sort(sortLines);

    const line =
      sortedLines.find(
        (item) =>
          item === "+2.5" ||
          item === "2.5"
      ) ||
      sortedLines[0] ||
      "";

    const outcome =
      MARKET_CONFIG[market]?.outcomes?.[0]
        ?.value || "";

    const validBookmakers = bookmakers.filter(
      (bookmaker) =>
        getOdd(
          bookmakers,
          bookmaker.nazwa,
          market,
          line,
          outcome
        ) > 0
    );

    setInputs((previous) => ({
      ...previous,
      market,
      line,
      outcome,
      bookieA:
        validBookmakers[0]?.nazwa || "",
      bookieB:
        validBookmakers[1]?.nazwa ||
        validBookmakers[0]?.nazwa ||
        ""
    }));
  };

  const changeLine = (line) => {
    const validBookmakers = bookmakers.filter(
      (bookmaker) =>
        getOdd(
          bookmakers,
          bookmaker.nazwa,
          inputs.market,
          line,
          inputs.outcome
        ) > 0
    );

    setInputs((previous) => ({
      ...previous,
      line,
      bookieA:
        validBookmakers[0]?.nazwa || "",
      bookieB:
        validBookmakers[1]?.nazwa ||
        validBookmakers[0]?.nazwa ||
        ""
    }));
  };

  const changeOutcome = (outcome) => {
    const validBookmakers = bookmakers.filter(
      (bookmaker) =>
        getOdd(
          bookmakers,
          bookmaker.nazwa,
          inputs.market,
          inputs.line,
          outcome
        ) > 0
    );

    setInputs((previous) => ({
      ...previous,
      outcome,
      bookieA:
        validBookmakers[0]?.nazwa || "",
      bookieB:
        validBookmakers[1]?.nazwa ||
        validBookmakers[0]?.nazwa ||
        ""
    }));
  };

  const amount =
    Number.parseFloat(inputs.amount) || 0;

  const oddA = getOdd(
    bookmakers,
    inputs.bookieA,
    inputs.market,
    inputs.line,
    inputs.outcome
  );

  const oddB = getOdd(
    bookmakers,
    inputs.bookieB,
    inputs.market,
    inputs.line,
    inputs.outcome
  );

  const bookmakerAIsPolish = isPolishBookmaker(
    bookmakers,
    inputs.bookieA
  );

  const bookmakerBIsPolish = isPolishBookmaker(
    bookmakers,
    inputs.bookieB
  );

  const taxModeEnabled =
    inputs.calculationMode === "with_tax";

  const foreignDeductionPercentA =
    normalizeDeductionPercent(
      inputs.foreignDeductionA
    );

  const foreignDeductionPercentB =
    normalizeDeductionPercent(
      inputs.foreignDeductionB
    );

  const deductionRateA = !taxModeEnabled
    ? 0
    : bookmakerAIsPolish
      ? POLISH_BETTING_TAX_RATE
      : foreignDeductionPercentA / 100;

  const deductionRateB = !taxModeEnabled
    ? 0
    : bookmakerBIsPolish
      ? POLISH_BETTING_TAX_RATE
      : foreignDeductionPercentB / 100;

  const deductionPercentA =
    deductionRateA * 100;

  const deductionPercentB =
    deductionRateB * 100;

  const taxA =
    amount * deductionRateA;

  const taxB =
    amount * deductionRateB;

  const effectiveStakeA = Math.max(
    0,
    amount - taxA
  );

  const effectiveStakeB = Math.max(
    0,
    amount - taxB
  );

  const payoutA =
    oddA > 0
      ? effectiveStakeA * oddA
      : 0;

  const payoutB =
    oddB > 0
      ? effectiveStakeB * oddB
      : 0;

  const profitA =
    oddA > 0
      ? payoutA - amount
      : 0;

  const profitB =
    oddB > 0
      ? payoutB - amount
      : 0;

  const difference = payoutA - payoutB;

  const absoluteDifference = Math.abs(
    difference
  );

  const calculatorReady =
    amount > 0 &&
    inputs.market &&
    inputs.outcome &&
    inputs.bookieA &&
    inputs.bookieB &&
    oddA > 0 &&
    oddB > 0;

  let betterBookmaker = "";

  if (difference > 0) {
    betterBookmaker = inputs.bookieA;
  } else if (difference < 0) {
    betterBookmaker = inputs.bookieB;
  }

  if (!match) {
    return null;
  }

  return (
    <div
      className="card"
      style={{
        padding: "20px",
        backgroundColor: "#1e1e1e",
        border: "1px solid #333",
        borderRadius: "12px",
        position: "sticky",
        top: "20px"
      }}
    >
      <div style={calculatorHeaderStyle}>
        <h2
          style={{
            fontSize: "1.2em",
            margin: 0,
            color: "#fff"
          }}
        >
          Kalkulator kursów
        </h2>

        <button
          type="button"
          aria-label="Informacje o kalkulatorze"
          title="Jak działa kalkulator?"
          onClick={() =>
            setShowHelp((previous) => !previous)
          }
          style={{
            ...helpButtonStyle,
            ...(showHelp
              ? activeHelpButtonStyle
              : {})
          }}
        >
          ?
        </button>
      </div>

      {showHelp && (
      <div style={helpPopupStyle}>
        <div style={helpPopupHeaderStyle}>
          <strong>Jak działa kalkulator?</strong>

          <button
            type="button"
            aria-label="Zamknij pomoc"
            onClick={() => setShowHelp(false)}
            style={helpCloseButtonStyle}
          >
            ×
          </button>
        </div>

        <div style={helpSectionStyle}>
        <strong style={helpTitleStyle}>
          Działanie
        </strong>

        <p style={helpTextStyle}>
          Wybierasz dwóch bukmacherów i kalkulator
          przelicza o ile więcej wygrasz u danego bukmachera niż u innego.
          Masz także 2 tryby, bez podatku i z podatkiem jesli znasz podatek zagranicznego bukmachera
          możesz go wpisać w polu wtedy otrzymasz najbardziej rzetelne wyniki profitu u obu bukmacherów.
        </p>
      </div>

        <div style={helpSectionStyle}>
          <strong style={helpTitleStyle}>
            Bez podatku
          </strong>

          <p style={helpTextStyle}>
            Kalkulator porównuje same kursy bez
            podatków i potrąceń.
          </p>

          <div style={formulaStyle}>
            Wypłata = kwota × kurs
          </div>
        </div>

        <div style={helpSectionStyle}>
          <strong style={helpTitleStyle}>
            Z podatkiem
          </strong>

          <p style={helpTextStyle}>
            Dla polskich bukmacherów kalkulator
            automatycznie odejmuje 12% od wpisanej
            stawki.
          </p>

          <div style={formulaStyle}>
            Wypłata PL = kwota × 0,88 × kurs
          </div>

          <p style={helpTextStyle}>
            Przy zagranicznych bukmacherach możesz
            samodzielnie wpisać procent potrącenia.
            Puste pole lub 0% oznacza wynik brutto.
          </p>
        </div>

        <div style={helpSectionStyle}>
          <strong style={helpTitleStyle}>
            Czysty zysk
          </strong>

          <div style={formulaStyle}>
            Czysty zysk = wypłata − pełna kwota
            pobrana z konta
          </div>
        </div>
        

        <p style={helpWarningStyle}>
          Kalkulator ma charakter informacyjny.
          Rzeczywiste podatki, promocje i inne
          potrącenia mogą zależeć od zasad danego
          bukmachera.
        </p>
      </div>
    )}

      <p
        style={{
          margin: "0 0 18px 0",
          color: "#888",
          fontSize: "0.8em",
          lineHeight: "1.4"
        }}
      >
        Porównaj wypłatę dla tej samej kwoty.
        W trybie z podatkiem polscy bukmacherzy
        mają stałe potrącenie 12%, a dla
        zagranicznych możesz wpisać własne.
      </p>

      <div style={formStyle}>
        <label style={labelStyle}>
          Tryb obliczeń
        </label>

        <div style={modeButtonsStyle}>
          <button
            type="button"
            onClick={() =>
              setInputs((previous) => ({
                ...previous,
                calculationMode: "without_tax"
              }))
            }
            style={{
              ...modeButtonStyle,
              ...(inputs.calculationMode ===
              "without_tax"
                ? activeModeButtonStyle
                : {})
            }}
          >
            Bez podatku
          </button>

          <button
            type="button"
            onClick={() =>
              setInputs((previous) => ({
                ...previous,
                calculationMode: "with_tax"
              }))
            }
            style={{
              ...modeButtonStyle,
              ...(inputs.calculationMode ===
              "with_tax"
                ? activeModeButtonStyle
                : {})
            }}
          >
            Z podatkiem
          </button>
        </div>

        <div style={modeInfoStyle}>
          {inputs.calculationMode ===
          "without_tax"
            ? "Porównanie samych kursów: kwota × kurs."
            : "Polscy: stałe 12%. Zagraniczni: własne potrącenie lub 0%."}
        </div>
        <label style={labelStyle}>
          Kwota pobrana z konta
        </label>

        <input
          type="number"
          min="0"
          step="1"
          value={inputs.amount}
          onChange={(event) =>
            setInputs((previous) => ({
              ...previous,
              amount: event.target.value
            }))
          }
          style={inputStyle}
        />

        <label style={labelStyle}>
          Rynek
        </label>

        <select
          value={inputs.market}
          onChange={(event) =>
            changeMarket(event.target.value)
          }
          style={inputStyle}
        >
          {availableMarkets.map((market) => (
            <option
              key={market}
              value={market}
            >
              {MARKET_CONFIG[market]?.label}
            </option>
          ))}
        </select>

        {MARKET_CONFIG[inputs.market]?.hasLines && (
          <>
            <label style={labelStyle}>
              Linia
            </label>

            <select
              value={inputs.line}
              onChange={(event) =>
                changeLine(event.target.value)
              }
              style={inputStyle}
            >
              {availableLines.map((line) => (
                <option
                  key={line}
                  value={line}
                >
                  {line}
                </option>
              ))}
            </select>
          </>
        )}

        <label style={labelStyle}>
          Typ zakładu
        </label>

        <select
          value={inputs.outcome}
          onChange={(event) =>
            changeOutcome(event.target.value)
          }
          style={inputStyle}
        >
          {outcomes.map((outcome) => (
            <option
              key={outcome.value}
              value={outcome.value}
            >
              {outcome.label}
            </option>
          ))}
        </select>

        <label style={labelStyle}>
          Bukmacher 1
        </label>

        <select
          value={inputs.bookieA}
          onChange={(event) =>
            setInputs((previous) => ({
              ...previous,
              bookieA: event.target.value,
              foreignDeductionA: ""
            }))
          }
          style={inputStyle}
        >
          <option value="">
            -- wybierz bukmachera --
          </option>

          {availableBookmakers.map(
            (bookmaker) => (
              <option
                key={`a_${bookmaker.nazwa}`}
                value={bookmaker.nazwa}
              >
                {bookmaker.nazwa}
                {bookmaker.typ === "polski"
                  ? " (PL)"
                  : " (zagraniczny)"}
              </option>
            )
          )}
        </select>

        <div style={oddStyle}>
          Kurs:{" "}
          <strong>
            {oddA > 0 ? oddA.toFixed(2) : "-"}
          </strong>
        </div>
        {taxModeEnabled && (
          bookmakerAIsPolish ? (
            <div style={taxFixedInfoStyle}>
              Stałe potrącenie od stawki: 12%
            </div>
          ) : (
            <>
              <label style={labelStyle}>
                Potrącenie bukmachera 1 (%)
              </label>

              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="0 = wynik brutto"
                value={inputs.foreignDeductionA}
                onChange={(event) =>
                  setInputs((previous) => ({
                    ...previous,
                    foreignDeductionA:
                      event.target.value
                  }))
                }
                style={inputStyle}
              />

              <div style={fieldHelpStyle}>
                Pozostaw puste lub wpisz 0, aby
                obliczyć wypłatę brutto.
              </div>
            </>
          )
        )}

        <label style={labelStyle}>
          Bukmacher 2
        </label>

        <select
          value={inputs.bookieB}
          onChange={(event) =>
            setInputs((previous) => ({
              ...previous,
              bookieB: event.target.value,
              foreignDeductionB: ""
            }))
          }
          style={inputStyle}
        >
          <option value="">
            -- wybierz bukmachera --
          </option>

          {availableBookmakers.map(
            (bookmaker) => (
              <option
                key={`b_${bookmaker.nazwa}`}
                value={bookmaker.nazwa}
              >
                {bookmaker.nazwa}
                {bookmaker.typ === "polski"
                  ? " (PL)"
                  : " (zagraniczny)"}
              </option>
            )
          )}
        </select>

        <div style={oddStyle}>
          Kurs:{" "}
          <strong>
            {oddB > 0 ? oddB.toFixed(2) : "-"}
          </strong>
        </div>
        {taxModeEnabled && (
          bookmakerBIsPolish ? (
            <div style={taxFixedInfoStyle}>
              Stałe potrącenie od stawki: 12%
            </div>
          ) : (
            <>
              <label style={labelStyle}>
                Podatek (%)
              </label>

              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="0 = wynik brutto"
                value={inputs.foreignDeductionB}
                onChange={(event) =>
                  setInputs((previous) => ({
                    ...previous,
                    foreignDeductionB:
                      event.target.value
                  }))
                }
                style={inputStyle}
              />

              <div style={fieldHelpStyle}>
                Pozostaw puste lub wpisz 0, aby
                obliczyć wypłatę brutto.
              </div>
            </>
          )
        )}
      </div>

      <div style={resultBoxStyle}>
        {!calculatorReady ? (
          <p
            style={{
              margin: 0,
              color: "#888",
              textAlign: "center"
            }}
          >
            Wybierz rynek, typ i dwóch
            bukmacherów.
          </p>
        ) : (
          <>
            <div style={resultRowStyle}>
              <span>{inputs.bookieA}</span>

              <strong>
                {payoutA.toFixed(2)} PLN
              </strong>
            </div>

            <div style={smallResultStyle}>
              {taxModeEnabled ? (
                <>
                  {bookmakerAIsPolish
                    ? "Podatek"
                    : "Potrącenie"}{" "}
                  {deductionPercentA.toFixed(1)}%:{" "}
                  {taxA.toFixed(2)} PLN
                  <br />

                  Stawka po podatku:{" "}
                  {effectiveStakeA.toFixed(2)} PLN
                  <br />

                  {!bookmakerAIsPolish &&
                    deductionRateA === 0 && (
                      <>
                        Wynik zagranicznego bukmachera
                        jest wynikiem brutto.
                        <br />
                      </>
                    )}
                </>
              ) : (
                <>
                  Podatki i potrącenia:
                  nieuwzględnione
                  <br />
                </>
              )}

              {taxModeEnabled &&
              !bookmakerAIsPolish &&
              deductionRateA === 0
                ? "Potencjalny zysk brutto"
                : "Czysty zysk"}:{" "}
              {profitA.toFixed(2)} PLN
            </div>

            <div style={resultRowStyle}>
              <span>{inputs.bookieB}</span>

              <strong>
                {payoutB.toFixed(2)} PLN
              </strong>
            </div>

            <div style={smallResultStyle}>
              {taxModeEnabled ? (
                <>
                  {bookmakerBIsPolish
                    ? "Podatek"
                    : "Potrącenie"}{" "}
                  {deductionPercentB.toFixed(1)}%:{" "}
                  {taxB.toFixed(2)} PLN
                  <br />

                  Stawka po podatku:{" "}
                  {effectiveStakeB.toFixed(2)} PLN
                  <br />

                  {!bookmakerBIsPolish &&
                    deductionRateB === 0 && (
                      <>
                        Wynik zagranicznego bukmachera
                        jest wynikiem brutto.
                        <br />
                      </>
                    )}
                </>
              ) : (
                <>
                  Podatki i potrącenia:
                  nieuwzględnione
                  <br />
                </>
              )}

              {taxModeEnabled &&
              !bookmakerBIsPolish &&
              deductionRateB === 0
                ? "Potencjalny zysk brutto"
                : "Czysty zysk"}:{" "}
              {profitB.toFixed(2)} PLN
            </div>

            <div style={dividerStyle} />

            {absoluteDifference === 0 ? (
              <div
                style={{
                  color: "#fbbf24",
                  textAlign: "center",
                  fontWeight: "700"
                }}
              >
                Wypłata jest taka sama u obu
                bukmacherów.
              </div>
            ) : (
              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    margin: "0 0 5px 0",
                    color: "#aaa",
                    fontSize: "0.85em"
                  }}
                >
                  Więcej otrzymasz u:
                </p>

                <strong
                  style={{
                    display: "block",
                    color: "#10b981",
                    fontSize: "1.15em"
                  }}
                >
                  {betterBookmaker}
                </strong>

                <strong
                  style={{
                    display: "block",
                    marginTop: "5px",
                    color: "#10b981",
                    fontSize: "1.35em"
                  }}
                >
                  +{absoluteDifference.toFixed(2)} PLN
                </strong>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "10px"
};

const labelStyle = {
  color: "#aaa",
  fontSize: "0.8em",
  fontWeight: "600"
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  borderRadius: "5px",
  border: "1px solid #444",
  backgroundColor: "#2a2a2a",
  color: "#fff",
  outline: "none"
};

const oddStyle = {
  marginTop: "-4px",
  padding: "6px 9px",
  borderRadius: "4px",
  color: "#aaa",
  backgroundColor: "#252525",
  fontSize: "0.78em",
  textAlign: "right"
};

const resultBoxStyle = {
  marginTop: "20px",
  padding: "15px",
  backgroundColor: "#2a2a2a",
  borderRadius: "8px"
};

const resultRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  padding: "5px 0",
  color: "#ddd",
  fontSize: "0.86em"
};

const smallResultStyle = {
  marginBottom: "7px",
  color: "#777",
  fontSize: "0.72em",
  textAlign: "right"
};

const dividerStyle = {
  height: "1px",
  margin: "12px 0",
  backgroundColor: "#444"
};

const modeButtonsStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px"
};

const modeButtonStyle = {
  padding: "9px 8px",
  border: "1px solid #444",
  borderRadius: "6px",
  backgroundColor: "#2a2a2a",
  color: "#aaa",
  fontSize: "0.78em",
  fontWeight: "700",
  cursor: "pointer"
};

const activeModeButtonStyle = {
  borderColor: "#3b82f6",
  backgroundColor: "#1d4ed8",
  color: "#fff"
};

const modeInfoStyle = {
  marginTop: "-3px",
  padding: "7px 9px",
  borderRadius: "5px",
  backgroundColor: "#252525",
  color: "#888",
  fontSize: "0.7em",
  lineHeight: "1.4"
};

const taxFixedInfoStyle = {
  marginTop: "-4px",
  padding: "7px 9px",
  borderRadius: "5px",
  border: "1px solid #14532d",
  backgroundColor: "#10271d",
  color: "#34d399",
  fontSize: "0.72em"
};

const fieldHelpStyle = {
  marginTop: "-6px",
  color: "#777",
  fontSize: "0.68em",
  lineHeight: "1.35"
};

const calculatorHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "6px"
};

const helpButtonStyle = {
  width: "28px",
  height: "28px",
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  border: "1px solid #555",
  borderRadius: "50%",
  backgroundColor: "#2a2a2a",
  color: "#ccc",
  fontSize: "0.9em",
  fontWeight: "800",
  cursor: "pointer",
  transition: "all 0.2s ease"
};

const activeHelpButtonStyle = {
  borderColor: "#3b82f6",
  backgroundColor: "#1d4ed8",
  color: "#fff"
};

const helpPopupStyle = {
  position: "absolute",
  top: "52px",
  right: "20px",
  zIndex: 100,
  width: "min(330px, calc(100% - 40px))",
  boxSizing: "border-box",
  padding: "15px",
  border: "1px solid #444",
  borderRadius: "10px",
  backgroundColor: "#242424",
  color: "#ddd",
  boxShadow: "0 12px 35px rgba(0, 0, 0, 0.55)"
};

const helpPopupHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
  color: "#fff",
  fontSize: "0.9em"
};

const helpCloseButtonStyle = {
  width: "25px",
  height: "25px",
  padding: 0,
  border: "none",
  borderRadius: "5px",
  backgroundColor: "#333",
  color: "#aaa",
  fontSize: "1.2em",
  lineHeight: 1,
  cursor: "pointer"
};

const helpSectionStyle = {
  padding: "10px 0",
  borderTop: "1px solid #3a3a3a"
};

const helpTitleStyle = {
  display: "block",
  marginBottom: "5px",
  color: "#60a5fa",
  fontSize: "0.8em"
};

const helpTextStyle = {
  margin: "5px 0",
  color: "#aaa",
  fontSize: "0.72em",
  lineHeight: "1.45"
};

const formulaStyle = {
  margin: "7px 0",
  padding: "7px 9px",
  borderRadius: "5px",
  backgroundColor: "#1a1a1a",
  color: "#34d399",
  fontSize: "0.7em",
  lineHeight: "1.4"
};

const helpWarningStyle = {
  margin: "10px 0 0 0",
  padding: "8px",
  border: "1px solid #5c4815",
  borderRadius: "5px",
  backgroundColor: "#2b2515",
  color: "#d6b85c",
  fontSize: "0.66em",
}

export default OddsCalculator;