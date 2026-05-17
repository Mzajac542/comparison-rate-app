import fs from "fs";
import { config } from "./config.js";
import { getOdds } from "./fetchOdds.js";
import { RESULTS_FILE } from "../paths.js"; // ✅ POPRAWNA ŚCIEŻKA

const data = getOdds();
const results = [];
const outcomes = ["home", "away"];

for (const match of data) {
  const h2h = match.markets.h2h;

  for (const outcome of outcomes) {
    const prices = [];

    for (const bookmaker in h2h) {
      const price = h2h[bookmaker][outcome];
      if (typeof price === "number") {
        prices.push({ bookmaker, price });
      }
    }

    if (prices.length < 2) continue;

    prices.sort((a, b) => b.price - a.price);
    const diff = prices[0].price - prices.at(-1).price;

    if (diff >= config.minOddsDifference) {
      results.push({
        match: `${match.home} vs ${match.away}`,
        outcome,
        bestBookmaker: prices[0].bookmaker,
        bestPrice: prices[0].price,
        worstBookmaker: prices.at(-1).bookmaker,
        worstPrice: prices.at(-1).price,
        difference: Number(diff.toFixed(2))
      });
    }
  }
}

// ✅ UŻYWASZ RESULTS_FILE
fs.writeFileSync(
  RESULTS_FILE,
  JSON.stringify(results, null, 2)
);

console.log("✅ Analiza zakończona:", results.length);