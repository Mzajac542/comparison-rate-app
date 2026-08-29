import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import session from 'express-session';
import SqliteStore from 'connect-sqlite3';
import crypto from "crypto";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.join(
    __dirname,
    ".env"
);

const envResult = dotenv.config({
    path: ENV_PATH
});

if (envResult.error) {
    console.error(
        "❌ Nie udało się wczytać pliku .env:",
        ENV_PATH,
        envResult.error.message
    );
} else {
    console.log(
        "✅ Wczytano konfigurację .env:",
        ENV_PATH
    );
}

console.log("📧 Status konfiguracji SMTP:", {
    SMTP_HOST:
        Boolean(
            process.env.SMTP_HOST?.trim()
        ),

    SMTP_PORT:
        process.env.SMTP_PORT || "BRAK",

    SMTP_SECURE:
        process.env.SMTP_SECURE || "BRAK",

    SMTP_USER:
        Boolean(
            process.env.SMTP_USER?.trim()
        ),

    SMTP_PASSWORD:
        Boolean(
            process.env.SMTP_PASSWORD?.trim()
        ),

    MAIL_FROM_ADDRESS:
        Boolean(
            process.env.MAIL_FROM_ADDRESS?.trim()
        ),

    APP_URL:
        process.env.APP_URL || "BRAK"
});

/*
 * server.js znajduje się bezpośrednio
 * w katalogu data-pipeline.
 */
const PIPELINE_DIR = __dirname;

/*
 * Główny katalog projektu znajduje się
 * jeden poziom nad data-pipeline.
 */
const PROJECT_DIR = path.resolve(
    PIPELINE_DIR,
    ".."
);

/*
 * Pliki JSON i bazy danych znajdują się
 * w katalogu projekt/data.
 */
const DATA_DIR = path.join(
    PROJECT_DIR,
    "data"
);

/*
 * Scrapery znajdują się w:
 * projekt/data-pipeline/scrappers.
 */
const SCRAPERS_DIR = path.join(
    PIPELINE_DIR,
    "scrappers"
);

/*
 * Katalog data musi istnieć przed
 * utworzeniem bazy SQLite.
 */
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
        recursive: true
    });
}

const DATA_PATH = path.join(
    DATA_DIR,
    "wszystkie_mecze_laczni.json"
);

const DB_PATH = path.join(
    DATA_DIR,
    "users.db"
);

const SESSION_DB_PATH = path.join(
    DATA_DIR,
    "sessions.db"
);

const POLSCY_SCRIPT = path.join(
    SCRAPERS_DIR,
    "polscy.py"
);

const ZAGRANICZNI_SCRIPT = path.join(
    SCRAPERS_DIR,
    "zagraniczni.py"
);

const COMPARE_SCRIPT = path.join(
    SCRAPERS_DIR,
    "compare_odds.py"
);

const APP_URL =
    process.env.APP_URL ||
    "http://localhost:3001";

const PASSWORD_RESET_TOKEN_LIFETIME_MINUTES =
    30;

const PASSWORD_RESET_REQUEST_COOLDOWN_MINUTES =
    2;

const PASSWORD_RESET_GENERIC_MESSAGE =
    "Jeżeli konto z podanym adresem istnieje, wysłaliśmy wiadomość z instrukcją zmiany hasła.";

// ==========================================
// BAZA DANYCH I SESJE
// ==========================================
const db = new Database(DB_PATH);
const SessionStore = SqliteStore(session);

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

db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        completed_by INTEGER
    )
`);

const usersColumns = db
    .prepare(
        "PRAGMA table_info(users)"
    )
    .all()
    .map((column) => column.name);

if (!usersColumns.includes("email")) {
    db.exec(
        "ALTER TABLE users ADD COLUMN email TEXT"
    );
}

if (!usersColumns.includes("email_verified")) {
    db.exec(
        `
        ALTER TABLE users
        ADD COLUMN email_verified INTEGER
        NOT NULL DEFAULT 0
        `
    );
}

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    idx_users_email_unique
    ON users(LOWER(email))
    WHERE email IS NOT NULL
`);

const app = express();

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true
    })
);


app.use(express.json());

app.use(
    express.static(
        path.resolve(
            __dirname,
            "public"
        )
    )
);

app.use(
    session({
        store: new SessionStore({
            db: path.basename(SESSION_DB_PATH),
            dir: DATA_DIR
        }),
        secret:
            process.env.SESSION_SECRET ||
            "qwerty1357@",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false,
            sameSite: "lax"
        }
    })
);

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
// URUCHAMIACZ SCRAPERÓW
// ==========================================
let isScraping = false;

const getPythonCommand = () => {
    if (process.platform === "win32") {
        return {
            command: "py",
            prefixArgs: ["-3.13"]
        };
    }

    return {
        command: "python3",
        prefixArgs: []
    };
};

