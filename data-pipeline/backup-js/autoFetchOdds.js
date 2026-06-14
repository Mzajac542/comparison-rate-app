import fs from "fs";
import { scrapeSTS } from "./scrapeSTS.js";

async function run() {
  console.log("🚀 START");

  const matches = await scrapeSTS();

  console.log("✅ MECZE:", matches.length);
  console.log(matches);

  fs.writeFileSync(
    "./data/odds_full.json",
    JSON.stringify(matches, null, 2)
  );

  console.log("✅ GOTOWE");
}

run();
