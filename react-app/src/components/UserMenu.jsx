import { useEffect, useRef, useState } from "react";
import "./UserMenu.css";
import AccountSettings from "./AccountSettings";

export default function UserMenu() {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [premiumLoading, setPremiumLoading] = useState(false);
    const [premiumError, setPremiumError] = useState("");
    const menuRef = useRef(null);

    useEffect(() => {
        let active = true;

        fetch("http://localhost:3001/api/me", { credentials: "include" })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                if (!active) return;
                setUser(data.loggedIn && data.user ? data.user : null);
            })
            .catch((error) => {
                console.error("Błąd pobierania danych użytkownika:", error);
                if (active) setUser(null);
            })
            .finally(() => {
                if (active) setAuthLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key !== "Escape") return;
            setIsOpen(false);
            setShowSettings(false);
            setShowPremiumModal(false);
        };
        const handlePointerDown = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        document.addEventListener("mousedown", handlePointerDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("mousedown", handlePointerDown);
        };
    }, []);

    useEffect(() => {
        document.body.classList.toggle("modal-open", showPremiumModal || showSettings);
        return () => document.body.classList.remove("modal-open");
    }, [showPremiumModal, showSettings]);

    const handleOpenAdminPanel = () => {
        setIsOpen(false);
        window.location.href = "http://localhost:3001/admin.html";
    };

    const handleLogout = async () => {
        try {
            await fetch("http://localhost:3001/api/logout", {
                method: "POST",
                credentials: "include"
            });
        } finally {
            window.location.href = "http://localhost:3001/login.html";
        }
    };

    const handleBuyPremium = async () => {
        setPremiumError("");
        setPremiumLoading(true);
        try {
            const response = await fetch(
                "http://localhost:3001/api/payments/1koszyk/start",
                { method: "POST", credentials: "include" }
            );
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Nie udało się rozpocząć zakupu.");
            }
            window.location.href = data.checkoutUrl;
        } catch (error) {
            setPremiumError(error.message);
        } finally {
            setPremiumLoading(false);
        }
    };

    if (authLoading) return null;

    if (!user) {
        return (
            <div className="user-menu-container user-menu-container--logged-out">
                <button
                    type="button"
                    className="user-login-button"
                    onClick={() => {
                        window.location.href = "http://localhost:3001/login.html";
                    }}
                >
                    <span className="user-login-icon" aria-hidden="true">↪</span>
                    <span>Zaloguj się</span>
                </button>
            </div>
        );
    }

    const isAdmin = String(user.role || "").toLowerCase().trim() === "admin";
    const isDemo = !isAdmin && !user.hasPremiumAccess;
    const planLabel = isAdmin ? "ADMIN" : user.hasPremiumAccess ? "PREMIUM" : "DEMO";

    return (
        <div
            className={`user-menu-container ${user.hasPremiumAccess && !isAdmin ? "user-menu-container--premium" : ""}`}
            ref={menuRef}
        >
            <button
                type="button"
                className="user-menu-btn"
                onClick={() => setIsOpen((previous) => !previous)}
                aria-expanded={isOpen}
                aria-haspopup="menu"
            >
                <span className={`header-plan-badge header-plan-badge--${isAdmin ? "admin" : user.hasPremiumAccess ? "premium" : "demo"}`}>
                    {planLabel}
                </span>
                <span className="header-avatar" aria-hidden="true">
                    {String(user.username || "U").slice(0, 1).toUpperCase()}
                </span>
                <span className="header-user-name">{user.username}</span>
                <span className={`header-user-arrow ${isOpen ? "header-user-arrow--open" : ""}`}>⌄</span>
            </button>

            {isOpen && (
                <div className="dropdown-menu" role="menu">
                    <div className="dropdown-header">
                        <span className="dropdown-avatar" aria-hidden="true">
                            {String(user.username || "U").slice(0, 1).toUpperCase()}
                        </span>
                        <div><p>Zalogowano jako</p><strong>{user.username}</strong></div>
                    </div>

                    {isDemo && (
                        <button
                            type="button"
                            className="dropdown-premium-cta"
                            onClick={() => {
                                setIsOpen(false);
                                setPremiumError("");
                                setShowPremiumModal(true);
                            }}
                        >
                            <span className="dropdown-premium-icon">✨</span>
                            <span><strong>Przejdź na Premium</strong><small>Pełne mecze, okazje i Discord</small></span>
                            <b>→</b>
                        </button>
                    )}

                    <ul>
                        {isAdmin && (
                            <li onClick={handleOpenAdminPanel} className="admin-panel-btn" role="menuitem">
                                <span>🛠️</span> Panel administratora
                            </li>
                        )}
                        <li onClick={() => { setIsOpen(false); setShowSettings(true); }} role="menuitem">
                            <span>⚙️</span> Ustawienia konta
                        </li>
                        <li onClick={handleLogout} className="logout-btn" role="menuitem">
                            <span>↪</span> Wyloguj się
                        </li>
                    </ul>
                </div>
            )}

            {showSettings && (
                <AccountSettings user={user} onClose={() => setShowSettings(false)} />
            )}

            {showPremiumModal && (
                <div className="user-premium-overlay" onClick={() => setShowPremiumModal(false)}>
                    <section
                        className="user-premium-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="user-premium-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button type="button" className="user-premium-close" onClick={() => setShowPremiumModal(false)} aria-label="Zamknij">×</button>
                        <div className="user-premium-hero-icon">✨</div>
                        <span className="user-premium-label">PREMIUM</span>
                        <h2 id="user-premium-title">Odblokuj pełną wersję</h2>
                        <p>Zyskaj pełny dostęp do porównywarki i wszystkich funkcji aplikacji.</p>
                        <div className="user-premium-benefits">
                            <span>✓ Wszystkie dostępne mecze</span>
                            <span>✓ Pełna lista najlepszych okazji</span>
                            <span>✓ Dostęp do Discorda z alertami</span>
                            <span>✓ 30 dni aktywnego dostępu</span>
                        </div>
                        <div className="user-premium-price"><strong>50 zł</strong><span>za 30 dni</span></div>
                        <button type="button" className="user-premium-buy" onClick={handleBuyPremium} disabled={premiumLoading}>
                            {premiumLoading ? "Przygotowywanie płatności..." : "Odblokuj Premium"}
                        </button>
                        <button type="button" className="user-premium-later" onClick={() => setShowPremiumModal(false)}>Może później</button>
                        {premiumError && <p className="user-premium-error">{premiumError}</p>}
                    </section>
                </div>
            )}
        </div>
    );
}