const runPythonScript = (
    scriptPath,
    scriptName
) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(scriptPath)) {
            reject(
                new Error(
                    `Nie znaleziono skryptu ${scriptName}: ${scriptPath}`
                )
            );
            return;
        }

        const python = getPythonCommand();

        console.log(
            `▶️ [START] ${scriptName}`
        );

        console.log(
            `   Skrypt: ${scriptPath}`
        );

        const child = spawn(
            python.command,
            [
                ...python.prefixArgs,
                scriptPath
            ],
            {
                cwd: PIPELINE_DIR,
                windowsHide: false,
                stdio: [
                    "ignore",
                    "pipe",
                    "pipe"
                ],
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: "1",
                    PYTHONIOENCODING: "utf-8"
                }
            }
        );

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", (data) => {
            const text = data.trimEnd();

            if (text) {
                console.log(text);
            }
        });

        child.stderr.on("data", (data) => {
            const text = data.trimEnd();

            if (text) {
                console.error(
                    `[${scriptName}] ${text}`
                );
            }
        });

        child.on("error", (error) => {
            reject(
                new Error(
                    `Nie udało się uruchomić ${scriptName}: ${error.message}`
                )
            );
        });

        child.on("close", (code, signal) => {
            if (code === 0) {
                console.log(
                    `✅ [OK] ${scriptName}`
                );

                resolve();
                return;
            }

            const signalInfo = signal
                ? `, sygnał: ${signal}`
                : "";

            reject(
                new Error(
                    `${scriptName} zakończył się kodem ${code}${signalInfo}`
                )
            );
        });
    });
};

const validateMergedData = () => {
    if (!fs.existsSync(DATA_PATH)) {
        throw new Error(
            `Skrypt łączący nie utworzył pliku: ${DATA_PATH}`
        );
    }

    const rawData = fs.readFileSync(
        DATA_PATH,
        "utf8"
    );

    const parsedData = JSON.parse(rawData);

    if (!Array.isArray(parsedData)) {
        throw new Error(
            "Połączony plik JSON nie zawiera tablicy meczów."
        );
    }

    console.log(
        `📦 [DATA] Połączony plik zawiera ${parsedData.length} meczów.`
    );

    return parsedData;
};

const runScraper = async () => {
    if (isScraping) {
        console.log(
            "⚠️ [SCRAPER] Proces już trwa. Pomijam kolejne uruchomienie."
        );

        return {
            started: false,
            reason: "already-running"
        };
    }

    isScraping = true;

    const startedAt = Date.now();

    try {
        console.log("");
        console.log(
            "=================================================="
        );
        console.log(
            "🔄 [PIPELINE] Rozpoczynam aktualizację danych"
        );
        console.log(
            `🕒 ${new Date().toLocaleString("pl-PL")}`
        );
        console.log(
            "=================================================="
        );

        console.log("");
        console.log(
            "🇵🇱 [FAZA 1/3] Pobieranie polskich bukmacherów"
        );

        await runPythonScript(
            POLSCY_SCRIPT,
            "polscy.py"
        );

        console.log("");
        console.log(
            "🌍 [FAZA 2/3] Pobieranie zagranicznych bukmacherów"
        );

        await runPythonScript(
            ZAGRANICZNI_SCRIPT,
            "zagraniczni.py"
        );

        console.log("");
        console.log(
            "🔗 [FAZA 3/3] Łączenie wyników"
        );

        await runPythonScript(
            COMPARE_SCRIPT,
            "compare_odds.py"
        );

        const mergedMatches =
            validateMergedData();

        cleanDeadFavorites();

        const durationSeconds = (
            (Date.now() - startedAt) /
            1000
        ).toFixed(1);

        console.log("");
        console.log(
            "✅ [PIPELINE] Aktualizacja zakończona"
        );

        console.log(
            `📊 Mecze: ${mergedMatches.length}`
        );

        console.log(
            `⏱️ Czas: ${durationSeconds} s`
        );

        console.log(
            "=================================================="
        );
        console.log("");

        return {
            started: true,
            success: true,
            matches: mergedMatches.length,
            durationSeconds:
                Number(durationSeconds)
        };
    } catch (error) {
        console.error("");
        console.error(
            "❌ [PIPELINE] Aktualizacja nie powiodła się:"
        );

        console.error(error);

        console.error(
            "⚠️ Poprzedni poprawny plik JSON nie został celowo usunięty."
        );

        console.error("");

        return {
            started: true,
            success: false,
            error: error.message
        };
    } finally {
        isScraping = false;
    }
};

// ==========================================
// HARMONOGRAM 00:01
// ==========================================
let schedulerTimeout = null;

