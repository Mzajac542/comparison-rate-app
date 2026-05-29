import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

// Ustawienie poprawnej ścieżki do folderu data (poza data-pipeline)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../data/users.db");

const db = new Database(dbPath);

async function createAdmin() {
    // 1. Upewnij się, że tabela istnieje
    db.exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user'
    )`);

    const username = 'admin';
    const password = 'qwerty1357@';
    
    const hash = await bcrypt.hash(password, 10);
    
    try {
        const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        stmt.run(username, hash, 'admin');
        console.log(`✅ Sukces! Administrator '${username}' został utworzony.`);
    } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            console.error("❌ Błąd: Użytkownik 'admin' już istnieje.");
        } else {
            console.error("❌ Wystąpił błąd:", e.message);
        }
    }
}

createAdmin();