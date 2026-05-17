import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ===== ESM __dirname =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== EXPORT =====
export function loadAllFixtures() {
  const folderPath = path.join(__dirname, "../data/JSON");

  const files = fs
    .readdirSync(folderPath)
    .filter(file => file.startsWith("fixtures_") && file.endsWith(".json"));

  let allFixtures = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const fixtures = JSON.parse(content);
    allFixtures.push(...fixtures);
  }

  return allFixtures;
}


// ===== ODDS MAPPED =====
export function loadOddsMapped() {
  const filePath = path.join(
    __dirname,
    "../data/odds_mapped/odds_mapped.json"
  );

  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}