const getNextScrapeDate = () => {
    const now = new Date();
    const target = new Date(now);

    target.setHours(
        0,
        1,
        0,
        0
    );

    if (target <= now) {
        target.setDate(
            target.getDate() + 1
        );
    }

    return target;
};

const scheduleDailyScrape = () => {
    const now = new Date();
    const target = getNextScrapeDate();
    const delay =
        target.getTime() -
        now.getTime();

    console.log(
        `⏰ [SCHEDULER] Następne pobieranie: ${target.toLocaleString(
            "pl-PL"
        )}`
    );

    if (schedulerTimeout) {
        clearTimeout(
            schedulerTimeout
        );
    }

    schedulerTimeout = setTimeout(
        async () => {
            try {
                await runScraper();
            } finally {
                scheduleDailyScrape();
            }
        },
        delay
    );
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
    
    req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email || "",
        role: user.role
    };
    
    // POPRAWKA: Używamy null zamiast false
    if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; 
    } else {
        req.session.cookie.maxAge = null; // Ciasteczko wygasa z końcem sesji przeglądarki
    }
    
    req.session.save(() => res.json({ message: 'Zalogowano', role: user.role }));
});

app.post(
    "/api/register",
    async (req, res) => {
        try {
            const username = String(
                req.body?.username || ""
            ).trim();

            const email = normalizeEmail(
                req.body?.email
            );

            const password = String(
                req.body?.password || ""
            );

            if (username.length < 3) {
                return res.status(400).json({
                    error:
                        "Login musi mieć co najmniej 3 znaki."
                });
            }

            if (username.length > 40) {
                return res.status(400).json({
                    error:
                        "Login może mieć maksymalnie 40 znaków."
                });
            }

            if (
                !/^[a-zA-Z0-9_.-]+$/.test(
                    username
                )
            ) {
                return res.status(400).json({
                    error:
                        "Login może zawierać tylko litery, cyfry, kropkę, myślnik i znak podkreślenia."
                });
            }

            if (!isValidEmail(email)) {
                return res.status(400).json({
                    error:
                        "Wpisz prawidłowy adres e-mail."
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    error:
                        "Hasło musi mieć co najmniej 6 znaków."
                });
            }

            if (password.length > 100) {
                return res.status(400).json({
                    error:
                        "Hasło może mieć maksymalnie 100 znaków."
                });
            }

            const existingUser = db
                .prepare(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(username) = LOWER(?)
                    `
                )
                .get(username);

            if (existingUser) {
                return res.status(409).json({
                    error:
                        "Konto o takim loginie już istnieje."
                });
            }

            const existingEmail = db
                .prepare(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(email) = LOWER(?)
                    `
                )
                .get(email);

            if (existingEmail) {
                return res.status(409).json({
                    error:
                        "Ten adres e-mail jest już przypisany do innego konta."
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    password,
                    10
                );

            db.prepare(
                `
                INSERT INTO users (
                    username,
                    email,
                    email_verified,
                    password_hash,
                    role
                )
                VALUES (?, ?, 1, ?, 'user')
                `
            ).run(
                username,
                email,
                passwordHash
            );

            return res.status(201).json({
                success: true,
                message:
                    "Konto zostało utworzone. Możesz się teraz zalogować."
            });

        } catch (error) {
            console.error(
                "Błąd rejestracji:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się utworzyć konta."
            });
        }
    }
);

app.post(
    "/api/password-reset/complete",
    async (req, res) => {
        try {
            const rawToken = String(
                req.body?.token || ""
            ).trim();

            const newPassword = String(
                req.body?.newPassword || ""
            );

            const confirmPassword = String(
                req.body?.confirmPassword || ""
            );

            if (!rawToken) {
                return res.status(400).json({
                    error:
                        "Brak tokenu zmiany hasła."
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    error:
                        "Nowe hasło musi mieć co najmniej 6 znaków."
                });
            }

            if (newPassword.length > 100) {
                return res.status(400).json({
                    error:
                        "Nowe hasło może mieć maksymalnie 100 znaków."
                });
            }

            if (
                newPassword !==
                confirmPassword
            ) {
                return res.status(400).json({
                    error:
                        "Podane hasła nie są identyczne."
                });
            }

            const tokenHash =
                hashResetToken(rawToken);

            const tokenRecord = db
                .prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        expires_at,
                        used_at
                    FROM password_reset_tokens
                    WHERE token_hash = ?
                    `
                )
                .get(tokenHash);

            if (
                !tokenRecord ||
                tokenRecord.used_at
            ) {
                return res.status(400).json({
                    error:
                        "Link jest nieprawidłowy albo został już wykorzystany."
                });
            }

            if (
                new Date(
                    tokenRecord.expires_at
                ).getTime() <= Date.now()
            ) {
                return res.status(400).json({
                    error:
                        "Link do zmiany hasła wygasł."
                });
            }

            const user = db
                .prepare(
                    `
                    SELECT
                        id,
                        password_hash
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(tokenRecord.user_id);

            if (!user) {
                return res.status(404).json({
                    error:
                        "Konto użytkownika nie istnieje."
                });
            }

            const samePassword =
                await bcrypt.compare(
                    newPassword,
                    user.password_hash
                );

            if (samePassword) {
                return res.status(400).json({
                    error:
                        "Nowe hasło musi różnić się od obecnego."
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    10
                );

            const usedAt =
                new Date().toISOString();

            const completeReset =
                db.transaction(() => {
                    const tokenUpdate = db
                        .prepare(
                            `
                            UPDATE password_reset_tokens
                            SET used_at = ?
                            WHERE id = ?
                            AND used_at IS NULL
                            `
                        )
                        .run(
                            usedAt,
                            tokenRecord.id
                        );

                    if (
                        tokenUpdate.changes !== 1
                    ) {
                        throw new Error(
                            "Token został już wykorzystany."
                        );
                    }

                    db.prepare(
                        `
                        UPDATE users
                        SET password_hash = ?
                        WHERE id = ?
                        `
                    ).run(
                        passwordHash,
                        user.id
                    );

                    db.prepare(
                        `
                        UPDATE password_reset_tokens
                        SET used_at = ?
                        WHERE user_id = ?
                        AND used_at IS NULL
                        `
                    ).run(
                        usedAt,
                        user.id
                    );
                });

            completeReset();

            return res.json({
                success: true,
                message:
                    "Hasło zostało zmienione. Możesz się teraz zalogować."
            });

        } catch (error) {
            console.error(
                "Błąd kończenia resetu hasła:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się zmienić hasła."
            });
        }
    }
);

app.get(
    "/api/password-reset/validate",
    (req, res) => {
        try {
            const rawToken = String(
                req.query?.token || ""
            ).trim();

            if (!rawToken) {
                return res.status(400).json({
                    valid: false,
                    error:
                        "Brak tokenu zmiany hasła."
                });
            }

            const tokenHash =
                hashResetToken(rawToken);

            const tokenRecord = db
                .prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        expires_at,
                        used_at
                    FROM password_reset_tokens
                    WHERE token_hash = ?
                    `
                )
                .get(tokenHash);

            if (
                !tokenRecord ||
                tokenRecord.used_at
            ) {
                return res.status(400).json({
                    valid: false,
                    error:
                        "Link jest nieprawidłowy albo został już wykorzystany."
                });
            }

            if (
                new Date(
                    tokenRecord.expires_at
                ).getTime() <= Date.now()
            ) {
                return res.status(400).json({
                    valid: false,
                    error:
                        "Link do zmiany hasła wygasł."
                });
            }

            return res.json({
                valid: true
            });

        } catch (error) {
            console.error(
                "Błąd sprawdzania tokenu:",
                error
            );

            return res.status(500).json({
                valid: false,
                error:
                    "Nie udało się sprawdzić linku."
            });
        }
    }
);

app.post(
    "/api/password-reset/request",
    async (req, res) => {
        const genericResponse = () =>
            res.json({
                success: true,
                message:
                    PASSWORD_RESET_GENERIC_MESSAGE
            });

        try {
            const email = normalizeEmail(
                req.body?.email
            );

            if (!isValidEmail(email)) {
                return res.status(400).json({
                    error:
                        "Wpisz prawidłowy adres e-mail."
                });
            }

            const user = db
                .prepare(
                    `
                    SELECT
                        id,
                        username,
                        email
                    FROM users
                    WHERE LOWER(email) = LOWER(?)
                    `
                )
                .get(email);

            if (!user) {
                return genericResponse();
            }

            const cooldownStart = new Date(
                Date.now() -
                PASSWORD_RESET_REQUEST_COOLDOWN_MINUTES *
                60 *
                1000
            ).toISOString();

            const recentRequest = db
                .prepare(
                    `
                    SELECT id
                    FROM password_reset_tokens
                    WHERE user_id = ?
                    AND created_at >= ?
                    ORDER BY id DESC
                    LIMIT 1
                    `
                )
                .get(
                    user.id,
                    cooldownStart
                );

            if (recentRequest) {
                return genericResponse();
            }

            const rawToken =
                createResetToken();

            const tokenHash =
                hashResetToken(rawToken);

            const createdAt =
                new Date().toISOString();

            const expiresAt = new Date(
                Date.now() +
                PASSWORD_RESET_TOKEN_LIFETIME_MINUTES *
                60 *
                1000
            ).toISOString();

            const invalidatePreviousTokens =
                db.prepare(
                    `
                    UPDATE password_reset_tokens
                    SET used_at = ?
                    WHERE user_id = ?
                    AND used_at IS NULL
                    `
                );

            const insertToken = db.prepare(
                `
                INSERT INTO password_reset_tokens (
                    user_id,
                    token_hash,
                    created_at,
                    expires_at,
                    requested_ip
                )
                VALUES (?, ?, ?, ?, ?)
                `
            );

            const createTokenTransaction =
                db.transaction(() => {
                    invalidatePreviousTokens.run(
                        createdAt,
                        user.id
                    );

                    insertToken.run(
                        user.id,
                        tokenHash,
                        createdAt,
                        expiresAt,
                        req.ip || ""
                    );
                });

            createTokenTransaction();

            try {
                await sendPasswordResetEmail({
                    email: user.email,
                    username: user.username,
                    rawToken
                });
            } catch (mailError) {
                db.prepare(
                    `
                    DELETE FROM password_reset_tokens
                    WHERE token_hash = ?
                    `
                ).run(tokenHash);

                console.error(
                    "Błąd wysyłania wiadomości resetującej:",
                    mailError
                );

                return res.status(503).json({
                    error:
                        "Usługa pocztowa jest chwilowo niedostępna. Spróbuj ponownie później."
                });
            }

            console.log(
                `🔐 [PASSWORD RESET] Wysłano link dla konta ${user.username}.`
            );

            return genericResponse();

        } catch (error) {
            console.error(
                "Błąd tworzenia resetu hasła:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się rozpocząć odzyskiwania hasła."
            });
        }
    }
);

db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        requested_ip TEXT,
        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    )
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS
    idx_password_reset_tokens_user
    ON password_reset_tokens(user_id)
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS
    idx_password_reset_tokens_hash
    ON password_reset_tokens(token_hash)
`);


const normalizeEmail = (value) =>
    String(value || "")
        .trim()
        .toLowerCase();

const isValidEmail = (value) => {
    const email = normalizeEmail(value);

    return (
        email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email
        )
    );
};

const createResetToken = () =>
    crypto
        .randomBytes(32)
        .toString("hex");

const hashResetToken = (token) =>
    crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

const getMailTransporter = () => {
    const smtpPort = Number(
        process.env.SMTP_PORT || 587
    );

    const smtpSecure =
        String(
            process.env.SMTP_SECURE ||
            "false"
        ).toLowerCase() === "true";

    if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASSWORD
    ) {
        throw new Error(
            "Brak pełnej konfiguracji SMTP w pliku .env."
        );
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
            user:
                process.env.SMTP_USER,
            pass:
                process.env.SMTP_PASSWORD
        }
    });
};

