import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import session from 'express-session';
import SqliteStore from 'connect-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ścieżki - teraz są odporne na to, skąd uruchamiasz serwer
const DATA_PATH = path.resolve(__dirname, "../data/wszystkie_mecze_laczni.json");
const DB_PATH = path.resolve(__dirname, "../data/users.db");
const SESSION_DB_PATH = path.resolve(__dirname, "../data/sessions.db");

// ==========================================
// BAZA DANYCH I SESJE
// ==========================================
const db = new Database(DB_PATH);
const SessionStore = SqliteStore(session);

// Upewnij się, że folder data istnieje (poza data-pipeline)
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
    origin: 'http://localhost:5173', // Port Twojego Reacta (zmień jeśli masz inny)
    credentials: true
}));
app.use(express.json());
// Serwowanie plików z folderu 'public' który MUSI być w data-pipeline
app.use(express.static(path.resolve(__dirname, 'public')));

app.use(session({
    store: new SessionStore({ 
        db: 'sessions.db', 
        dir: path.resolve(__dirname, '../data') 
    }),
    secret: 'qwerty1357@', // ZMIEŃ TO NA WŁASNE HASŁO
    resave: false,
    saveUninitialized: false,
    cookie: { 
        httpOnly: true,
        secure: false, // false, bo pracujemy na localhost (bez HTTPS)
        sameSite: 'lax' // ✅ KLUCZOWE: Pozwala Reactowi używać ciasteczka!
    }
}));

// ==========================================
// FUNKCJE POMOCNICZE
// ==========================================
const shouldUpdate = () => {
  if (!fs.existsSync(DATA_PATH)) return true;
  const stats = fs.statSync(DATA_PATH);
  const now = new Date().getTime();
  const fileTime = stats.mtime.getTime();
  return (now - fileTime) > (24 * 60 * 60 * 1000);
};

// --- NOWA FUNKCJA: INTELIGENTNE CZYSZCZENIE ULUBIONYCH ---
// --- NOWA FUNKCJA: INTELIGENTNE CZYSZCZENIE ULUBIONYCH (POPRAWIONA) ---
const cleanDeadFavorites = () => {
    try {
        // 1. Upewniamy się, że mamy nowy plik z meczami
        if (!fs.existsSync(DATA_PATH)) return;
        
        // 2. Czytamy aktualne mecze z pliku
        const matchesData = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
        
        // 3. Wyciągamy same nazwy aktualnych meczów
        const validMatchNames = matchesData.map(m => m.mecz);

        // 4. Pobieramy unikalne nazwy z bazy (bez kolumny 'id'!)
        const allFavorites = db.prepare('SELECT DISTINCT match_name FROM favorites').all();

        // 5. Szukamy "martwych dusz" i je usuwamy
        let deletedCount = 0;
        const deleteStmt = db.prepare('DELETE FROM favorites WHERE match_name = ?');

        for (const fav of allFavorites) {
            // Jeśli nazwa z bazy NIE ZNAJDUJE SIĘ na nowej liście meczów -> usuwamy
            if (!validMatchNames.includes(fav.match_name)) {
                const info = deleteStmt.run(fav.match_name);
                deletedCount += info.changes; // info.changes mówi nam, z ilu kont usunięto ten mecz
            }
        }

        if (deletedCount > 0) {
            console.log(`🧹 [CLEANUP] Usunięto ${deletedCount} nieaktualnych wpisów z bazy ulubionych.`);
        }
    } catch (error) {
        console.error("❌ [CLEANUP] Błąd podczas czyszczenia ulubionych:", error);
    }
};

const runScraper = () => {
  console.log("🔄 [SCRAPER] Uruchamianie procesu...");
  
  exec(
    "py -3.13 scrappers/betclic.py && py -3.13 scrappers/superbet.py && py -3.13 scrappers/compare_odds.py", 
    { 
        cwd: __dirname, // Tu jest ta ważna ścieżka z poprzednich kroków!
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' } 
    },
    (error, stdout, stderr) => {
      if (error) {
          console.error(`❌ [SCRAPER] Błąd: ${error.message}`);
      } else {
          console.log("✅ [SCRAPER] Dane zaktualizowane.");
          // --- DODAJEMY WYWOŁANIE CZYSZCZENIA PO SUKCESIE SCRAPERA ---
          cleanDeadFavorites(); 
      }
    }
  );
};

// ==========================================
// MIDDLEWARE ZABEZPIECZAJĄCY
// ==========================================
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "Brak uprawnień admina" });
    }
};

// ==========================================
// API
// ==========================================

