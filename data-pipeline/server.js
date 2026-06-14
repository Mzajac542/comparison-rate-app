import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec, spawn } from "child_process";
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import session from 'express-session';
import SqliteStore from 'connect-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.resolve(__dirname, "../data/wszystkie_mecze_laczni.json");
const DB_PATH = path.resolve(__dirname, "../data/users.db");
const SESSION_DB_PATH = path.resolve(__dirname, "../data/sessions.db");

// ==========================================
// BAZA DANYCH I SESJE
// ==========================================
const db = new Database(DB_PATH);
const SessionStore = SqliteStore(session);

if (!fs.existsSync(path.resolve(__dirname, "../data"))) {
    fs.mkdirSync(path.resolve(__dirname, "../data"));
}

db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user'
)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER,
    match_name TEXT,
    UNIQUE(user_id, match_name)
  )
`);

const app = express();
app.use(cors({
    origin: 'http://localhost:5173', 
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.resolve(__dirname, 'public')));

app.use(session({
    store: new SessionStore({ 
        db: 'sessions.db', 
        dir: path.resolve(__dirname, '../data') 
    }),
    secret: 'qwerty1357@', 
    resave: false,
    saveUninitialized: false,
    cookie: { 
        httpOnly: true,
        secure: false, 
        sameSite: 'lax' 
    }
}));

// ==========================================
// FUNKCJE POMOCNICZE
// ==========================================
const cleanDeadFavorites = () => {
    try {
        if (!fs.existsSync(DATA_PATH)) return;
        const matchesData = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
        const validMatchNames = matchesData.map(m => m.mecz);
        const allFavorites = db.prepare('SELECT DISTINCT match_name FROM favorites').all();
        
        let deletedCount = 0;
        const deleteStmt = db.prepare('DELETE FROM favorites WHERE match_name = ?');

        for (const fav of allFavorites) {
            if (!validMatchNames.includes(fav.match_name)) {
                const info = deleteStmt.run(fav.match_name);
                deletedCount += info.changes; 
            }
        }
        if (deletedCount > 0) console.log(`🧹 [CLEANUP] Usunięto ${deletedCount} wpisów z ulubionych.`);
    } catch (error) {
        console.error("❌ [CLEANUP] Błąd:", error);
    }
};

// ==========================================
// URUCHAMIACZ SKRAPERÓW
// ==========================================
let isScraping = false; 

const runScraper = async () => {
    if (isScraping) return; 
    isScraping = true;

    const runScript = (command, args) => {
        return new Promise((resolve) => {
            const process = spawn(command, args, { cwd: __dirname });

            process.stdout.on('data', (data) => {
                console.log(`${data.toString().trim()}`);
            });

            process.stderr.on('data', (data) => {
                console.log(`[INFO/ERROR]: ${data.toString().trim()}`);
            });

            process.on('close', (code) => {
                if (code !== 0) {
                    console.log(`⚠️ Skrypt zakończony kodem ${code}, ale kontynuuję pracę...`);
                }
                resolve();
            });

            process.on('error', (err) => {
                console.log(`❌ Błąd wywołania skryptu: ${err.message}. Kontynuuję...`);
                resolve();
            });
        });
    }
    try {
        console.log("🔄 [FAZA 1] Zbieranie danych z Polskich buków...");
        const polishScrapers = [
            ["py", ["-3.13", "scrappers/betclic.py"]],
            ["py", ["-3.13", "scrappers/fortuna.py"]],
            ["py", ["-3.13", "scrappers/superbet.py"]],
            ["py", ["-3.13", "scrappers/sts_betfan_lvbet.py"]]
        ];

        for (const [cmd, args] of polishScrapers) {
            await runScript(cmd, args);
        }

        // USUNIĘTO BLOKADĘ Z CZEKANIEM NA ENTER!
        
        console.log("🔄 [FAZA 2] Zbieranie danych zagranicznych (z auto-VPN)...");
        await runScript("py", ["-3.13", "scrappers/zagraniczni.py"]);
        
        console.log("🔄 [FAZA 3] Łączenie wszystkiego (compare_odds.py)...");
        await runScript("py", ["-3.13", "scrappers/compare_odds.py"]);

        console.log("✅ [FINISH] Dane zaktualizowane!");
        cleanDeadFavorites(); 
    } catch (error) {
        console.error("❌ Błąd krytyczny:", error);
    } finally {
        isScraping = false;
    }
};

// ==========================================
// HARMONOGRAM 00:01
// ==========================================
const scheduleDailyScrape = () => {
    const now = new Date();
    const target = new Date();
    target.setDate(now.getDate() + 1);
    target.setHours(0, 1, 0, 0); 
    
    const delay = target.getTime() - now.getTime();
    console.log(`⏰ [SCHEDULER] Następne pobieranie zaplanowane na: ${target.toLocaleString()}`);
    
    setTimeout(async () => {
        await runScraper();
        scheduleDailyScrape();
    }, delay);
};

scheduleDailyScrape();

// ==========================================
// API
// ==========================================
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).json({ error: "Brak uprawnień" });
};

app.post('/api/login', async (req, res) => {
    const { username, password, rememberMe } = req.body; 
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(400).json({ error: 'Nieprawidłowy login lub hasło' });
    }
    
    req.session.user = { id: user.id, username: user.username, role: user.role };
    
    // POPRAWKA: Używamy null zamiast false
    if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; 
    } else {
        req.session.cookie.maxAge = null; // Ciasteczko wygasa z końcem sesji przeglądarki
    }
    
    req.session.save(() => res.json({ message: 'Zalogowano', role: user.role }));
});

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'user'); 
        res.json({ message: "Konto utworzone" });
    } catch (e) { res.status(500).json({ error: "Błąd serwera" }); }
});

app.get('/api/me', (req, res) => res.json(req.session.user ? { loggedIn: true, user: req.session.user } : { loggedIn: false }));
app.post('/api/logout', (req, res) => { req.session.destroy(); res.clearCookie('connect.sid'); res.json({ message: "Wylogowano" }); });

app.get('/api/admin/users', isAdmin, (req, res) => res.json(db.prepare('SELECT id, username, role FROM users').all()));

app.get('/api/favorites', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Brak autoryzacji" });
    res.json(db.prepare('SELECT match_name FROM favorites WHERE user_id = ?').all(req.session.user.id).map(r => r.match_name));
});

app.post('/api/favorites', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Brak autoryzacji" });
    try { db.prepare('INSERT INTO favorites (user_id, match_name) VALUES (?, ?)').run(req.session.user.id, req.body.match_name); res.json({ success: true }); }
    catch (e) { res.status(400).json({ error: "Już w ulubionych" }); }
});

app.delete('/api/favorites/:matchName', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Brak autoryzacji" });
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND match_name = ?').run(req.session.user.id, req.params.matchName);
    res.json({ success: true });
});

app.get("/api/matches", (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"))); } 
  catch (err) { res.status(500).json({ error: "Błąd" }); }
});

app.post("/api/run-scraper", isAdmin, (req, res) => {
    runScraper();
    res.json({ message: "Uruchomiono scraper." });
});

app.listen(3001, () => console.log("🚀 Backend działa na http://localhost:3001"));