const sendPasswordResetEmail = async ({
    email,
    username,
    rawToken
}) => {
    const transporter =
        getMailTransporter();

    const resetUrl =
        `${APP_URL}/reset-password.html` +
        `?token=${encodeURIComponent(
            rawToken
        )}`;

    const fromName =
        process.env.MAIL_FROM_NAME ||
        "Comparing Rates";

    const fromAddress =
        process.env.MAIL_FROM_ADDRESS ||
        process.env.SMTP_USER;

    await transporter.sendMail({
        from:
            `"${fromName}" <${fromAddress}>`,

        to: email,

        subject:
            "Zmiana hasła w Comparing Rates",

        text: [
            `Cześć ${username},`,
            "",
            "Otrzymaliśmy prośbę o zmianę hasła.",
            "",
            `Otwórz poniższy link:`,
            resetUrl,
            "",
            "Link jest ważny przez 30 minut i może zostać użyty tylko raz.",
            "",
            "Jeżeli prośba nie pochodziła od Ciebie, zignoruj tę wiadomość.",
            "",
            "Comparing Rates"
        ].join("\n"),

        html: `
            <div
                style="
                    max-width: 560px;
                    margin: 0 auto;
                    padding: 28px;
                    border-radius: 14px;
                    background: #171a21;
                    color: #f8fafc;
                    font-family: Arial, sans-serif;
                "
            >
                <h2
                    style="
                        margin: 0 0 16px;
                        color: #ffffff;
                    "
                >
                    Zmiana hasła
                </h2>

                <p
                    style="
                        color: #cbd5e1;
                        line-height: 1.6;
                    "
                >
                    Cześć
                    <strong>${username}</strong>.
                    Otrzymaliśmy prośbę o zmianę
                    hasła do Twojego konta.
                </p>

                ${resetUrl}
                    Ustaw nowe hasło
                </a>

                <p
                    style="
                        color: #94a3b8;
                        font-size: 14px;
                        line-height: 1.6;
                    "
                >
                    Link jest ważny przez 30 minut
                    i może zostać użyty tylko raz.
                </p>

                <p
                    style="
                        color: #94a3b8;
                        font-size: 14px;
                        line-height: 1.6;
                    "
                >
                    Jeżeli prośba nie pochodziła od
                    Ciebie, zignoruj tę wiadomość.
                </p>
            </div>
        `
    });
};


