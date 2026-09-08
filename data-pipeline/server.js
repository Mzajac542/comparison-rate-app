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

const VALIDATORS_DIR = path.join(
    PIPELINE_DIR,
    "validators"
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

const VALIDATE_SCRIPT = path.join(
    VALIDATORS_DIR,
    "validate_scrapers.py"
);

const COMPARE_SCRIPT = path.join(
    SCRAPERS_DIR,
    "compare_odds.py"
);

const POLSCY_REPORT_PATH = path.join(
    DATA_DIR,
    "polscy_scrape_report.json"
);

const ZAGRANICZNI_REPORT_PATH = path.join(
    DATA_DIR,
    "zagraniczni_scrape_report.json"
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

if (!usersColumns.includes("access_expires_at")) {
    db.exec(
        `
        ALTER TABLE users
        ADD COLUMN access_expires_at TEXT
        `
    );

    console.log(
        "✅ [DB] Dodano kolumnę users.access_expires_at."
    );
}

db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id INTEGER NOT NULL,

        provider TEXT NOT NULL
            DEFAULT '1koszyk',

        provider_order_id TEXT,
        provider_order_number TEXT,

        product_reference TEXT,

        amount TEXT NOT NULL,
        currency TEXT NOT NULL
            DEFAULT 'PLN',

        status TEXT NOT NULL
            DEFAULT 'pending',

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        paid_at TEXT,
        access_granted_at TEXT,

        raw_callback TEXT,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    )
`);

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    idx_payments_provider_order_id
    ON payments(provider_order_id)
    WHERE provider_order_id IS NOT NULL
`);

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    idx_payments_provider_order_number
    ON payments(provider_order_number)
    WHERE provider_order_number IS NOT NULL
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS
    idx_payments_user_id
    ON payments(user_id)
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS
    idx_payments_status
    ON payments(status)
