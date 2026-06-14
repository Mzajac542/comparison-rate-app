import { scrapeSuperbet } from "./scrapeSuperbet.js";
import fs from "fs";

(async () => {
  console.log("🚀 START SUPERBET");

  const data = await scrapeSuperbet();

  console.log("✅ MECZE:", data.length);
  console.log(data.slice(0, 10));

  fs.writeFileSync(
    "./data/superbet.json",
    JSON.stringify(data, null, 2)
  );

  console.log("✅ ZAPISANO");
})();