// --- LOGOWANIE ---
app.post('/api/login', async (req, res) => {
    const { username, password, rememberMe } = req.body; 

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
        return res.status(400).json({ error: 'Nieprawidłowy login lub hasło' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        return res.status(400).json({ error: 'Nieprawidłowy login lub hasło' });
    }

    // Zapisanie danych w sesji
    req.session.user = { id: user.id, username: user.username, role: user.role };

    // ✅ MAGIA "NIE WYLOGOWUJ MNIE"
    if (rememberMe) {
        // Przedłużamy ciasteczko o 30 dni (w milisekundach)
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    }

    // ✅ NAJWAŻNIEJSZE: Wymuszamy zapisanie nowego czasu życia sesji do bazy
    req.session.save((err) => {
        if (err) {
            console.error("Błąd zapisu sesji:", err);
            return res.status(500).json({ error: "Błąd serwera przy logowaniu" });
        }
        // Wysyłamy odpowiedź do przeglądarki dopiero, gdy mamy pewność, że sesja się zapisała
        res.json({ message: 'Zalogowano pomyślnie!', role: user.role });
    });
});

// Rejestracja
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: "Podaj login i hasło." });
    }

    try {
        // Hashujemy hasło dla bezpieczeństwa
        const hash = await bcrypt.hash(password, 10);
        
        // Wstawiamy użytkownika do bazy z domyślną rolą 'user'
        const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        stmt.run(username, hash, 'user'); 
        
        res.json({ message: "Konto utworzone pomyślnie! Możesz się teraz zalogować." });
    } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ error: "Użytkownik o takiej nazwie już istnieje." });
        } else {
            res.status(500).json({ error: "Błąd serwera." });
        }
    }
});

// Pobieranie danych zalogowanego użytkownika
app.get('/api/me', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// Wylogowanie
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.clearCookie('connect.sid'); // Usuwa ciasteczko z przeglądarki
    res.json({ message: "Wylogowano" });
});

// Zmiana hasła
app.post('/api/change-password', async (req, res) => {
    // Sprawdzamy, czy ktoś w ogóle jest zalogowany
    if (!req.session.user) {
        return res.status(401).json({ error: "Brak autoryzacji" });
    }

    const { oldPassword, newPassword } = req.body;
    const userId = req.session.user.id;

    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        
        // Sprawdzamy, czy stare hasło się zgadza
        const match = await bcrypt.compare(oldPassword, user.password_hash);
        if (!match) {
            return res.status(400).json({ error: "Stare hasło jest nieprawidłowe." });
        }

        // Hashujemy i zapisujemy nowe hasło
        const newHash = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);

        res.json({ message: "Hasło zostało pomyślnie zmienione!" });
    } catch (err) {
        res.status(500).json({ error: "Błąd serwera." });
    }
});

// ==========================================
// API ZARZĄDZANIA UŻYTKOWNIKAMI (TYLKO DLA ADMINA)
// ==========================================

// Pobieranie listy wszystkich użytkowników
app.get('/api/admin/users', isAdmin, (req, res) => {
    try {
        // Zwracamy id, login i rolę (NIGDY hasła!)
        const users = db.prepare('SELECT id, username, role FROM users').all();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Błąd pobierania użytkowników" });
    }
});

// Zmiana roli użytkownika
app.put('/api/admin/users/:id/role', isAdmin, (req, res) => {
    const userId = req.params.id;
    const { role } = req.body; // 'admin' lub 'user'

    // Zabezpieczenie: nie możesz odebrać sobie samemu admina
    if (userId == req.session.user.id) {
        return res.status(400).json({ error: "Nie możesz zmienić własnej roli!" });
    }

    try {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
        res.json({ message: `Zmieniono rolę na: ${role.toUpperCase()}` });
    } catch (err) {
        res.status(500).json({ error: "Błąd podczas zmiany roli" });
    }
});

// Usuwanie użytkownika
app.delete('/api/admin/users/:id', isAdmin, (req, res) => {
    const userId = req.params.id;

    // Zabezpieczenie: nie możesz usunąć samego siebie
    if (userId == req.session.user.id) {
        return res.status(400).json({ error: "Nie możesz usunąć własnego konta!" });
    }

    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        res.json({ message: "Użytkownik został usunięty" });
    } catch (err) {
        res.status(500).json({ error: "Błąd podczas usuwania konta" });
    }
});

// --- API ULUBIONYCH MECZÓW ---

// 1. Pobierz ulubione zalogowanego użytkownika
app.get('/api/favorites', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Brak autoryzacji" });
    const rows = db.prepare('SELECT match_name FROM favorites WHERE user_id = ?').all(req.session.user.id);
    res.json(rows.map(r => r.match_name));
});

// 2. Dodaj do ulubionych
app.post('/api/favorites', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Brak autoryzacji" });
    try {
        db.prepare('INSERT INTO favorites (user_id, match_name) VALUES (?, ?)').run(req.session.user.id, req.body.match_name);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: "Mecz jest już w ulubionych" }); // Łapiemy błąd z UNIQUE
    }
});

// 3. Usuń z ulubionych
app.delete('/api/favorites/:matchName', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Brak autoryzacji" });
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND match_name = ?').run(req.session.user.id, req.params.matchName);
    res.json({ success: true });
});

// Pobieranie meczów
app.get("/api/matches", (req, res) => {
  try {
    if (!fs.existsSync(DATA_PATH)) return res.status(404).json({ error: "No data" });
    res.json(JSON.parse(fs.readFileSync(DATA_PATH, "utf-8")));
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Zabezpieczone ręczne uruchomienie
app.post("/api/run-scraper", isAdmin, (req, res) => {
    console.log("⚡ [API] Admin uruchamia scraper...");
    runScraper();
    res.json({ message: "Scraper uruchomiony w tle." });
});

// ==========================================
// AUTOMATYZACJA
// ==========================================
setInterval(() => {
  if (shouldUpdate()) runScraper();
}, 60 * 60 * 1000);

if (shouldUpdate()) runScraper();

app.listen(3001, () => {
  console.log("🚀 Backend działa na http://localhost:3001");
});