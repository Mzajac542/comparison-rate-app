import path from "path";

const ROOT = process.cwd();

export const DATA_DIR = path.join(ROOT, "data");
export const FIXTURES_DIR = path.join(DATA_DIR, "json");
export const ODDS_DIR = path.join(DATA_DIR, "odds_mapped");
export const RESULTS_DIR = path.join(DATA_DIR, "wyniki");

export const ODDS_FILE = path.join(ODDS_DIR, "odds_mapped.json");
export const RESULTS_FILE = path.join(RESULTS_DIR, "results.json");
