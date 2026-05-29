import { scrapeSTS } from "./scrapeSTS.js";
import fs from "fs";

(async () => {
  console.log("🚀 START STS");

  const data = await scrapeSTS();

  console.log("✅ MECZE:", data.length);

  // ✅ pokaż pierwsze 10
  console.log(data.slice(0, 10));

  // ✅ zapis
  fs.writeFileSync(
    "./data/sts.json",
    JSON.stringify(data, null, 2)
  );

  console.log("✅ ZAPISANO");
})();