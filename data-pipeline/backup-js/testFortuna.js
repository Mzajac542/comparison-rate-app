import { scrapeFortuna } from "./scrapeFortuna.js";

(async () => {
  console.log("🚀 START FORTUNA");

  const data = await scrapeFortuna();

  console.log("✅ MECZE:", data.length);

  // pokaż kilka
  console.log(data.slice(0, 10));
})();