`);

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


app.use(
    express.json({
        verify: (
            req,
            res,
            buffer
        ) => {
            if (
                req.originalUrl ===
                "/api/payments/1koszyk/callback"
            ) {
                req.rawBody = Buffer.from(
                    buffer
                );
            }
        }
    })
);


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
const getAccessInfo = (user) => {
    if (!user) {
        return {
            hasPremiumAccess: false,
            accessType: "demo",
            accessExpiresAt: null
        };
    }

    if (user.role === "admin") {
        return {
            hasPremiumAccess: true,
            accessType: "admin",
            accessExpiresAt: null
        };
    }

    if (!user.access_expires_at) {
        return {
            hasPremiumAccess: false,
            accessType: "demo",
            accessExpiresAt: null
        };
    }

    const expiresTimestamp = new Date(
        user.access_expires_at
    ).getTime();

    const validDate = Number.isFinite(
        expiresTimestamp
    );

    const hasPremiumAccess = (
        validDate
        && expiresTimestamp > Date.now()
    );

    return {
        hasPremiumAccess,
        accessType:
            hasPremiumAccess
                ? "premium"
                : "demo",
        accessExpiresAt:
            validDate
                ? user.access_expires_at
                : null
    };
};

const parseMatchDateForDemo = (dateValue) => {
    if (!dateValue) {
        return null;
    }

    const text = String(dateValue).trim();

    const polishFormat = text.match(
        /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
    );

    if (polishFormat) {
        const day = Number(polishFormat[1]);
        const month = Number(polishFormat[2]) - 1;
        const year = Number(polishFormat[3]);

        const date = new Date(
            year,
            month,
            day
        );

        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }

    const fallbackDate = new Date(text);

    if (Number.isNaN(fallbackDate.getTime())) {
        return null;
    }

    return fallbackDate;
};


const getUpcomingMatchesForDemo = (matches) => {
    if (!Array.isArray(matches)) {
        return [];
    }

    const today = new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

    return matches.filter((match) => {
        const matchDate = parseMatchDateForDemo(
            match?.dzien || match?.date
        );

        if (!matchDate) {
            return false;
        }

        matchDate.setHours(
            0,
            0,
            0,
            0
        );

        const differenceInDays = Math.round(
            (
                matchDate.getTime() -
                today.getTime()
            ) /
            (
                1000 *
                60 *
                60 *
                24
            )
        );

        return (
            differenceInDays === 1 ||
            differenceInDays === 2
        );
    });
};


const getDemoMatches = (matches) => {
    const upcomingMatches =
        getUpcomingMatchesForDemo(matches);

    if (upcomingMatches.length === 0) {
        return [];
    }

    const demoCount = Math.max(
        1,
        Math.ceil(
            upcomingMatches.length * 0.05
        )
    );

    return upcomingMatches.slice(
        0,
        demoCount
    );
};

const normalizeEmail = (value) => {
    return String(value || "")
        .trim()
        .toLowerCase();
};


const moneyToCents = (value) => {
    const amount = Number.parseInt(
        String(value ?? "").trim(),
        10
    );

    if (
        !Number.isSafeInteger(amount) ||
        amount < 0
    ) {
        return null;
    }

    return amount;
};

const safeStringEqual = (
    firstValue,
    secondValue
) => {
    const firstBuffer = Buffer.from(
        String(firstValue || ""),
        "utf8"
    );

    const secondBuffer = Buffer.from(
        String(secondValue || ""),
        "utf8"
    );

    if (
        firstBuffer.length !==
        secondBuffer.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        firstBuffer,
        secondBuffer
    );
};

const verifyOneCartDigest = (req) => {
    const digestHeader = String(
        req.get("Digest") || ""
    ).trim();

    if (!digestHeader) {
        return {
            valid: false,
            reason:
                "Brak nagłówka Digest."
        };
    }

    if (
        !Buffer.isBuffer(req.rawBody)
    ) {
        return {
            valid: false,
            reason:
                "Brak surowej treści callbacka."
        };
    }

    const expectedDigest =
        "SHA-512=" +
        crypto
            .createHash("sha512")
            .update(req.rawBody)
            .digest("base64");

    if (
        !safeStringEqual(
            digestHeader,
            expectedDigest
        )
    ) {
        return {
            valid: false,
            reason:
                "Nagłówek Digest jest nieprawidłowy."
        };
    }

    return {
        valid: true
    };
};

const parseOneCartSignatureHeader = (
    signatureHeader
) => {
    const values = {};

    const parts = String(
        signatureHeader || ""
    ).match(
        /(?:[^,"]|"[^"]*")+/g
    ) || [];

    for (const part of parts) {
        const separatorIndex =
            part.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const name = part
            .slice(0, separatorIndex)
            .trim();

        const value = part
            .slice(separatorIndex + 1)
            .trim()
            .replace(/^"|"$/g, "");

        if (name) {
            values[name] = value;
        }
    }

    return values;
};

const verifyOneCartSignature = (req) => {
    const signingKey = String(
        process.env.ONECART_SIGNING_KEY || ""
    ).trim();

    const expectedClientId = String(
        process.env.ONECART_CLIENT_ID || ""
    ).trim();

    if (!signingKey) {
        return {
            valid: false,
            reason:
                "Brak ONECART_SIGNING_KEY."
        };
    }
        if (
        !/^[0-9a-fA-F]{64}$/.test(
            signingKey
        )
    ) {
        return {
            valid: false,
            reason:
                "ONECART_SIGNING_KEY nie ma " +
                "oczekiwanego formatu 64 znaków hex."
        };
    }

    if (!expectedClientId) {
        return {
            valid: false,
            reason:
                "Brak ONECART_CLIENT_ID."
        };
    }

    const dateHeader = String(
        req.get("Date") || ""
    ).trim();

    const digestHeader = String(
        req.get("Digest") || ""
    ).trim();

    const signatureHeader = String(
        req.get("Signature") || ""
    ).trim();

    if (
        !dateHeader ||
        !digestHeader ||
        !signatureHeader
    ) {
        return {
            valid: false,
            reason:
                "Brak nagłówków Date, Digest " +
                "lub Signature."
        };
    }

    const signatureValues =
        parseOneCartSignatureHeader(
            signatureHeader
        );

    const keyId = String(
        signatureValues.keyId || ""
    ).trim();

    const algorithm = String(
        signatureValues.algorithm || ""
    )
        .trim()
        .toLowerCase();

    const headers = String(
        signatureValues.headers || ""
    )
        .trim()
        .toLowerCase();

    const receivedSignature = String(
        signatureValues.signature || ""
    ).trim();

    if (!keyId) {
        return {
            valid: false,
            reason:
                "Brak keyId w nagłówku Signature."
        };
    }

    if (
        !safeStringEqual(
            keyId,
            expectedClientId
        )
    ) {
        return {
            valid: false,
            reason:
                "Nieprawidłowy keyId."
        };
    }

    if (algorithm !== "sha3-512") {
        return {
            valid: false,
            reason:
                `Nieobsługiwany algorytm: ` +
                `${algorithm || "brak"}.`
        };
    }

    if (
        headers !==
        "(request-target) date digest"
    ) {
        return {
            valid: false,
            reason:
                `Nieprawidłowa lista podpisanych ` +
                `nagłówków: ${headers || "brak"}.`
        };
    }

    if (!receivedSignature) {
        return {
            valid: false,
            reason:
                "Brak wartości podpisu."
        };
    }

/*
 * 1koszyk podpisuje callback w nietypowy sposób:
 *
 * - klucz podpisujący jest używany jako surowy tekst UTF-8,
 * - separatorem są dosłowne znaki "\" i "n",
 * - request-target zawiera metodę POST i pustą ścieżkę.
 */
const requestTarget =
    req.originalUrl;

const signingString =
    `(request-target): post ${requestTarget}` +
    "\\n" +
    `Date: ${dateHeader}` +
    "\\n" +
    `Digest: ${digestHeader}`;

let hexadecimalSignature;

try {
    hexadecimalSignature = crypto
        .createHmac(
            "sha3-512",
            signingKey
        )
        .update(
            signingString,
            "utf8"
        )
        .digest("hex");
    } catch (error) {
        return {
            valid: false,
            reason:
                `Nie udało się obliczyć podpisu: ` +
                `${error.message}`
        };
    }

    /*
     * Dokumentacja 1koszyk opisuje podpis jako:
     * 1. wynik SHA3-512,
     * 2. zapis szesnastkowy,
     * 3. zakodowanie zapisu szesnastkowego
     *    przez Base64.
     */
    const expectedSignature =
        Buffer.from(
            hexadecimalSignature,
            "utf8"
        ).toString("base64");

    if (
        !safeStringEqual(
            receivedSignature,
            expectedSignature
        )
    ) {
        return {
            valid: false,
            reason:
                "Podpis kryptograficzny jest " +
                "nieprawidłowy."
        };
    }

    return {
        valid: true
    };
};



const getOneCartConfiguration = () => {
    const apiBaseUrl = String(
        process.env.ONECART_API_BASE_URL ||
        "https://api.1cart.eu/v1"
    )
        .trim()
        .replace(/\/+$/, "");

    const apiKey = String(
        process.env.ONECART_API_KEY || ""
    ).trim();

    const clientId = String(
        process.env.ONECART_CLIENT_ID || ""
    ).trim();

    const productId = String(
        process.env.ONECART_PRODUCT_ID ||
        "dostep-na-30-dni"
    ).trim();

    const price = Number(
        process.env.ONECART_ACCESS_PRICE || 50
    );

    const accessDays = Number(
        process.env.ONECART_ACCESS_DAYS || 30
    );

    const pendingMaxAgeHours = Number(
        process.env.ONECART_PENDING_MAX_AGE_HOURS ||
        24
    );

    return {
        apiBaseUrl,
        apiKey,
        clientId,
        productId,
        price,
        accessDays,
        pendingMaxAgeHours
    };
};


const fetchOneCartOrder = async (
    orderNumber
) => {
    const config =
        getOneCartConfiguration();

    if (
        !config.apiKey ||
        !config.clientId
    ) {
        throw new Error(
            "Brak danych dostępowych API 1koszyk."
        );
    }

    if (!orderNumber) {
        throw new Error(
            "Brak numeru zamówienia 1koszyk."
        );
    }

    const response = await fetch(
        `${config.apiBaseUrl}/orders`,
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json",
                "Accept":
                    "application/json",
                "X-API-key":
                    config.apiKey,
                "X-client-id":
                    config.clientId
            },
            body: JSON.stringify([
                orderNumber
            ])
        }
    );

    const responseText =
        await response.text();

    if (!response.ok) {
        throw new Error(
            `API 1koszyk zwróciło HTTP ` +
            `${response.status}: ` +
            `${responseText.slice(0, 500)}`
        );
    }

    let responseData;

    try {
        responseData =
            JSON.parse(responseText);
    } catch {
        throw new Error(
            "API 1koszyk zwróciło " +
            "nieprawidłową odpowiedź JSON."
        );
    }

    if (
        !Array.isArray(responseData) ||
        responseData.length !== 1
    ) {
        throw new Error(
            "Nie znaleziono jednoznacznego " +
            "zamówienia w API 1koszyk."
        );
    }

    return responseData[0];
};


const verifyOneCartOrder = (order) => {
    const config =
        getOneCartConfiguration();

    if (
        !order ||
        typeof order !== "object"
    ) {
        return {
            valid: false,
            reason:
                "Brak danych zamówienia."
        };
    }

    const orderId = String(
        order.id || ""
    ).trim();

    const orderNumber = String(
        order.number || ""
    ).trim();

    const paymentState = String(
        order.payment_state || ""
    ).trim();

    const customerEmail =
        normalizeEmail(
            order.customer?.email
        );

    const currency = String(
        order.total?.currency || ""
    )
        .trim()
        .toUpperCase();

    const orderAmountCents =
        moneyToCents(
            order.total?.amount
        );

    const expectedAmountCents =
        Math.round(
            config.price * 100
        );

    if (!orderId || !orderNumber) {
        return {
            valid: false,
            reason:
                "Brak identyfikatora zamówienia."
        };
    }

    if (!customerEmail) {
        return {
            valid: false,
            reason:
                "Brak adresu e-mail kupującego."
        };
    }

    if (order.cancelled_at) {
        return {
            valid: false,
            reason:
                "Zamówienie zostało anulowane."
        };
    }

    if (currency !== "PLN") {
        return {
            valid: false,
            reason:
                `Nieprawidłowa waluta: ${currency}.`
        };
    }

    if (
        orderAmountCents !==
        expectedAmountCents
    ) {
        return {
            valid: false,
            reason:
                `Nieprawidłowa kwota: ` +
                `${order.total?.amount} ${currency}.`
        };
    }

    const items = Array.isArray(
        order.items
    )
        ? order.items
        : [];

    const matchingItems = items.filter(
        (item) => {
            const sellerId = String(
                item?.product?.seller_id || ""
            ).trim();

            return (
                sellerId === config.productId
            );
        }
    );

    if (matchingItems.length !== 1) {
        return {
            valid: false,
            reason:
                "Zamówienie nie zawiera " +
                "właściwego produktu."
        };
    }

    const quantity = Number(
        matchingItems[0]?.quantity
    );

    if (quantity !== 1) {
        return {
            valid: false,
            reason:
                `Nieprawidłowa ilość produktu: ` +
                `${quantity}.`
        };
    }

    return {
        valid: true,
        orderId,
        orderNumber,
        paymentState,
        customerEmail,
        amount:
            config.price.toFixed(2),
        currency,
        accessDays:
            config.accessDays
    };
};

const grantPremiumForOneCartOrder =
    db.transaction(
        (
            verifiedOrder,
            fullOrder
        ) => {
            const existingByOrder = db
                .prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        status,
                        access_granted_at
                    FROM payments
                    WHERE provider = '1koszyk'
                      AND (
                        provider_order_id = ?
                        OR provider_order_number = ?
                      )
                    LIMIT 1
                    `
                )
                .get(
                    verifiedOrder.orderId,
                    verifiedOrder.orderNumber
                );

            if (
                existingByOrder?.access_granted_at
            ) {
                return {
                    status:
                        "already_granted",
                    paymentId:
                        existingByOrder.id,
                    userId:
                        existingByOrder.user_id
                };
            }

            let localPayment =
                existingByOrder;

            if (!localPayment) {
                const config =
                    getOneCartConfiguration();

                const oldestAllowedDate =
                    new Date(
                        Date.now() -
                        (
                            config
                                .pendingMaxAgeHours *
                            60 *
                            60 *
                            1000
                        )
                    ).toISOString();

                localPayment = db
                    .prepare(
                        `
                        SELECT
                            p.id,
                            p.user_id,
                            p.status,
                            p.access_granted_at
                        FROM payments p
                        INNER JOIN users u
                            ON u.id = p.user_id
                        WHERE p.provider = '1koszyk'
                          AND p.status = 'pending'
                          AND p.created_at >= ?
                          AND LOWER(
                                TRIM(u.email)
                              ) = ?
                        ORDER BY
                            p.created_at DESC,
                            p.id DESC
                        LIMIT 1
                        `
                    )
                    .get(
                        oldestAllowedDate,
                        verifiedOrder.customerEmail
                    );
            }

            if (!localPayment) {
                throw new Error(
                    "Nie znaleziono oczekującej " +
                    "płatności powiązanej z e-mailem " +
                    "kupującego."
                );
            }

            const user = db
                .prepare(
                    `
                    SELECT
                        id,
                        username,
                        email,
                        access_expires_at
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(
                    localPayment.user_id
                );

            if (!user) {
                throw new Error(
                    "Nie znaleziono użytkownika " +
                    "dla lokalnej płatności."
                );
            }

            if (
                normalizeEmail(user.email) !==
                verifiedOrder.customerEmail
            ) {
                throw new Error(
                    "Adres e-mail zamówienia " +
                    "nie odpowiada użytkownikowi."
                );
            }

            const now = new Date();
            const nowIso =
                now.toISOString();

            let accessBase = now;

            if (user.access_expires_at) {
                const currentExpiration =
                    new Date(
                        user.access_expires_at
                    );

                if (
                    Number.isFinite(
                        currentExpiration.getTime()
                    ) &&
                    currentExpiration > now
                ) {
                    accessBase =
                        currentExpiration;
                }
            }

            const newExpiration =
                new Date(
                    accessBase.getTime() +
                    (
                        verifiedOrder.accessDays *
                        24 *
                        60 *
                        60 *
                        1000
                    )
                );

            db.prepare(
                `
                UPDATE users
                SET access_expires_at = ?
                WHERE id = ?
                `
            ).run(
                newExpiration.toISOString(),
                user.id
            );

            db.prepare(
                `
                UPDATE payments
                SET
                    provider_order_id = ?,
                    provider_order_number = ?,
                    amount = ?,
                    currency = ?,
                    status = 'paid',
                    updated_at = ?,
                    paid_at = COALESCE(
                        paid_at,
                        ?
                    ),
                    access_granted_at = ?,
                    raw_callback = ?
                WHERE id = ?
                  AND access_granted_at IS NULL
                `
            ).run(
                verifiedOrder.orderId,
                verifiedOrder.orderNumber,
                verifiedOrder.amount,
                verifiedOrder.currency,
                nowIso,
                nowIso,
                nowIso,
                JSON.stringify(fullOrder),
                localPayment.id
            );

            return {
                status:
                    "granted",
                paymentId:
                    localPayment.id,
                userId:
                    user.id,
                username:
                    user.username,
                accessExpiresAt:
                    newExpiration.toISOString()
            };
        }
    );

const requireLoggedInUser = (
    req,
    res,
    next
) => {
    if (!req.session?.user?.id) {
        return res.status(401).json({
            error:
                "Musisz być zalogowany, aby rozpocząć zakup."
        });
    }

    next();
};

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
        throw new Error(
            `Nie udało się usunąć starego raportu ` +
            `${reportPath}: ${error.message}`
        );
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

const removeOldScrapeReports = () => {
    const reportPaths = [
        POLSCY_REPORT_PATH,
        ZAGRANICZNI_REPORT_PATH
    ];

    for (const reportPath of reportPaths) {
        try {
            if (fs.existsSync(reportPath)) {
                fs.unlinkSync(reportPath);

                console.log(
                    `🧹 [REPORT] Usunięto stary raport: ${reportPath}`
                );
            }
        } catch (error) {
            console.error(
                `❌ [REPORT] Nie udało się usunąć raportu ${reportPath}:`,
                error
            );
        }
    }
};

const runScraper = async () => {
    if (isScraping) {
        console.log(
            "⚠️ [SCRAPER] Proces już trwa. " +
            "Pomijam kolejne uruchomienie."
        );

        return {
            started: false,
            reason: "already-running"
        };
    }

    isScraping = true;

    const startedAt = Date.now();

    let polscySuccess = false;
    let zagraniczniSuccess = false;
    let validationSuccess = false;

    const pipelineErrors = [];

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

        /*
         * Usuwamy wyłącznie stare raporty wykonania.
         * Poprzednie poprawne dane pozostają dostępne.
         */
        removeOldScrapeReports();

        /*
         * FAZA 1: polski scraper.
         */
        console.log("");
        console.log(
            "🇵🇱 [FAZA 1/4] Pobieranie polskich bukmacherów"
        );

        try {
            await runPythonScript(
                POLSCY_SCRIPT,
                "polscy.py"
            );

            polscySuccess = true;

        } catch (error) {
            pipelineErrors.push(
                `polscy.py: ${error.message}`
            );

            console.error(
                "❌ [POLSCY] Scraper zakończył się błędem:",
                error
            );
        }

        /*
         * FAZA 2: zagraniczny scraper.
         *
         * Uruchamiamy go nawet wtedy, gdy polski scraper
         * zakończył się błędem. Dzięki temu walidator
         * otrzyma możliwie pełny obraz sytuacji.
         */
        console.log("");
        console.log(
            "🌍 [FAZA 2/4] Pobieranie zagranicznych bukmacherów"
        );

        try {
            await runPythonScript(
                ZAGRANICZNI_SCRIPT,
                "zagraniczni.py"
            );

            zagraniczniSuccess = true;

        } catch (error) {
            pipelineErrors.push(
                `zagraniczni.py: ${error.message}`
            );

            console.error(
                "❌ [ZAGRANICZNI] Scraper zakończył się błędem:",
                error
            );
        }

        /*
         * FAZA 3: walidacja.
         *
         * Walidator uruchamiamy zawsze, nawet jeśli jeden
         * ze scraperów zakończył się błędem. Brak raportu
         * lub uszkodzony plik powinien wtedy spowodować
         * alert na Discordzie.
         */
        console.log("");
        console.log(
            "🩺 [FAZA 3/4] Walidacja wyników scraperów"
        );

        try {
            await runPythonScript(
                VALIDATE_SCRIPT,
                "validate_scrapers.py"
            );

            validationSuccess = true;

        } catch (error) {
            pipelineErrors.push(
                `validate_scrapers.py: ${error.message}`
            );

            console.error(
                "❌ [VALIDATOR] Walidacja wykryła problem:",
                error
            );
        }

        /*
         * Nie publikujemy nowych danych, jeśli:
         * - którykolwiek scraper się nie powiódł,
         * - walidator zwrócił ostrzeżenie,
         * - walidator zwrócił błąd krytyczny.
         */
        if (
            !polscySuccess ||
            !zagraniczniSuccess ||
            !validationSuccess
        ) {
            throw new Error(
                "Pipeline nie przeszedł pełnej walidacji. " +
                "Plik publikowany na stronie nie został zaktualizowany."
            );
        }

        /*
         * FAZA 4: łączenie danych.
         *
         * Ta faza uruchamia się dopiero po poprawnym
         * zakończeniu obu scraperów i walidatora.
         */
        console.log("");
        console.log(
            "🔗 [FAZA 4/4] Łączenie zwalidowanych wyników"
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
            validationSuccess: true,
            matches: mergedMatches.length,
            durationSeconds:
                Number(durationSeconds)
        };

    } catch (error) {
        const durationSeconds = (
            (Date.now() - startedAt) /
            1000
        ).toFixed(1);

        console.error("");
        console.error(
            "❌ [PIPELINE] Aktualizacja nie powiodła się:"
        );

        console.error(
            error
        );

        if (pipelineErrors.length > 0) {
            console.error(
                "❌ [PIPELINE] Zarejestrowane problemy:"
            );

            for (const pipelineError of pipelineErrors) {
                console.error(
                    `   • ${pipelineError}`
                );
            }
        }

        console.error(
            "⚠️ Poprzedni poprawny plik JSON " +
            "nie został celowo usunięty."
        );

        console.error(
            `⏱️ Czas do przerwania: ${durationSeconds} s`
        );

        console.error("");

        return {
            started: true,
            success: false,
            validationSuccess,
            polscySuccess,
            zagraniczniSuccess,
            error: error.message,
            errors: pipelineErrors,
            durationSeconds:
                Number(durationSeconds)
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
                    role,
                    access_expires_at
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
        const accessInfo = getAccessInfo(user);

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
                role: user.role,
                    hasPremiumAccess:
                        accessInfo.hasPremiumAccess,
                    accessType:
                        accessInfo.accessType,
                    accessExpiresAt:
                        accessInfo.accessExpiresAt
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

app.post(
    "/api/payments/1koszyk/callback",
    async (req, res) => {
        try {
            const dateHeader = String(
                req.get("Date") || ""
            ).trim();

            const digestHeader = String(
                req.get("Digest") || ""
            ).trim();

            const signatureHeader = String(
                req.get("Signature") || ""
            ).trim();

            if (
                !dateHeader ||
                !digestHeader ||
                !signatureHeader
            ) {
                console.warn(
                    "⚠️ [1KOSZYK SECURITY] " +
                    "Brak podpisanych nagłówków callbacka."
                );

                return res
                    .status(401)
                    .type("text/plain")
                    .send("INVALID SIGNATURE");
            }

            const requestDate =
                Date.parse(dateHeader);

            if (
                !Number.isFinite(requestDate)
            ) {
                return res
                    .status(401)
                    .type("text/plain")
                    .send("INVALID DATE");
            }

            const maximumClockDifference =
                5 * 60 * 1000;

            if (
                Math.abs(
                    Date.now() - requestDate
                ) > maximumClockDifference
            ) {
                console.warn(
                    "⚠️ [1KOSZYK SECURITY] " +
                    "Data callbacka jest zbyt stara."
                );

                return res
                    .status(401)
                    .type("text/plain")
                    .send("EXPIRED CALLBACK");
            }

            const digestVerification =
                verifyOneCartDigest(req);

            if (!digestVerification.valid) {
                console.warn(
                    "⚠️ [1KOSZYK SECURITY]",
                    digestVerification.reason
                );

                return res
                    .status(401)
                    .type("text/plain")
                    .send("INVALID DIGEST");
            }

            const signatureVerification =
                verifyOneCartSignature(req);

            if (!signatureVerification.valid) {
                console.warn(
                    "⚠️ [1KOSZYK SECURITY]",
                    signatureVerification.reason
                );

                return res
                    .status(401)
                    .type("text/plain")
                    .send("INVALID SIGNATURE");
            }
            const callback = req.body;

            if (
                !callback ||
                typeof callback !== "object"
            ) {
                console.warn(
                    "⚠️ [1KOSZYK CALLBACK] " +
                    "Nieprawidłowy JSON."
                );

                return res.status(400).send(
                    "INVALID BODY"
                );
            }

            const event = String(
                callback.event || ""
            ).trim();

            const callbackOrder =
                callback.order;

            const orderId = String(
                callbackOrder?.id || ""
            ).trim();

            const orderNumber = String(
                callbackOrder?.number || ""
            ).trim();

            if (
                !event ||
                !orderId ||
                !orderNumber
            ) {
                console.warn(
                    "⚠️ [1KOSZYK CALLBACK] " +
                    "Brak wymaganych danych.",
                    {
                        event,
                        orderId,
                        orderNumber
                    }
                );

                return res.status(400).send(
                    "INVALID CALLBACK"
                );
            }

            const allowedEvents = new Set([
                "orderCreated",
                "paymentStateChanged",
                "orderCancelled"
            ]);

            if (!allowedEvents.has(event)) {
                console.warn(
                    "⚠️ [1KOSZYK CALLBACK] " +
                    `Nieobsługiwane zdarzenie: ${event}`
                );

                return res
                    .status(200)
                    .type("text/plain")
                    .send("OK");
            }

            console.log(
                "📩 [1KOSZYK CALLBACK]",
                {
                    event,
                    orderId,
                    orderNumber,
                    callbackPaymentState:
                        callbackOrder
                            ?.payment_state
                }
            );

            /*
             * Callback jest tylko sygnałem.
             * Zamówienie zawsze pobieramy ponownie
             * z autoryzowanego API 1koszyk.
             */
            const fullOrder =
                await fetchOneCartOrder(
                    orderNumber
                );

            if (
                String(fullOrder.id) !==
                orderId
            ) {
                throw new Error(
                    "Identyfikator zamówienia " +
                    "z API nie odpowiada callbackowi."
                );
            }

            const verification =
                verifyOneCartOrder(
                    fullOrder
                );

            if (!verification.valid) {
                console.warn(
                    "⚠️ [1KOSZYK VERIFY]",
                    {
                        event,
                        orderNumber,
                        reason:
                            verification.reason
                    }
                );

                if (
                    event ===
                    "orderCancelled"
                ) {
                    db.prepare(
                        `
                        UPDATE payments
                        SET
                            status = 'cancelled',
                            updated_at = ?,
                            provider_order_id =
                                COALESCE(
                                    provider_order_id,
                                    ?
                                ),
                            provider_order_number =
                                COALESCE(
                                    provider_order_number,
                                    ?
                                ),
                            raw_callback = ?
                        WHERE provider = '1koszyk'
                          AND access_granted_at
                                IS NULL
                          AND (
                            provider_order_id = ?
                            OR provider_order_number = ?
                          )
                        `
                    ).run(
                        new Date().toISOString(),
                        orderId,
                        orderNumber,
                        JSON.stringify(fullOrder),
                        orderId,
                        orderNumber
                    );
                }

                return res
                    .status(200)
                    .type("text/plain")
                    .send("OK");
            }

            /*
             * orderCreated oraz płatność w toku
             * mogą przypisać numer zamówienia,
             * lecz nie przyznają Premium.
             */
            if (
                verification.paymentState !==
                "completed"
            ) {
                const pendingPayment = db
                    .prepare(
                        `
                        SELECT
                            p.id
                        FROM payments p
                        INNER JOIN users u
                            ON u.id = p.user_id
                        WHERE p.provider = '1koszyk'
                          AND p.status = 'pending'
                          AND p.access_granted_at
                                IS NULL
                          AND LOWER(
                                TRIM(u.email)
                              ) = ?
                        ORDER BY
                            p.created_at DESC,
                            p.id DESC
                        LIMIT 1
                        `
                    )
                    .get(
                        verification.customerEmail
                    );

                if (pendingPayment) {
                    db.prepare(
                        `
                        UPDATE payments
                        SET
                            provider_order_id = ?,
                            provider_order_number = ?,
                            updated_at = ?,
                            raw_callback = ?
                        WHERE id = ?
                          AND access_granted_at
                                IS NULL
                        `
                    ).run(
                        verification.orderId,
                        verification.orderNumber,
                        new Date().toISOString(),
                        JSON.stringify(fullOrder),
                        pendingPayment.id
                    );
                }

                console.log(
                    "⏳ [1KOSZYK] Zamówienie " +
                    `${orderNumber} ma status ` +
                    `${verification.paymentState}.`
                );

                return res
                    .status(200)
                    .type("text/plain")
                    .send("OK");
            }

            const result =
                grantPremiumForOneCartOrder(
                    verification,
                    fullOrder
                );

            if (
                result.status ===
                "already_granted"
            ) {
                console.log(
                    "ℹ️ [1KOSZYK] Dostęp był " +
                    "już przyznany dla zamówienia " +
                    `${orderNumber}.`
                );
            } else {
                console.log(
                    "✅ [1KOSZYK PREMIUM]",
                    {
                        orderNumber,
                        paymentId:
                            result.paymentId,
                        userId:
                            result.userId,
                        username:
                            result.username,
                        accessExpiresAt:
                            result.accessExpiresAt
                    }
                );
            }

            return res
                .status(200)
                .type("text/plain")
                .send("OK");

        } catch (error) {
            console.error(
                "❌ [1KOSZYK CALLBACK] Błąd:",
                error
            );

            /*
             * 500 spowoduje ponowienie callbacka,
             * co jest pożądane przy tymczasowym
             * błędzie API lub bazy danych.
             */
            return res
                .status(500)
                .type("text/plain")
                .send("ERROR");
        }
    }
);


app.get(
    "/api/premium/discord-invite",
    requireLoggedInUser,
    (req, res) => {
        try {
            const user = db
                .prepare(
                    `
                    SELECT
                        id,
                        username,
                        role,
                        access_expires_at
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(req.session.user.id);

            if (!user) {
                return res.status(404).json({
                    error:
                        "Nie znaleziono konta użytkownika."
                });
            }

            const accessInfo =
                getAccessInfo(user);

            if (
                !accessInfo.hasPremiumAccess
            ) {
                return res.status(403).json({
                    error:
                        "Serwer Discord jest dostępny wyłącznie dla użytkowników Premium.",
                    requiresPremium: true
                });
            }

            const inviteUrl = String(
                process.env
                    .DISCORD_PREMIUM_INVITE_URL ||
                ""
            ).trim();

            if (!inviteUrl) {
                console.error(
                    "❌ [DISCORD PREMIUM] " +
                    "Brak DISCORD_PREMIUM_INVITE_URL."
                );

                return res.status(503).json({
                    error:
                        "Zaproszenie Discord jest obecnie niedostępne."
                });
            }

            let parsedUrl;

            try {
                parsedUrl = new URL(
                    inviteUrl
                );
            } catch {
                console.error(
                    "❌ [DISCORD PREMIUM] " +
                    "Nieprawidłowy adres zaproszenia."
                );

                return res.status(500).json({
                    error:
                        "Zaproszenie Discord ma nieprawidłową konfigurację."
                });
            }

            const allowedHosts = new Set([
                "discord.gg",
                "discord.com",
                "www.discord.com"
            ]);

            if (
                parsedUrl.protocol !==
                    "https:" ||
                !allowedHosts.has(
                    parsedUrl.hostname
                        .toLowerCase()
                )
            ) {
                console.error(
                    "❌ [DISCORD PREMIUM] " +
                    "Adres nie prowadzi do Discorda."
                );

                return res.status(500).json({
                    error:
                        "Zaproszenie Discord ma nieprawidłową konfigurację."
                });
            }

            console.log(
                "💬 [DISCORD PREMIUM] " +
                `Użytkownik ${user.id} ` +
                `(${user.username}) pobrał zaproszenie.`
            );

            return res.json({
                success: true,
                inviteUrl:
                    parsedUrl.toString()
            });

        } catch (error) {
            console.error(
                "❌ [DISCORD PREMIUM] Błąd:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się pobrać zaproszenia Discord."
            });
        }
    }
);

