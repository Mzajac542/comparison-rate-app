import { useState, useEffect } from 'react';
import './UserMenu.css';
import AccountSettings from './AccountSettings';

export default function UserMenu() {
    // ✅ Wszystkie stany muszą być W ŚRODKU funkcji!
    const [user, setUser] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Pobieranie danych użytkownika po załadowaniu strony
    useEffect(() => {
        // Ważne: "credentials: 'include'" pozwala wysłać ciasteczko sesji do serwera!
        fetch('http://localhost:3001/api/me', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.loggedIn) {
                    setUser(data.user);
                }
            })
            .catch(err => console.error("Błąd pobierania danych:", err));
    }, []);

    const handleLogout = async () => {
        await fetch('http://localhost:3001/api/logout', { 
            method: 'POST', 
            credentials: 'include' 
        });
        // Przekierowanie na stronę logowania po wylogowaniu
        window.location.href = 'http://localhost:3001/login.html';
    };

    // Jeśli nikt nie jest zalogowany, nie pokazujemy menu
    if (!user) return null;

    return (
        <div className="user-menu-container">
            <button 
                className="user-menu-btn" 
                onClick={() => setIsOpen(!isOpen)}
            >
                👤 {user.username} ▼
            </button>

            {isOpen && (
                <div className="dropdown-menu">
                    <div className="dropdown-header">
                        <p>Zalogowano jako:</p>
                        <strong>{user.username}</strong>
                        <span className="badge">{user.role}</span>
                    </div>
                    <hr />
                    <ul>
                        <li onClick={() => { setIsOpen(false); setShowSettings(true); }}>⚙️ Ustawienia konta</li>
                        <li onClick={handleLogout} className="logout-btn">🚪 Wyloguj się</li>
                    </ul>
                </div>
            )}

            {/* Wyświetlanie modala Ustawień, jeśli showSettings === true */}
            {showSettings && (
                <AccountSettings 
                    user={user} 
                    onClose={() => setShowSettings(false)} 
                />
            )}
        </div>
    );
}