app.get(
    "/api/admin/password-reset-requests",
    isAdmin,
    (req, res) => {
        try {
            const requests = db
                .prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        username,
                        status,
                        created_at,
                        completed_at
                    FROM password_reset_requests
                    WHERE status = 'pending'
                    ORDER BY created_at ASC
                    `
                )
                .all();

            return res.json(requests);

        } catch (error) {
            console.error(
                "Błąd pobierania próśb o reset:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się pobrać próśb o reset hasła."
            });
        }
    }
);


app.post(
    "/api/admin/password-reset-requests/:id/complete",
    isAdmin,
    async (req, res) => {
        try {
            const requestId = Number.parseInt(
                req.params.id,
                10
            );

            const newPassword = String(
                req.body?.newPassword || ""
            );

            if (
                !Number.isInteger(requestId) ||
                requestId <= 0
            ) {
                return res.status(400).json({
                    error:
                        "Nieprawidłowe ID prośby."
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    error:
                        "Hasło tymczasowe musi mieć co najmniej 6 znaków."
                });
            }

            if (newPassword.length > 100) {
                return res.status(400).json({
                    error:
                        "Hasło może mieć maksymalnie 100 znaków."
                });
            }

            const resetRequest = db
                .prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        username,
                        status
                    FROM password_reset_requests
                    WHERE id = ?
                    `
                )
                .get(requestId);

            if (!resetRequest) {
                return res.status(404).json({
                    error:
                        "Nie znaleziono prośby o reset hasła."
                });
            }

            if (
                resetRequest.status !==
                "pending"
            ) {
                return res.status(409).json({
                    error:
                        "Ta prośba została już obsłużona."
                });
            }

            const selectedUser = db
                .prepare(
                    `
                    SELECT id, username
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(resetRequest.user_id);

            if (!selectedUser) {
                return res.status(404).json({
                    error:
                        "Konto użytkownika już nie istnieje."
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    10
                );

            const completeReset =
                db.transaction(() => {
                    db.prepare(
                        `
                        UPDATE users
                        SET password_hash = ?
                        WHERE id = ?
                        `
                    ).run(
                        passwordHash,
                        selectedUser.id
                    );

                    db.prepare(
                        `
                        UPDATE password_reset_requests
                        SET
                            status = 'completed',
                            completed_at = CURRENT_TIMESTAMP,
                            completed_by = ?
                        WHERE id = ?
                        `
                    ).run(
                        req.session.user.id,
                        requestId
                    );
                });

            completeReset();

            console.log(
                `🔐 [ADMIN] ${req.session.user.username} ` +
                `ustawił hasło tymczasowe użytkownikowi ` +
                `${selectedUser.username}.`
            );

            return res.json({
                success: true,
                message:
                    `Hasło użytkownika ${selectedUser.username} zostało zmienione.`
            });

        } catch (error) {
            console.error(
                "Błąd resetowania hasła:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się ustawić nowego hasła."
            });
        }
    }
);


app.put(
    "/api/account/email",
    async (req, res) => {
        try {
            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "Musisz być zalogowany."
                });
            }

            const email = normalizeEmail(
                req.body?.email
            );

            const password = String(
                req.body?.password || ""
            );

            if (!isValidEmail(email)) {
                return res.status(400).json({
                    error:
                        "Wpisz prawidłowy adres e-mail."
                });
            }

            if (!password) {
                return res.status(400).json({
                    error:
                        "Podaj hasło do konta."
                });
            }

            const user = db
                .prepare(
                    `
                    SELECT
                        id,
                        email,
                        password_hash
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(req.session.user.id);

            if (!user) {
                return res.status(404).json({
                    error:
                        "Nie znaleziono konta."
                });
            }

            const passwordCorrect =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );

            if (!passwordCorrect) {
                return res.status(400).json({
                    error:
                        "Hasło jest nieprawidłowe."
                });
            }

            const emailOwner = db
                .prepare(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(email) = LOWER(?)
                    AND id != ?
                    `
                )
                .get(
                    email,
                    user.id
                );

            if (emailOwner) {
                return res.status(409).json({
                    error:
                        "Ten adres e-mail jest już przypisany do innego konta."
                });
            }

            db.prepare(
                `
                UPDATE users
                SET
                    email = ?,
                    email_verified = 1
                WHERE id = ?
                `
            ).run(
                email,
                user.id
            );

            req.session.user.email =
                email;

            return res.json({
                success: true,
                email,
                message:
                    "Adres e-mail został zapisany."
            });

        } catch (error) {
            console.error(
                "Błąd zapisu e-maila:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się zapisać adresu e-mail."
            });
        }
    }
);

app.post(
    "/api/change-password",
    async (req, res) => {
        try {
            if (!req.session.user) {
                return res.status(401).json({
                    error:
                        "Musisz być zalogowany."
                });
            }

            const oldPassword = String(
                req.body?.oldPassword || ""
            );

            const newPassword = String(
                req.body?.newPassword || ""
            );

            if (!oldPassword) {
                return res.status(400).json({
                    error:
                        "Wpisz obecne hasło."
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    error:
                        "Nowe hasło musi mieć co najmniej 6 znaków."
                });
            }

            if (newPassword.length > 100) {
                return res.status(400).json({
                    error:
                        "Nowe hasło może mieć maksymalnie 100 znaków."
                });
            }

            const user = db
                .prepare(
                    `
                    SELECT id, password_hash
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(req.session.user.id);

            if (!user) {
                return res.status(404).json({
                    error:
                        "Nie znaleziono konta."
                });
            }

            const currentPasswordCorrect =
                await bcrypt.compare(
                    oldPassword,
                    user.password_hash
                );

            if (!currentPasswordCorrect) {
                return res.status(400).json({
                    error:
                        "Obecne hasło jest nieprawidłowe."
                });
            }

            const samePassword =
                await bcrypt.compare(
                    newPassword,
                    user.password_hash
                );

            if (samePassword) {
                return res.status(400).json({
                    error:
                        "Nowe hasło musi różnić się od obecnego."
                });
            }

            const newPasswordHash =
                await bcrypt.hash(
                    newPassword,
                    10
                );

            db.prepare(
                `
                UPDATE users
                SET password_hash = ?
                WHERE id = ?
                `
            ).run(
                newPasswordHash,
                user.id
            );

            return res.json({
                success: true,
                message:
                    "Hasło zostało zmienione."
            });

        } catch (error) {
            console.error(
                "Błąd zmiany hasła:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się zmienić hasła."
            });
        }
    }
);

