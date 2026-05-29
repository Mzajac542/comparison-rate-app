export function calculateTop5(matches) {
    if (!matches || matches.length === 0) return [];

    const matchesWithDiff = matches.map(match => {
        let maxDiff = 0;
        let bestOutcome = "";
        let bOdd = "-";
        let sOdd = "-";

        // Funkcja parsująca kurs na liczbę (radzi sobie z polskimi przecinkami)
        const getOdd = (val) => {
            if (!val || val === "-" || val === "N/A") return 0;
            return parseFloat(String(val).replace(',', '.'));
        };

        // Bezpieczna funkcja porównująca dany typ zakładu
        const checkDiff = (label, typeKey) => {
            if (!match.betclic || !match.superbet) return;
            
            const betclicOdd = getOdd(match.betclic[typeKey]);
            const superbetOdd = getOdd(match.superbet[typeKey]);

            // Liczymy różnicę TYLKO gdy oba kursy istnieją
            if (betclicOdd > 0 && superbetOdd > 0) {
                const diff = Math.abs(betclicOdd - superbetOdd);
                
                if (diff > maxDiff) {
                    maxDiff = diff;
                    bestOutcome = label;
                    bOdd = betclicOdd;
                    sOdd = superbetOdd;
                }
            }
        };

        // Sprawdzamy wszystkie 3 główne opcje (Zgodnie z Twoim mapper.js)
        checkDiff("Gospodarz (1)", "home");
        checkDiff("Remis (X)", "draw");
        checkDiff("Gość (2)", "away");

        return { ...match, maxDiff, bestOutcome, bOdd, sOdd };
    });

    // Filtrujemy, zostawiając tylko te mecze, gdzie znaleziono wspólną ofertę
    const validMatches = matchesWithDiff.filter(m => m.maxDiff > 0);

    // Sortujemy od NAJWIĘKSZEJ różnicy kursowej
    validMatches.sort((a, b) => b.maxDiff - a.maxDiff);

    // Zwracamy pierwszą piątkę
    return validMatches.slice(0, 5);
}