import React, {
  useEffect,
  useState
} from "react";

const ITEMS_PER_PAGE = 20;
const VISIBLE_PAGE_BUTTONS = 5;

function Top5({ items, onSelect }) {
  const valueBets = Array.isArray(items)
    ? items
    : [];

  const [currentPage, setCurrentPage] =
    useState(1);

  const [sportFilter, setSportFilter] =
    useState("all");

  const [typeFilter, setTypeFilter] =
    useState("all");

  const [marketFilter, setMarketFilter] =
    useState("all");

  const [lineFilter, setLineFilter] =
    useState("all");

  const [
    comparisonFilter,
    setComparisonFilter
  ] = useState("all");

  const [opportunitySearch, setOpportunitySearch] =
    useState("");


  const normalizeValue = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(/ł/g, "l")
      .replace(/đ/g, "d")
      .replace(/ß/g, "ss")
      .replace(/\s+/g, " ")
      .trim();

  const getSportKey = (item) => {
    const possibleSportValues = [
      item?.dyscyplina,
      item?.sport,
      item?.sportName,
      item?.rawMatch?.dyscyplina,
      item?.rawMatch?.sport,
      item?.rawMatch?.sportName,
      item?.rawMatch?.sport_name,
      item?.rawMatch?.category,
      item?.match?.dyscyplina,
      item?.match?.sport
    ];

    const sport = normalizeValue(
      possibleSportValues
        .filter(Boolean)
        .join(" ")
    )
      .replace(
        /[^a-z0-9\s]/g,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();

    if (
      sport.includes("pilka nozna") ||
      sport.includes("football") ||
      sport.includes("soccer") ||
      sport.includes("futbol")
    ) {
      return "football";
    }

    if (
      sport.includes("koszykowka") ||
      sport.includes("basketball") ||
      sport.includes("basket")
    ) {
      return "basketball";
    }

    if (
      sport.includes("tenis") ||
      sport.includes("tennis")
    ) {
      return "tennis";
    }

    if (
      sport.includes("pilka reczna") ||
      sport.includes("handball") ||
      sport.includes("reczna")
    ) {
      return "handball";
    }

    if (
      sport.includes("boks") ||
      sport.includes("boxing")
    ) {
      return "boxing";
    }

    return "other";
  };

  const getSportLabel = (sportKey) => {
    const labels = {
      football: "Piłka nożna",
      basketball: "Koszykówka",
      tennis: "Tenis",
      handball: "Piłka ręczna",
      boxing: "Boks",
      other: "Inne"
    };

    return labels[sportKey] || sportKey;
  };

  const normalizeLine = (value) => {
    const rawValue = String(
      value ?? ""
    ).trim();

    if (!rawValue) {
      return "";
    }

    return rawValue
      .replace(",", ".")
      .replace(/\s+/g, "");
  };

  const getMarketCategory = (market) => {
    const normalizedMarket =
      normalizeValue(market);

    if (
      normalizedMarket.includes(
        "over_under"
      ) ||
      normalizedMarket.includes(
        "over / under"
      ) ||
      normalizedMarket.includes(
        "over under"
      ) ||
      normalizedMarket.includes(
        "total"
      )
    ) {
      return "over_under";
    }

    if (
      normalizedMarket.includes(
        "handicap"
      )
    ) {
      return "handicap";
    }

    if (
      normalizedMarket.includes(
        "podwojna_szansa"
      ) ||
      normalizedMarket.includes(
        "podwojna szansa"
      ) ||
      normalizedMarket.includes(
        "double chance"
      )
    ) {
      return "double_chance";
    }

    if (
      normalizedMarket.includes("btts") ||
      normalizedMarket.includes(
        "both teams to score"
      ) ||
      normalizedMarket.includes(
        "obie druzyny strzela"
      )
    ) {
      return "btts";
    }

    if (
      normalizedMarket === "1x2" ||
      normalizedMarket.includes(
        "home-away"
      ) ||
      normalizedMarket.includes(
        "home / away"
      ) ||
      normalizedMarket.includes(
        "zwyciezca"
      )
    ) {
      return "winner";
    }

    return normalizedMarket;
  };

  const getMarketLabel = (
    marketCategory
  ) => {
    const labels = {
      winner: "1X2 / Zwycięzca",
      btts: "BTTS",
      double_chance: "Double Chance",
      over_under: "Over / Under",
      handicap: "Handicap"
    };

    return (
      labels[marketCategory] ||
      marketCategory
    );
  };

  const marketsBySport = {
    football: [
      "winner",
      "btts",
      "double_chance",
      "over_under",
      "handicap"
    ],

    basketball: [
      "winner",
      "over_under",
      "handicap"
    ],

    tennis: [
      "winner",
      "over_under",
      "handicap"
    ],

    handball: [
      "winner",
      "over_under",
      "handicap"
    ],

    boxing: [
      "winner"
    ]
  };

  const sportOrder = [
    "football",
    "basketball",
    "tennis",
    "handball",
    "boxing"
  ];

  const sportCounts = valueBets.reduce(
    (counts, item) => {
      const sportKey =
        getSportKey(item);

      if (sportKey !== "other") {
        counts[sportKey] =
          (counts[sportKey] || 0) + 1;
      }

      return counts;
    },
    {}
  );

const availableSports = sportOrder

  const sportValueBets =
    sportFilter === "all"
      ? valueBets
      : valueBets.filter(
          (item) =>
            getSportKey(item) ===
            sportFilter
        );

  const allowedMarketCategories =
    sportFilter === "all"
      ? [
          "winner",
          "btts",
          "double_chance",
          "over_under",
          "handicap"
        ]
      : marketsBySport[sportFilter] || [];


  const availableMarkets = Array.from(
    new Set(
      sportValueBets
        .map((item) =>
          getMarketCategory(
            item?.okazja?.rynek
          )
        )
        .filter(
          (marketCategory) =>
            allowedMarketCategories.includes(
              marketCategory
            )
        )
    )
  ).sort((first, second) => {
    const firstIndex =
      allowedMarketCategories.indexOf(
        first
      );

    const secondIndex =
      allowedMarketCategories.indexOf(
        second
      );

    return firstIndex - secondIndex;
  });

  const marketValueBets =
    marketFilter === "all"
      ? sportValueBets
      : sportValueBets.filter(
          (item) =>
            getMarketCategory(
              item?.okazja?.rynek
            ) === marketFilter
        );

  const typeValueBets =
    typeFilter === "all"
      ? marketValueBets
      : marketValueBets.filter(
          (item) =>
            String(
              item?.okazja?.wybor || ""
            ).trim() === typeFilter
        );

  const availableLines = Array.from(
    new Set(
      typeValueBets
        .map((item) =>
          normalizeLine(
            item?.okazja?.linia
          )
        )
        .filter(Boolean)
    )
  ).sort((first, second) => {
    const firstNumber =
      Number.parseFloat(
        first.replace("+", "")
      );

    const secondNumber =
      Number.parseFloat(
        second.replace("+", "")
      );

    if (
      Number.isNaN(firstNumber) ||
      Number.isNaN(secondNumber)
    ) {
      return first.localeCompare(
        second,
        "pl"
      );
    }

    return firstNumber - secondNumber;
  });

  const availableTypes = Array.from(
    new Set(
      marketValueBets
        .map((item) =>
          String(
            item?.okazja?.wybor || ""
          ).trim()
        )
        .filter(Boolean)
    )
  ).sort((first, second) =>
    first.localeCompare(
      second,
      "pl"
    )
  );

  const filteredValueBets =
    valueBets.filter((item) => {
      const opportunity =
        item?.okazja || {};

      const itemSport =
        getSportKey(item);

      const itemMarket =
        getMarketCategory(
          opportunity.rynek
        );

      const matchName =
        normalizeValue(
          item?.mecz ||
          item?.match ||
          item?.rawMatch?.mecz ||
          item?.rawMatch?.match ||
          ""
        );

      const sportName =
        normalizeValue(
          item?.dyscyplina ||
          item?.sport ||
          item?.rawMatch?.dyscyplina ||
          item?.rawMatch?.sport ||
          ""
        );

      const bookmakerLow =
        normalizeValue(
          opportunity.bukMin
        );

      const bookmakerHigh =
        normalizeValue(
          opportunity.bukMax
        );

      const searchValue =
        normalizeValue(
          opportunitySearch
        );

      const matchesSport =
        sportFilter === "all" ||
        itemSport === sportFilter;

      const matchesMarket =
        marketFilter === "all" ||
        itemMarket === marketFilter;

      const matchesLine =
        lineFilter === "all" ||
        normalizeLine(
          opportunity.linia
        ) === lineFilter;

      const matchesType =
        typeFilter === "all" ||
        opportunity.wybor ===
          typeFilter;

      const matchesComparison =
        comparisonFilter === "all" ||
        opportunity.rodzaj ===
          comparisonFilter;

      const matchesSearch =
        !searchValue ||
        matchName.includes(
          searchValue
        ) ||
        sportName.includes(
          searchValue
        ) ||
        bookmakerLow.includes(
          searchValue
        ) ||
        bookmakerHigh.includes(
          searchValue
        );

      return (
        matchesSport &&
        matchesMarket &&
        matchesLine &&
        matchesType &&
        matchesComparison &&
        matchesSearch
      );
    });


  const totalPages = Math.max(
  1,
    Math.ceil(
      filteredValueBets.length /
      ITEMS_PER_PAGE
    )
  );

  useEffect(() => {
    setCurrentPage((previousPage) =>
      Math.min(previousPage, totalPages)
    );
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    sportFilter,
    marketFilter,
    lineFilter,
    typeFilter,
    comparisonFilter,
    opportunitySearch
  ]);

  const firstItemIndex =
    (currentPage - 1) *
    ITEMS_PER_PAGE;

  const lastItemIndex =
    firstItemIndex +
    ITEMS_PER_PAGE;

  const visibleValueBets =
    filteredValueBets.slice(
      firstItemIndex,
      lastItemIndex
    );

  const getVisiblePages = () => {
    const visibleCount = Math.min(
      VISIBLE_PAGE_BUTTONS,
      totalPages
    );

    let startPage = Math.max(
      1,
      currentPage -
      Math.floor(visibleCount / 2)
    );

    let endPage =
      startPage +
      visibleCount -
      1;

    if (endPage > totalPages) {
      endPage = totalPages;

      startPage = Math.max(
        1,
        endPage -
        visibleCount +
        1
      );
    }

    return Array.from(
      {
        length:
          endPage -
          startPage +
          1
      },
      (_, index) =>
        startPage + index
    );
  };

  const visiblePages =
    getVisiblePages();

  const changePage = (pageNumber) => {
    const safePage = Math.min(
      Math.max(pageNumber, 1),
      totalPages
    );

    setCurrentPage(safePage);

    window.requestAnimationFrame(() => {
      const listElement =
        document.getElementById(
          "top-opportunities-list"
        );

      if (listElement) {
        const elementPosition =
          listElement.getBoundingClientRect()
            .top +
          window.scrollY -
          120;

        window.scrollTo({
          top: Math.max(
            elementPosition,
            0
          ),
          behavior: "smooth"
        });
      }
    });
  };

  const handleSportChange = (
    event
  ) => {
    const selectedSportValue =
      event.target.value;

    setSportFilter(
      selectedSportValue
    );

    setMarketFilter("all");
    setLineFilter("all");
    setTypeFilter("all");
    setComparisonFilter("all");
    setOpportunitySearch("");
    setCurrentPage(1);
  };

  const handleMarketChange = (
    event
  ) => {
    const selectedMarketValue =
      event.target.value;

    setMarketFilter(
      selectedMarketValue
    );

    setLineFilter("all");
    setTypeFilter("all");
    setCurrentPage(1);
  };

  const filtersActive =
    sportFilter !== "all" ||
    marketFilter !== "all" ||
    lineFilter !== "all" ||
    typeFilter !== "all" ||
    comparisonFilter !== "all" ||
    opportunitySearch.trim() !== "";

  const clearFilters = () => {
    setSportFilter("all");
    setMarketFilter("all");
    setLineFilter("all");
    setTypeFilter("all");
    setComparisonFilter("all");
    setOpportunitySearch("");
    setCurrentPage(1);
  };

  return (
    <div
      id="top-opportunities-list"
      style={{
        padding: "4px 10px 10px"
      }}
    >
      <style>
        {`
          @keyframes radarPulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
          }
          .pulse-dot {
            width: 12px;
            height: 12px;
            background-color: #ef4444;
            border-radius: 50%;
            display: inline-block;
            margin-right: 10px;
            animation: radarPulse 2s infinite;
          }
          .target-card:hover {
            border-color: #3b82f6 !important;
            box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.2);
            transform: translateY(-3px);
          }
          .opportunity-filters {
            display: grid;
          }

          @media (max-width: 900px) {
            .opportunity-filters {
              grid-template-columns:
                repeat(2, minmax(0, 1fr)) !important;
            }
          }

          @media (max-width: 560px) {
            .opportunity-filters {
              grid-template-columns:
                minmax(0, 1fr) !important;
            }
          }
        `}
      </style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          marginBottom: "28px"
        }}
      >
        <div
          style={{
            backgroundColor: "#1e293b",
            color: "#60a5fa",
            padding: "6px 15px",
            borderRadius: "20px",
            fontSize: "0.9em",
            fontWeight: "bold",
            border:
              "1px solid #3b82f6"
          }}
        >
          Znalezione okazje:{" "}
          {filteredValueBets.length}
        </div>

        {filteredValueBets.length > 0 && (
          <div
            style={{
              color: "#94a3b8",
              fontSize: "0.82em",
              whiteSpace: "nowrap"
            }}
          >
          </div>
        )}
      </div>

      <div
        className="opportunity-filters"
        style={{
          display: "grid",
          gridTemplateColumns:
          sportFilter === "all"
            ? "minmax(220px, 360px) auto"
            : "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "10px",
          marginBottom: "24px",
          padding: "14px",
          backgroundColor: "#111827",
          border: "1px solid #2a313c",
          borderRadius: "10px"
        }}
      >
        <select
          value={sportFilter}
          onChange={handleSportChange}
          style={{
            height: "42px",
            padding: "0 12px",
            borderRadius: "7px",
            border:
              sportFilter === "all"
                ? "1px solid #3b82f6"
                : "1px solid #10b981",
            backgroundColor: "#0f172a",
            color:
              sportFilter === "all"
                ? "#94a3b8"
                : "#f8fafc",
            cursor: "pointer",
            fontWeight: "700"
          }}
        >
          <option value="all">
            Wszystkie sporty
          </option>

          {availableSports.map(
            (sport) => (
              <option
                key={sport}
                value={sport}
              >
                {getSportLabel(sport)}
                {" ("}
                {sportCounts[sport] || 0}
                {")"}
              </option>
            )
          )}
        </select>

        {sportFilter === "all" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: "#64748b",
              fontSize: "0.85em"
            }}
          >
            Wyświetlane są wszystkie okazje.
            Wybierz sport, aby uruchomić
            dokładniejsze filtry.
          </div>
        )}

        {sportFilter !== "all" && (
          <>
            <select
              value={marketFilter}
              onChange={
                handleMarketChange
              }
              style={{
                height: "42px",
                padding: "0 12px",
                borderRadius: "7px",
                border:
                  marketFilter === "all"
                    ? "1px solid #3b82f6"
                    : "1px solid #10b981",
                backgroundColor: "#0f172a",
                color:
                  marketFilter === "all"
                    ? "#94a3b8"
                    : "#f8fafc",
                cursor: "pointer",
                fontWeight: "700"
              }}
            >
              <option value="all">
                Wybierz rynek
              </option>

              {availableMarkets.map(
                (marketCategory) => (
                  <option
                    key={marketCategory}
                    value={marketCategory}
                  >
                    {getMarketLabel(
                      marketCategory
                    )}
                  </option>
                )
              )}
            </select>

            {marketFilter !== "all" && (
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(
                    event.target.value
                  );

                  setLineFilter("all");
                  setCurrentPage(1);
                }}
                style={{
                  height: "42px",
                  padding: "0 12px",
                  borderRadius: "7px",
                  border:
                    typeFilter === "all"
                      ? "1px solid #3b82f6"
                      : "1px solid #10b981",
                  backgroundColor:
                    "#0f172a",
                  color:
                    typeFilter === "all"
                      ? "#94a3b8"
                      : "#f8fafc",
                  cursor: "pointer",
                  fontWeight: "700"
                }}
              >
                <option value="all">
                  Wszystkie Typy
                </option>

                {availableTypes.map(
                  (type) => (
                    <option
                      key={type}
                      value={type}
                    >
                      {type}
                    </option>
                  )
                )}
              </select>
            )}

            {marketFilter === "over_under" &&
              typeFilter !== "all" &&
              availableLines.length > 0 && (
                <select
                  value={lineFilter}
                  onChange={(event) =>
                    setLineFilter(
                      event.target.value
                    )
                  }
                  style={{
                    height: "42px",
                    padding: "0 12px",
                    borderRadius: "7px",
                    border:
                      lineFilter === "all"
                        ? "1px solid #3b82f6"
                        : "1px solid #10b981",
                    backgroundColor: "#0f172a",
                    color:
                      lineFilter === "all"
                        ? "#94a3b8"
                        : "#f8fafc",
                    cursor: "pointer",
                    fontWeight: "700"
                  }}
                >
                  <option value="all">
                    Wszystkie linie
                  </option>

                  {availableLines.map(
                    (line) => (
                      <option
                        key={line}
                        value={line}
                      >
                        Linia {line}
                      </option>
                    )
                  )}
                </select>
              )}

            {marketFilter !== "all" && (
              <select
                value={comparisonFilter}
                onChange={(event) =>
                  setComparisonFilter(
                    event.target.value
                  )
                }
                style={{
                  height: "42px",
                  padding: "0 12px",
                  borderRadius: "7px",
                  border:
                    "1px solid #374151",
                  backgroundColor:
                    "#0f172a",
                  color: "#f8fafc",
                  cursor: "pointer"
                }}
              >
                <option value="all">
                  Wszystkie porównania
                </option>

                <option
                  value="Polski vs zagraniczny"
                >
                  Polski vs zagraniczny
                </option>

                <option
                  value="Polski vs polski"
                >
                  Polski vs polski
                </option>
              </select>
            )}

            {marketFilter !== "all" && (
              <input
                type="text"
                value={opportunitySearch}
                onChange={(event) =>
                  setOpportunitySearch(
                    event.target.value
                  )
                }
                placeholder="Szukaj meczu lub bukmachera..."
                style={{
                  width: "100%",
                  minWidth: 0,
                  height: "42px",
                  padding: "0 12px",
                  borderRadius: "7px",
                  border:
                    "1px solid #374151",
                  backgroundColor:
                    "#0f172a",
                  color: "#f8fafc",
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
            )}

            <button
              type="button"
              onClick={clearFilters}
              disabled={!filtersActive}
              style={{
                height: "42px",
                padding: "0 14px",
                borderRadius: "7px",
                border: filtersActive
                  ? "1px solid #ef4444"
                  : "1px solid #374151",
                backgroundColor:
                  filtersActive
                    ? "rgba(239, 68, 68, 0.12)"
                    : "#1f2937",
                color: filtersActive
                  ? "#f87171"
                  : "#64748b",
                cursor: filtersActive
                  ? "pointer"
                  : "not-allowed",
                fontWeight: "bold",
                whiteSpace: "nowrap"
              }}
            >
              Wyczyść
            </button>
          </>
        )}

        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "10px",
            paddingTop: "4px",
            color: "#94a3b8",
            fontSize: "0.82em"
          }}
        >
          {sportFilter === "all" ? (
            <span>
              Wyświetlane są wszystkie najlepsze
              okazje:{" "}
              <strong
                style={{
                  color: "#60a5fa"
                }}
              >
                {filteredValueBets.length}
              </strong>
            </span>
          ) : (
            <>
              <span>
                Wyniki po filtrowaniu:{" "}
                <strong
                  style={{
                    color: "#60a5fa"
                  }}
                >
                  {
                    filteredValueBets.length
                  }
                </strong>
              </span>

              <span
                style={{
                  color: "#fbbf24"
                }}
              >
                Wybrany sport:{" "}
                {getSportLabel(
                  sportFilter
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {filteredValueBets.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", backgroundColor: "#121212", border: "1px dashed #333", borderRadius: "12px" }}>
          <div className="pulse-dot" style={{ margin: "0 auto 20px auto", display: "block", backgroundColor: "#3b82f6" }}></div>
          <h3
            style={{
              margin: "0 0 10px 0",
              color: "#fff"
            }}
          >
            Brak okazji spełniających filtry
          </h3>
          <p
            style={{
              margin: 0,
              color: "#777"
            }}
          >
            Zmień wybrany sport, rynek, typ,
            porównanie lub wyszukiwaną nazwę.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px" }}>
          {visibleValueBets.map((match) => {
            const { okazja } = match;
            
            return (
              <div 
                key={match.id}
                className="target-card"
                onClick={() => onSelect && onSelect(match.rawMatch)}
                style={{
                  backgroundColor: "#161b22",
                  borderRadius: "12px",
                  padding: "20px",
                  border: "1px solid #333",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between"
                }}
              >
                <div style={{ borderBottom: "1px solid #2a313c", paddingBottom: "12px", marginBottom: "15px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.75em", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>
                      {match.dyscyplina}
                    </span>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {match.isLive && (
                        <span style={{
                          backgroundColor: "#ef4444",
                          color: "white",
                          fontSize: "10px",
                          fontWeight: "bold",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          textTransform: "uppercase"
                        }}>
                          <span style={{
                            width: "5px",
                            height: "5px",
                            backgroundColor: "white",
                            borderRadius: "50%",
                            display: "inline-block",
                            animation: "radarPulse 2s infinite"
                          }}></span>
                          LIVE
                        </span>
                      )}
                      <span style={{ fontSize: "0.75em", color: "#64748b" }}>
                        {match.data}
                      </span>
                    </div>
                  </div>
                  <h4 style={{ margin: 0, fontSize: "1.1em", color: "#f8fafc", lineHeight: "1.4" }}>
                    {match.mecz}
                  </h4>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    marginBottom: "20px"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        flexWrap: "wrap"
                      }}
                    >
                      <span
                        style={{
                          color: "#cbd5e1",
                          fontSize: "0.9em"
                        }}
                      >
                        Wytypowano:
                      </span>

                      <span
                        style={{
                          backgroundColor:
                            "rgba(245, 158, 11, 0.15)",
                          color: "#fbbf24",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "0.85em",
                          fontWeight: "bold",
                          border:
                            "1px solid rgba(245, 158, 11, 0.3)"
                        }}
                      >
                        {okazja.wybor}
                      </span>
                    </div>

                    <span
                      style={{
                        backgroundColor:
                          "rgba(16, 185, 129, 0.15)",
                        color: "#10b981",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "0.8em",
                        fontWeight: "bold",
                        border:
                          "1px solid rgba(16, 185, 129, 0.3)"
                      }}
                    >
                      Yield {okazja.yield}%
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap"
                    }}
                  >
                    <span
                      style={{
                        padding: "4px 9px",
                        borderRadius: "5px",
                        backgroundColor:
                          okazja.rodzaj ===
                          "Polski vs zagraniczny"
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(245, 158, 11, 0.15)",
                        color:
                          okazja.rodzaj ===
                          "Polski vs zagraniczny"
                            ? "#f87171"
                            : "#fbbf24",
                        border:
                          okazja.rodzaj ===
                          "Polski vs zagraniczny"
                            ? "1px solid rgba(239, 68, 68, 0.3)"
                            : "1px solid rgba(245, 158, 11, 0.3)",
                        fontSize: "0.72em",
                        fontWeight: "700"
                      }}
                    >
                      {okazja.rodzaj}
                    </span>

                    <span
                      style={{
                        padding: "4px 9px",
                        borderRadius: "5px",
                        backgroundColor:
                          "rgba(59, 130, 246, 0.12)",
                        color: "#60a5fa",
                        border:
                          "1px solid rgba(59, 130, 246, 0.25)",
                        fontSize: "0.72em",
                        fontWeight: "700"
                      }}
                    >
                      Rynek: {okazja.rynek}
                      {okazja.linia
                        ? ` | Linia: ${okazja.linia}`
                        : ""}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", backgroundColor: "#0f172a", padding: "12px", borderRadius: "8px" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span
                      style={{
                        fontSize: "0.65em",
                        color: "#64748b",
                        textTransform: "uppercase"
                      }}
                    >
                      {okazja.bukMin}
                      {" "}
                      ({okazja.minTyp})
                    </span>
                    <span style={{ fontSize: "1.1em", color: "#94a3b8", textDecoration: "line-through" }}>{okazja.minKurs}</span>
                  </div>

                  <div style={{ color: "#334155", paddingBottom: "4px" }}>➔</div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "0.65em",
                        color: "#22c55e",
                        textTransform: "uppercase",
                        fontWeight: "bold"
                      }}
                    >
                      {okazja.bukMax}
                      {" "}
                      ({okazja.maxTyp})
                    </span>
                    <span style={{ fontSize: "1.4em", color: "#22c55e", fontWeight: "900", textShadow: "0 0 10px rgba(34, 197, 94, 0.3)" }}>{okazja.maxKurs}</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "0.65em", color: "#aaa", textTransform: "uppercase" }}>EDGE</span>
                    <span style={{ fontSize: "1.2em", color: "#fbbf24", fontWeight: "bold" }}>+{okazja.yield}%</span>
                  </div>
                </div>
              </div>
            );
            })}
        </div>
        )}

        {filteredValueBets.length > 0 &&
        totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              marginTop: "30px",
              paddingTop: "20px",
              borderTop:
                "1px solid #2a313c"
            }}
          >
            <button
              type="button"
              onClick={() =>
                changePage(
                  currentPage - 1
                )
              }
              disabled={
                currentPage === 1
              }
              aria-label="Poprzednia strona"
              style={{
                minWidth: "38px",
                height: "38px",
                padding: "0 12px",
                borderRadius: "6px",
                border:
                  "1px solid #3b3b3b",
                backgroundColor:
                  currentPage === 1
                    ? "#1f2937"
                    : "#333",
                color:
                  currentPage === 1
                    ? "#64748b"
                    : "#fff",
                cursor:
                  currentPage === 1
                    ? "not-allowed"
                    : "pointer",
                fontWeight: "bold",
                opacity:
                  currentPage === 1
                    ? 0.55
                    : 1
              }}
            >
              &lt;
            </button>

            {visiblePages[0] > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    changePage(1)
                  }
                  style={{
                    minWidth: "38px",
                    height: "38px",
                    padding: "0 12px",
                    borderRadius: "6px",
                    border:
                      "1px solid #3b3b3b",
                    backgroundColor:
                      "#333",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: "bold"
                  }}
                >
                  1
                </button>

                {visiblePages[0] >
                  2 && (
                  <span
                    style={{
                      color: "#64748b",
                      padding: "0 2px"
                    }}
                  >
                    …
                  </span>
                )}
              </>
            )}

            {visiblePages.map(
              (pageNumber) => {
                const isActive =
                  currentPage ===
                  pageNumber;

                return (
                  <button
                    type="button"
                    key={pageNumber}
                    onClick={() =>
                      changePage(
                        pageNumber
                      )
                    }
                    aria-current={
                      isActive
                        ? "page"
                        : undefined
                    }
                    style={{
                      minWidth: "38px",
                      height: "38px",
                      padding: "0 12px",
                      borderRadius: "6px",
                      border: isActive
                        ? "1px solid #10b981"
                        : "1px solid #3b3b3b",
                      backgroundColor:
                        isActive
                          ? "#10b981"
                          : "#333",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: "bold",
                      boxShadow: isActive
                        ? "0 0 12px rgba(16, 185, 129, 0.25)"
                        : "none"
                    }}
                  >
                    {pageNumber}
                  </button>
                );
              }
            )}

            {visiblePages[
              visiblePages.length - 1
            ] < totalPages && (
              <>
                {visiblePages[
                  visiblePages.length - 1
                ] <
                  totalPages - 1 && (
                  <span
                    style={{
                      color: "#64748b",
                      padding: "0 2px"
                    }}
                  >
                    …
                  </span>
                )}

                <button
                  type="button"
                  onClick={() =>
                    changePage(
                      totalPages
                    )
                  }
                  style={{
                    minWidth: "38px",
                    height: "38px",
                    padding: "0 12px",
                    borderRadius: "6px",
                    border:
                      "1px solid #3b3b3b",
                    backgroundColor:
                      "#333",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: "bold"
                  }}
                >
                  {totalPages}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() =>
                changePage(
                  currentPage + 1
                )
              }
              disabled={
                currentPage ===
                totalPages
              }
              aria-label="Następna strona"
              style={{
                minWidth: "38px",
                height: "38px",
                padding: "0 12px",
                borderRadius: "6px",
                border:
                  "1px solid #3b3b3b",
                backgroundColor:
                  currentPage ===
                  totalPages
                    ? "#1f2937"
                    : "#333",
                color:
                  currentPage ===
                  totalPages
                    ? "#64748b"
                    : "#fff",
                cursor:
                  currentPage ===
                  totalPages
                    ? "not-allowed"
                    : "pointer",
                fontWeight: "bold",
                opacity:
                  currentPage ===
                  totalPages
                    ? 0.55
                    : 1
              }}
            >
              &gt;
            </button>
          </div>
        )}
        </div>
        );
        }

export default Top5;