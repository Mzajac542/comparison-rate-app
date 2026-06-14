import React, { useMemo } from 'react';

// ==========================================
// ⚙️ KONFIGURACJA RADARU
// ==========================================
const PL_BOOKIES = ["Betclic", "Superbet", "Fortuna", "STS", "LV BET", "BETFAN"];
const MIN_DIFFERENCE = 0.50; 
const MATCH_DURATION_MINS = 120; // Czas po którym mecz uznajemy za zakończony
// ==========================================

const scanForValueBets = (matches) => {
  const uniqueMatches = [];
  const seen = new Set();
  const now = new Date();
  
  // Formatujemy dzisiejszą datę do YYYY-MM-DD
  const todayStr = now.getFullYear() + "-" + 
                   String(now.getMonth() + 1).padStart(2, '0') + "-" + 
                   String(now.getDate()).padStart(2, '0');

  matches.forEach(match => {
    let isFinished = false;
    let isLive = match.isLive || false;

    // 1. Status tekstowy z API/Websocketa
    const currentStatus = match.status ? match.status.toString().trim().toUpperCase() : "";
    if (currentStatus === "ZAKOŃCZONO" || currentStatus === "ZAKONCZONO") isFinished = true;
    if (currentStatus === "LIVE") isLive = true;

    // 2. Normalizacja i wyciąganie samej daty (YYYY-MM-DD)
    let matchDateStr = match.dzien || match.date || "";
    if (matchDateStr.includes(" ")) matchDateStr = matchDateStr.split(" ")[0];
    if (matchDateStr.includes("T")) matchDateStr = matchDateStr.split("T")[0];

    // Bezpiecznik: jeśli mecz jest starszy niż dzisiaj -> Zakończony
    if (matchDateStr && matchDateStr < todayStr) {
      isFinished = true;
    }

    // 3. Normalizacja i wyciąganie czasu (HH:MM)
    let timeStr = match.godzina || match.time || "";
    if (!timeStr && match.date && match.date.includes(" ")) {
      timeStr = match.date.split(" ")[1];
    }

    const isToday = match.is_today || (matchDateStr === todayStr);

    // 4. GŁÓWNA LOGIKA CZASOWA (Gwarancja usuwania starych meczów z dzisiaj)
    if (isToday && timeStr && !isFinished) {
      const timeParts = timeStr.split(':').map(Number);
      if (timeParts.length >= 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
        const [matchHour, matchMin] = timeParts;
        const matchTime = new Date(now);
        matchTime.setHours(matchHour, matchMin, 0, 0);
        
        const diffMins = (now.getTime() - matchTime.getTime()) / (1000 * 60);

        if (diffMins > MATCH_DURATION_MINS) {
          isFinished = true; // Minęło 120 minut -> Koniec
        } else if (diffMins >= 0 && diffMins <= MATCH_DURATION_MINS) {
          isLive = true;     // Trwa -> LIVE
        }
      }
    }

    // 🚫 Wyrzucamy zakończone mecze z listy radaru!
    if (isFinished) return;

    // Generowanie unikalnego klucza, żeby uniknąć duplikatów
    const matchName = match.mecz || match.match || match.name || (match.home && match.away ? `${match.home} - ${match.away}` : "Nieznany mecz");
    const displayTime = timeStr ? (timeStr.split(':').slice(0, 2).join(':')) : "";
    const dataCzas = [matchDateStr, displayTime].filter(Boolean).join(' ') || "Brak daty";
    const uniqueKey = `${matchName}-${dataCzas}`;
    
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      match.calculatedIsLive = isLive; 
      match.displayDataCzas = dataCzas;
      uniqueMatches.push(match);
    }
  });
  
  const alerts = [];
  
  uniqueMatches.forEach((match) => {
    if (!match.kursy) return;

    const dyscyplina = match.dyscyplina || match.sport || "Sport";
    const matchName = match.mecz || match.match || match.name || (match.home && match.away ? `${match.home} - ${match.away}` : "Nieznany mecz");

    const allBookies = Object.keys(match.kursy);
    const foreignBookies = allBookies.filter(b => !PL_BOOKIES.includes(b));

    ['1', 'X', '2'].forEach(typ => {
      let maxPlOdd = 0;
      let bestPlBookie = null;

      PL_BOOKIES.forEach(b => {
        const odd = match.kursy[b]?.[typ];
        if (odd && odd > maxPlOdd) {
          maxPlOdd = odd;
          bestPlBookie = b;
        }
      });

      let maxForOdd = 0;
      let bestForBookie = null;

      foreignBookies.forEach(b => {
        const odd = match.kursy[b]?.[typ];
        if (odd && odd > 0 && odd > maxForOdd) { // POPRAWIONE: szuka najwyższego zagranicznego
          maxForOdd = odd;
          bestForBookie = b;
        }
      });

      if (maxPlOdd > 0 && maxForOdd > 0) {
        const diff = maxPlOdd - maxForOdd; 

        if (diff >= MIN_DIFFERENCE) {
          const typName = typ === '1' ? 'Gospodarz (1)' : typ === 'X' ? 'Remis (X)' : 'Gość (2)';
          
          // POPRAWKA: Zmiana minForOdd na maxForOdd
          const yieldPct = ((maxPlOdd / maxForOdd - 1) * 100).toFixed(1); 

          alerts.push({
            // POPRAWKA: Zmiana minForOdd na maxForOdd
            id: `${matchName}-${typ}-${maxPlOdd}-${maxForOdd}`, 
            mecz: matchName,
            dyscyplina: dyscyplina,
            data: match.displayDataCzas || "Brak daty",
            isLive: match.calculatedIsLive, 
            okazja: {
              typZwyciestwa: typName,
              bukMax: bestPlBookie,
              maxKurs: maxPlOdd.toFixed(2),
              // POPRAWKA: Zmiana na zaktualizowane zmienne
              bukMin: bestForBookie, 
              minKurs: maxForOdd.toFixed(2), 
              roznica: diff.toFixed(2),
              yield: yieldPct
            },
            rawMatch: match
          });
        }
      }
    });
  });

  return alerts.sort((a, b) => parseFloat(b.okazja.roznica) - parseFloat(a.okazja.roznica));
};

