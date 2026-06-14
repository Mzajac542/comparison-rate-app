export const calculateTop5 = (matches) => {
  if (!matches || matches.length === 0) return [];
  
  const okazje = [];
  const polishBookies = ["Betclic", "Superbet", "Fortuna", "STS", "LVBET", "BETFAN"];
  const MATCH_DURATION_MINS = 120;
  const now = new Date();
  
  const todayStr = now.getFullYear() + "-" + 
                   String(now.getMonth() + 1).padStart(2, '0') + "-" + 
                   String(now.getDate()).padStart(2, '0');

  matches.forEach(match => {
    let isFinished = false;
    let isLive = match.isLive || false;

    // 1. Sprawdzenie statusu tekstowego
    const currentStatus = match.status ? match.status.toString().trim().toUpperCase() : "";
    if (currentStatus === "ZAKOŃCZONO" || currentStatus === "ZAKONCZONO") isFinished = true;
    if (currentStatus === "LIVE") isLive = true;

    // 2. Normalizacja daty
    let matchDateStr = match.dzien || match.date || "";
    if (matchDateStr.includes(" ")) matchDateStr = matchDateStr.split(" ")[0];
    if (matchDateStr.includes("T")) matchDateStr = matchDateStr.split("T")[0];

    if (matchDateStr && matchDateStr < todayStr) {
      isFinished = true;
    }

    // 3. Normalizacja czasu
    let timeStr = match.godzina || match.time || "";
    if (!timeStr && match.date && match.date.includes(" ")) {
      timeStr = match.date.split(" ")[1];
    }

    const isToday = match.is_today || (matchDateStr === todayStr);

    // 4. Analiza minutowa meczu
    if (isToday && timeStr && !isFinished) {
      const timeParts = timeStr.split(':').map(Number);
      if (timeParts.length >= 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
        const [matchHour, matchMin] = timeParts;
        const matchTime = new Date(now);
        matchTime.setHours(matchHour, matchMin, 0, 0);
        
        const diffMins = (now.getTime() - matchTime.getTime()) / (1000 * 60);

        if (diffMins > MATCH_DURATION_MINS) {
          isFinished = true;
        } else if (diffMins >= 0 && diffMins <= MATCH_DURATION_MINS) {
          isLive = true;
        }
      }
    }

    // 🚫 Filtrujemy zakończone mecze
    if (isFinished) return;

    const kursyObj = match.kursy || {};
    const bookieNames = Object.keys(kursyObj);

    const hasPolish = bookieNames.some(b => polishBookies.includes(b));
    const hasForeign = bookieNames.some(b => !polishBookies.includes(b));
    
    if (!hasPolish || !hasForeign) return;

    ['1', 'X', '2'].forEach(typ => {
     let maxPL = 0;
      let bukMaxPL = "";
      let maxZAGR = 0; // POPRAWIONE NA MAX
      let bukMaxZAGR = "";

      bookieNames.forEach(buk => {
        const val = kursyObj[buk] ? kursyObj[buk][typ] : null;
        if (val !== null && val !== undefined && val !== "-") {
          const wartosc = parseFloat(val);
          if (!isNaN(wartosc) && wartosc > 0) {
            if (polishBookies.includes(buk)) {
              if (wartosc > maxPL) { maxPL = wartosc; bukMaxPL = buk; }
            } else {
              if (wartosc > maxZAGR) { maxZAGR = wartosc; bukMaxZAGR = buk; } // ZMIENIONE NA WARTOSC > MAX
            }
          }
        }
      });

      const roznica = maxPL - maxZAGR; 
      
      if (maxPL > 0 && maxZAGR > 0 && roznica >= 0.50) {
        okazje.push({
          ...match, 
          isLive: isLive, 
          // POPRAWKA: Zmiana minZAGR na maxZAGR
          key: `${match.mecz || match.name}-${matchDateStr}-${typ}-${maxPL}-${maxZAGR}`, 
          okazja: {
            typZwyciestwa: typ === '1' ? 'Gospodarz (1)' : typ === 'X' ? 'Remis (X)' : 'Gość (2)',
            roznica: roznica.toFixed(2),
            maxKurs: maxPL.toFixed(2),
            bukMax: bukMaxPL,
            // POPRAWKA: Zmiana na zaktualizowane zmienne zagraniczne
            minKurs: maxZAGR.toFixed(2), 
            bukMin: bukMaxZAGR, 
            typID: typ
          }
        });
      }
    });
  });

  return okazje.sort((a, b) => parseFloat(b.okazja.roznica) - parseFloat(a.okazja.roznica));
};