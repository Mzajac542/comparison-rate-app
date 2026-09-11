import React, { useEffect, useMemo, useState } from "react";

const ITEMS_PER_PAGE = 20;

const SPORT_META = {
  "Piłka nożna": { icon: "⚽", slug: "football" },
  "Koszykówka": { icon: "🏀", slug: "basketball" },
  "Tenis": { icon: "🎾", slug: "tennis" },
  "Piłka ręczna": { icon: "🤾", slug: "handball" },
  "Boks": { icon: "🥊", slug: "boxing" },
};

const normalize = (v) =>
  String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/\s+/g, " ")
    .trim();

const parseDate = (v) => {
  const p = Date.parse(String(v || "").replace(" ", "T"));
  return Number.isNaN(p) ? Number.MAX_SAFE_INTEGER : p;
};

const formatDate = (v) => {
  const raw = String(v || "").trim();
  if (!raw) return "Brak terminu";
  
  const [d, t] = raw.split(" ");
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  
  return m ? `${m[3]}.${m[2]}.${m[1]}${t ? `, ${t}` : ""}` : raw;
};

export default function Top5({
  items,
  onSelect,
  favoriteOpportunityIds = [],
  onToggleFavoriteOpportunity,
}) {
  const opportunities = Array.isArray(items) ? items : [];

  const [page, setPage] = useState(1);
  const [sport, setSport] = useState("all");
  const [market, setMarket] = useState("all");
  const [line, setLine] = useState("all");
  const [comparison, setComparison] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(() => localStorage.getItem("opportunitiesSort") || "yield-desc");

  useEffect(() => {
    localStorage.setItem("opportunitiesSort", sort);
  }, [sort]);

  useEffect(() => {
    setPage(1);
  }, [sport, market, line, comparison, search, sort]);

  const sportOptions = useMemo(() => {
    const m = new Map();
    opportunities.forEach((i) => {
      const n = i?.dyscyplina || "Inne";
      const k = i?.rawMatch?.id || i?.rawMatch?.mecz || i?.mecz || i?.id;
      if (!m.has(n)) m.set(n, new Set());
      m.get(n).add(k);
    });
    return [...m]
      .map(([name, x]) => ({ name, count: x.size }))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [opportunities]);

  const markets = useMemo(() => {
    if (sport === "all") return [];
    return [...new Set(
      opportunities
        .filter((i) => i?.dyscyplina === sport)
        .map((i) => i?.okazja?.rynek)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "pl"));
  }, [opportunities, sport]);

  const lines = useMemo(() => {
    if (sport === "all" || market === "all") return [];
    return [...new Set(
      opportunities
        .filter((i) => i?.dyscyplina === sport && i?.okazja?.rynek === market)
        .map((i) => String(i?.okazja?.linia || "").trim())
        .filter(Boolean)
    )].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  }, [opportunities, sport, market]);

  const filtered = useMemo(() => {
    return opportunities
      .filter((i) => {
        const o = i?.okazja || {};
        const q = normalize(search);
        const h = normalize(
          [i?.mecz, i?.dyscyplina, o.rynek, o.wybor, o.linia, o.bukMin, o.bukMax].join(" ")
        );
        
        return (
          (sport === "all" || i?.dyscyplina === sport) &&
          (market === "all" || o.rynek === market) &&
          (line === "all" || String(o.linia || "").trim() === line) &&
          (comparison === "all" || o.rodzaj === comparison) &&
          (!q || h.includes(q))
        );
      })
      .sort((a, b) => {
        if (sort === "date-asc") return parseDate(a?.data) - parseDate(b?.data);
        if (sort === "odd-desc") return parseFloat(b?.okazja?.maxKurs || 0) - parseFloat(a?.okazja?.maxKurs || 0);
        if (sort === "name-asc") return String(a?.mecz || "").localeCompare(String(b?.mecz || ""), "pl");
        
        return parseFloat(b?.okazja?.yield || 0) - parseFloat(a?.okazja?.yield || 0);
      });
  }, [opportunities, sport, market, line, comparison, search, sort]);

  const stats = useMemo(() => {
    const highest = Math.max(0, ...opportunities.map((i) => parseFloat(i?.okazja?.yield || 0)));
    const highestOdd = Math.max(0, ...opportunities.map((i) => parseFloat(i?.okazja?.maxKurs || 0)));
    const c = {};
    
    opportunities.forEach((i) => {
      c[i?.dyscyplina || "Inne"] = (c[i?.dyscyplina || "Inne"] || 0) + 1;
    });
    
    return {
      highest,
      highestOdd,
      leadingSport: Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || "Brak",
    };
  }, [opportunities]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const current = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const clear = () => {
    setSport("all");
    setMarket("all");
    setLine("all");
    setComparison("all");
    setSearch("");
    setSort("yield-desc");
  };

  return (
    <section className="opportunities-stage3">
      <header className="opportunities-hero">
        <div>
          <span className="opportunities-eyebrow">ANALIZA RÓŻNIC KURSOWYCH</span>
          <h2>Najlepsze okazje</h2>
          <p>Porównania z różnicą co najmniej 15%, uporządkowane według wybranych kryteriów.</p>
        </div>
        <span className="opportunities-result-pill">{filtered.length} wyników</span>
      </header>

      <div className="opportunities-stats">
        <article>
          <span>Wykryte okazje</span>
          <strong>{opportunities.length}</strong>
          <small>we wszystkich sportach</small>
        </article>
        <article>
          <span>Największa różnica</span>
          <strong>+{stats.highest.toFixed(1)}%</strong>
          <small>najmocniejszy sygnał</small>
        </article>
        <article>
          <span>Najwięcej okazji</span>
          <strong className="text-stat">{stats.leadingSport}</strong>
          <small>dominująca dyscyplina</small>
        </article>
        <article>
          <span>Najwyższy kurs</span>
          <strong>{stats.highestOdd.toFixed(2)}</strong>
          <small>kurs docelowy</small>
        </article>
      </div>

      <div className="opportunities-filter-panel">
        <div className="opportunities-filter-grid">
          <label>
            <span>Sport</span>
            <select
              value={sport}
              onChange={(e) => {
                setSport(e.target.value);
                setMarket("all");
                setLine("all");
              }}
            >
              <option value="all">
                Wybierz dyscyplinę ({new Set(opportunities.map((i) => i?.rawMatch?.id || i?.mecz)).size})
              </option>
              {sportOptions.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name} ({x.count})
                </option>
              ))}
            </select>
          </label>

          {sport !== "all" && (
            <label>
              <span>Rynek</span>
              <select
                value={market}
                onChange={(e) => {
                  setMarket(e.target.value);
                  setLine("all");
                }}
              >
                <option value="all">Wszystkie rynki</option>
                {markets.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          )}

          {sport !== "all" && market !== "all" && lines.length > 0 && (
            <label>
              <span>Linia</span>
              <select value={line} onChange={(e) => setLine(e.target.value)}>
                <option value="all">Wszystkie linie</option>
                {lines.map((v) => (
                  <option key={v} value={v}>
                    Linia {v}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>Porównanie</span>
            <select value={comparison} onChange={(e) => setComparison(e.target.value)}>
              <option value="all">Każdy typ</option>
              <option>Polski vs zagraniczny</option>
              <option>Polski vs polski</option>
            </select>
          </label>

          <label>
            <span>Sortowanie</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="yield-desc">Największa różnica</option>
              <option value="date-asc">Najbliższy termin</option>
              <option value="odd-desc">Najwyższy kurs</option>
              <option value="name-asc">Nazwa meczu</option>
            </select>
          </label>

          <label className="opportunities-search">
            <span>Wyszukiwanie</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mecz lub bukmacher..."
            />
          </label>

          <button type="button" className="opportunities-clear" onClick={clear}>
            Wyczyść filtry
          </button>
        </div>
      </div>

      {!current.length ? (
        <div className="opportunities-empty">
          <span>⌕</span>
          <h3>Brak pasujących okazji</h3>
          <p>Zmień filtry lub wyczyść wyszukiwanie.</p>
        </div>
      ) : (
        <div className="opportunities-grid">
          {current.map((item) => {
            const o = item?.okazja || {};
            const y = parseFloat(o.yield || 0);
            const level = y >= 50 ? "extreme" : y >= 30 ? "high" : y >= 20 ? "medium" : "standard";
            const meta = SPORT_META[item?.dyscyplina] || { icon: "◆", slug: "other" };
            const id = item.id || item.key;
            const favorite = favoriteOpportunityIds.includes(id);

            return (
              <article
                key={id}
                className={`opportunity-card sport-${meta.slug} opportunity-${level} ${
                  favorite ? "is-favorite" : ""
                }`}
                onClick={() => onSelect(item.rawMatch || item)}
              >
                <div className="opportunity-card-accent" />
                <button
                  type="button"
                  className={`opportunity-favorite-button ${favorite ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavoriteOpportunity?.(item);
                  }}
                  aria-label={favorite ? "Usuń okazję z ulubionych" : "Dodaj okazję do ulubionych"}
                >
                  {favorite ? "★" : "☆"}
                </button>
                <header>
                  <span className="opportunity-sport">
                    <span>{meta.icon}</span>
                    {item?.dyscyplina || "Sport"}
                  </span>
                  <time>{formatDate(item?.data)}</time>
                </header>
                
                <h3>{item?.mecz || "Nieznany mecz"}</h3>
                
                <div className="opportunity-tags">
                  <span className="opportunity-pick">
                    {o.wybor}
                    {o.linia ? ` ${o.linia}` : ""}
                  </span>
                  <span
                    className={
                      o.rodzaj === "Polski vs polski" ? "comparison-polish" : "comparison-foreign"
                    }
                  >
                    {o.rodzaj}
                  </span>
                </div>
                
                <p className="opportunity-market">{o.rynek}</p>
                
                <div className="opportunity-comparison">
                  <div>
                    <small>
                      {o.bukMin} ({o.minTyp})
                    </small>
                    <strong>{o.minKurs}</strong>
                  </div>
                  <span className="opportunity-arrow">→</span>
                  <div className="opportunity-better">
                    <small>
                      {o.bukMax} ({o.maxTyp})
                    </small>
                    <strong>{o.maxKurs}</strong>
                  </div>
                </div>
                
                <footer>
                  <span>Przewaga kursu</span>
                  <strong>+{y.toFixed(1)}%</strong>
                  <small>+{o.roznica}</small>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="opportunities-pagination">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            ←
          </button>
          <span>
            Strona <strong>{page}</strong> z {totalPages}
          </span>
          <button disabled={page === totalPages} onClick={() => setPage(page + 1)}>
            →
          </button>
        </nav>
      )}
    </section>
  );
}