function Top5({ items, onSelect }) {
  const valueBets = useMemo(() => {
    if (!items || items.length === 0) return [];
    return scanForValueBets(items);
  }, [items]);

  return (
    <div style={{ padding: "10px" }}>
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
        `}
      </style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #333", paddingBottom: "15px", marginBottom: "25px" }}>
        <h3 style={{ margin: 0, color: "#fff", display: "flex", alignItems: "center", fontSize: "1.4em" }}>
          <span className="pulse-dot"></span>
          Znalezione różnice kursów (Δ ≥ {MIN_DIFFERENCE.toFixed(2)})
        </h3>
        <div style={{ backgroundColor: "#1e293b", color: "#60a5fa", padding: "6px 15px", borderRadius: "20px", fontSize: "0.9em", fontWeight: "bold", border: "1px solid #3b82f6" }}>
          Namierzone mecze: {valueBets.length}
        </div>
      </div>

      {valueBets.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", backgroundColor: "#121212", border: "1px dashed #333", borderRadius: "12px" }}>
          <div className="pulse-dot" style={{ margin: "0 auto 20px auto", display: "block", backgroundColor: "#3b82f6" }}></div>
          <h3 style={{ margin: "0 0 10px 0", color: "#fff" }}>Radar w trybie nasłuchu</h3>
          <p style={{ margin: 0, color: "#777" }}>Rynki są ustabilizowane. Oczekuję na błędy polskich bukmacherów (Δ ≥ {MIN_DIFFERENCE.toFixed(2)})...</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px" }}>
          {valueBets.map((match) => {
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

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: "#cbd5e1", fontSize: "0.9em" }}>Wytypowano:</span>
                    <span style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", padding: "4px 10px", borderRadius: "6px", fontSize: "0.85em", fontWeight: "bold", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                      {okazja.typZwyciestwa}
                    </span>
                  </div>
                  <span style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: "bold", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                    Yield {okazja.yield}%
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", backgroundColor: "#0f172a", padding: "12px", borderRadius: "8px" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.65em", color: "#64748b", textTransform: "uppercase" }}>{okazja.bukMin}</span>
                    <span style={{ fontSize: "1.1em", color: "#94a3b8", textDecoration: "line-through" }}>{okazja.minKurs}</span>
                  </div>

                  <div style={{ color: "#334155", paddingBottom: "4px" }}>➔</div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ fontSize: "0.65em", color: "#22c55e", textTransform: "uppercase", fontWeight: "bold" }}> {okazja.bukMax}</span>
                    <span style={{ fontSize: "1.4em", color: "#22c55e", fontWeight: "900", textShadow: "0 0 10px rgba(34, 197, 94, 0.3)" }}>{okazja.maxKurs}</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "0.65em", color: "#aaa", textTransform: "uppercase" }}>EDGE</span>
                    <span style={{ fontSize: "1.2em", color: "#fbbf24", fontWeight: "bold" }}>+{okazja.roznica}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Top5;