app.get(
    "/api/me",
    (req, res) => {
        if (!req.session.user) {
            return res.json({
                loggedIn: false
            });
        }

        const user = db
            .prepare(
                `
                SELECT
                    id,
                    username,
                    email,
                    email_verified,
                    role
                FROM users
                WHERE id = ?
                `
            )
            .get(req.session.user.id);

        if (!user) {
            req.session.destroy(() => {});

            return res.json({
                loggedIn: false
            });
        }

        return res.json({
            loggedIn: true,
            user: {
                id: user.id,
                username:
                    user.username,
                email:
                    user.email || "",
                emailVerified:
                    Boolean(
                        user.email_verified
                    ),
                role: user.role
            }
        });
    }
);
app.post('/api/logout', (req, res) => { req.session.destroy(); res.clearCookie('connect.sid'); res.json({ message: "Wylogowano" }); });

app.get('/api/admin/users', isAdmin, (req, res) => res.json(db.prepare('SELECT id, username, role FROM users').all()));

app.put(
    "/api/admin/users/:id/role",
    isAdmin,
    (req, res) => {
        try {
            const userId = Number.parseInt(
                req.params.id,
                10
            );

            const newRole = String(
                req.body?.role || ""
            )
                .toLowerCase()
                .trim();

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {
                return res.status(400).json({
                    error:
                        "Nieprawidłowe ID użytkownika."
                });
            }

            if (
                newRole !== "user" &&
                newRole !== "admin"
            ) {
                return res.status(400).json({
                    error:
                        "Dozwolone role to user i admin."
                });
            }

            const selectedUser = db
                .prepare(
                    `
                    SELECT id, username, role
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(userId);

            if (!selectedUser) {
                return res.status(404).json({
                    error:
                        "Nie znaleziono użytkownika."
                });
            }

            /*
             * Blokujemy zmianę własnej roli,
             * żeby administrator przypadkiem
             * nie odebrał uprawnień sam sobie.
             */
            if (
                req.session.user.id === userId
            ) {
                return res.status(400).json({
                    error:
                        "Nie możesz zmienić roli własnego konta."
                });
            }

            if (
                selectedUser.role === newRole
            ) {
                return res.json({
                    success: true,
                    message:
                        `Użytkownik ${selectedUser.username} ` +
                        `ma już rolę ${newRole}.`
                });
            }

            const result = db
                .prepare(
                    `
                    UPDATE users
                    SET role = ?
                    WHERE id = ?
                    `
                )
                .run(
                    newRole,
                    userId
                );

            if (result.changes === 0) {
                return res.status(404).json({
                    error:
                        "Nie udało się znaleźć użytkownika."
                });
            }

            console.log(
                `👤 [ADMIN] ${req.session.user.username} ` +
                `zmienił rolę użytkownika ` +
                `${selectedUser.username} ` +
                `z ${selectedUser.role} na ${newRole}.`
            );

            return res.json({
                success: true,
                message:
                    `Zmieniono rolę użytkownika ` +
                    `${selectedUser.username} ` +
                    `na ${newRole}.`
            });

        } catch (error) {
            console.error(
                "❌ [ADMIN ROLE] Błąd zmiany roli:",
                error
            );

            return res.status(500).json({
                error:
                    "Wystąpił błąd podczas zmiany roli."
            });
        }
    }
);

app.delete(
    "/api/admin/users/:id",
    isAdmin,
    (req, res) => {
        try {
            const userId = Number.parseInt(
                req.params.id,
                10
            );

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {
                return res.status(400).json({
                    error:
                        "Nieprawidłowe ID użytkownika."
                });
            }

            if (
                req.session.user.id === userId
            ) {
                return res.status(400).json({
                    error:
                        "Nie możesz usunąć własnego konta administratora."
                });
            }

            const selectedUser = db
                .prepare(
                    `
                    SELECT id, username
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(userId);

            if (!selectedUser) {
                return res.status(404).json({
                    error:
                        "Nie znaleziono użytkownika."
                });
            }

            const deleteTransaction =
                db.transaction(() => {
                    /*
                     * Najpierw usuwamy ulubione
                     * należące do użytkownika.
                     */
                    db.prepare(
                        `
                        DELETE FROM favorites
                        WHERE user_id = ?
                        `
                    ).run(userId);

                    /*
                     * Następnie usuwamy konto.
                     */
                    return db.prepare(
                        `
                        DELETE FROM users
                        WHERE id = ?
                        `
                    ).run(userId);
                });

            const result =
                deleteTransaction();

            if (result.changes === 0) {
                return res.status(404).json({
                    error:
                        "Nie udało się usunąć użytkownika."
                });
            }

            console.log(
                `🗑️ [ADMIN] ${req.session.user.username} ` +
                `usunął użytkownika ` +
                `${selectedUser.username}.`
            );

            return res.json({
                success: true,
                message:
                    `Usunięto użytkownika ` +
                    `${selectedUser.username}.`
            });

        } catch (error) {
            console.error(
                "❌ [ADMIN DELETE] Błąd usuwania:",
                error
            );

            return res.status(500).json({
                error:
                    "Wystąpił błąd podczas usuwania użytkownika."
            });
        }
    }
);

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

app.get(
    "/api/matches",
    (req, res) => {
        try {
            if (
                !fs.existsSync(DATA_PATH)
            ) {
                return res.status(503).json({
                    error:
                        "Dane meczów nie są jeszcze dostępne.",
                    matches: []
                });
            }

            const rawData =
                fs.readFileSync(
                    DATA_PATH,
                    "utf8"
                );

            const matches =
                JSON.parse(rawData);

            if (!Array.isArray(matches)) {
                throw new Error(
                    "Plik wynikowy nie zawiera tablicy."
                );
            }

            res.setHeader(
                "Cache-Control",
                "no-store, no-cache, must-revalidate"
            );

            return res.json(matches);
        } catch (error) {
            console.error(
                "❌ [API MATCHES] Błąd:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się odczytać danych meczów.",
                details: error.message
            });
        }
    }
);