app.get(
    "/api/payments/config",
    (req, res) => {
        return res.json({
            price: Number(
                process.env.ONECART_ACCESS_PRICE || 50
            ),
            currency: "PLN",
            accessDays: Number(
                process.env.ONECART_ACCESS_DAYS || 30
            )
        });
    }
);

app.post(
    "/api/payments/1koszyk/start",
    requireLoggedInUser,
    (req, res) => {
        try {
            const user = db
                .prepare(
                    `
                    SELECT
                        id,
                        username,
                        email,
                        email_verified,
                        role,
                        access_expires_at
                    FROM users
                    WHERE id = ?
                    `
                )
                .get(req.session.user.id);

            if (!user) {
                return res.status(404).json({
                    error:
                        "Nie znaleziono konta użytkownika."
                });
            }

            if (!user.email) {
                return res.status(400).json({
                    error:
                        "Przed zakupem dodaj adres e-mail w ustawieniach konta."
                });
            }

            if (!Boolean(user.email_verified)) {
                return res.status(400).json({
                    error:
                        "Przed zakupem zweryfikuj adres e-mail przypisany do konta."
                });
            }

            const productUrl = String(
                process.env.ONECART_PRODUCT_URL || ""
            ).trim();

            if (!productUrl) {
                console.error(
                    "❌ [1KOSZYK] Brak ONECART_PRODUCT_URL."
                );

                return res.status(503).json({
                    error:
                        "Płatności są obecnie niedostępne."
                });
            }

            const price = Number(
                process.env.ONECART_ACCESS_PRICE || 50
            );

            const accessDays = Number(
                process.env.ONECART_ACCESS_DAYS || 30
            );

            if (
                !Number.isFinite(price) ||
                price <= 0 ||
                !Number.isInteger(accessDays) ||
                accessDays <= 0
            ) {
                console.error(
                    "❌ [1KOSZYK] Nieprawidłowa konfiguracja ceny lub czasu dostępu."
                );

                return res.status(500).json({
                    error:
                        "Płatności mają nieprawidłową konfigurację."
                });
            }

            const now = new Date().toISOString();

            /*
             * Anulujemy wyłącznie stare lokalne intencje,
             * które nie zostały jeszcze połączone
             * z zamówieniem operatora.
             */
            db.prepare(
                `
                UPDATE payments
                SET
                    status = 'cancelled',
                    updated_at = ?
                WHERE user_id = ?
                  AND provider = '1koszyk'
                  AND status = 'pending'
                  AND provider_order_id IS NULL
                  AND provider_order_number IS NULL
                `
            ).run(
                now,
                user.id
            );

            const result = db.prepare(
                `
                INSERT INTO payments (
                    user_id,
                    provider,
                    product_reference,
                    amount,
                    currency,
                    status,
                    created_at,
                    updated_at
                )
                VALUES (
                    ?,
                    '1koszyk',
                    ?,
                    ?,
                    'PLN',
                    'pending',
                    ?,
                    ?
                )
                `
            ).run(
                user.id,
                "dostep-na-30-dni",
                price.toFixed(2),
                now,
                now
            );

            console.log(
                `🛒 [1KOSZYK] Użytkownik ${user.id} ` +
                `rozpoczął zakup. ` +
                `Lokalna płatność: ${result.lastInsertRowid}.`
            );

            return res.json({
                success: true,
                paymentId:
                    Number(result.lastInsertRowid),
                checkoutUrl:
                    productUrl,
                price,
                currency:
                    "PLN",
                accessDays,
                requiredEmail:
                    user.email,
                message:
                    "W 1koszyk użyj tego samego adresu e-mail, który jest przypisany do Twojego konta."
            });

        } catch (error) {
            console.error(
                "❌ [1KOSZYK START] Błąd:",
                error
            );

            return res.status(500).json({
                error:
                    "Nie udało się rozpocząć zakupu."
            });
        }
    }
);

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

            let accessInfo = {
                hasPremiumAccess: false,
                accessType: "demo",
                accessExpiresAt: null
            };

            if (req.session.user) {
                const currentUser = db
                    .prepare(
                        `
                        SELECT
                            id,
                            role,
                            access_expires_at
                        FROM users
                        WHERE id = ?
                        `
                    )
                    .get(req.session.user.id);

                accessInfo = getAccessInfo(
                    currentUser
                );
            }

            const visibleMatches =
                accessInfo.hasPremiumAccess
                    ? matches
                    : getDemoMatches(matches);

            res.setHeader(
                "X-Access-Type",
                accessInfo.accessType
            );

            res.setHeader(
                "X-Total-Matches",
                String(matches.length)
            );

            res.setHeader(
                "X-Visible-Matches",
                String(visibleMatches.length)
            );

            return res.json(visibleMatches);
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
        `🩺 Walidator: ${VALIDATE_SCRIPT}`
    );

    console.log(
        `🔗 Łączenie: ${COMPARE_SCRIPT}`
    );
});