app.post(
    "/api/run-scraper",
    isAdmin,
    async (req, res) => {
        if (isScraping) {
            return res.status(409).json({
                error:
                    "Scraper jest już uruchomiony."
            });
        }

        res.status(202).json({
            message:
                "Uruchomiono pipeline scraperów."
        });

        runScraper().catch((error) => {
            console.error(
                "❌ [MANUAL SCRAPER]",
                error
            );
        });
    }
);

app.get(
    "/api/scraper-status",
    (req, res) => {
        let dataFile = null;

        if (fs.existsSync(DATA_PATH)) {
            const stats =
                fs.statSync(DATA_PATH);

            dataFile = {
                path: DATA_PATH,
                updatedAt:
                    stats.mtime.toISOString(),
                size:
                    stats.size
            };
        }

        res.json({
            isScraping,
            nextRun:
                getNextScrapeDate().toISOString(),
            dataFile
        });
    }
);

const PORT =
    Number(process.env.PORT) ||
    3001;

app.listen(PORT, () => {
    console.log(
        `🚀 Backend działa na http://localhost:${PORT}`
    );

    console.log(
        `📁 Pipeline: ${PIPELINE_DIR}`
    );

    console.log(
        `📁 Katalog danych: ${DATA_DIR}`
    );

    console.log(
        `📄 Plik wynikowy: ${DATA_PATH}`
    );

    console.log(
        `🐍 Polscy: ${POLSCY_SCRIPT}`
    );

    console.log(
        `🐍 Zagraniczni: ${ZAGRANICZNI_SCRIPT}`
    );

    console.log(
        `🔗 Łączenie: ${COMPARE_SCRIPT}`
    );
});

