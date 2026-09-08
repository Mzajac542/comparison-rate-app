import { useEffect, useState } from "react";
import "./UserMenu.css";
import AccountSettings from "./AccountSettings";

export default function UserMenu() {
    const [user, setUser] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [showSettings, setShowSettings] =
        useState(false);

    useEffect(() => {
        fetch(
            "http://localhost:3001/api/me",
            {
                credentials: "include"
            }
        )
            .then((response) => response.json())
            .then((data) => {
                if (data.loggedIn) {
                    setUser(data.user);
                }
            })
            .catch((error) =>
                console.error(
                    "Błąd pobierania danych:",
                    error
                )
            );
    }, []);

    const handleOpenAdminPanel = () => {
        setIsOpen(false);

        window.location.href =
            "http://localhost:3001/admin.html";
    };

    const handleLogout = async () => {
        try {
            const response = await fetch(
                "http://localhost:3001/api/logout",
                {
                    method: "POST",
                    credentials: "include"
                }
            );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}`
                );
            }
        } catch (error) {
            console.error(
                "Błąd wylogowania:",
                error
            );
        } finally {
            window.location.href =
                "http://localhost:3001/login.html";
        }
    };

    if (!user) {
        return (
            <div className="user-menu-container">
                <button
                    onClick={() => {
                        window.location.href =
                            "http://localhost:3001/login.html";
                    }}
                    style={{
                        backgroundColor: "#3b82f6",
                        color: "#fff",
                        border: "none",
                        padding: "8px 15px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        transition:
                            "all 0.2s ease"
                    }}
                >
                    Zaloguj się
                </button>
            </div>
        );
    }

    const isAdmin =
        String(user.role || "")
            .toLowerCase()
            .trim() === "admin";

    return (
        <div className="user-menu-container">
            <button
                className="user-menu-btn"
                onClick={() =>
                    setIsOpen((previous) =>
                        !previous
                    )
                }
            >
                <span
                    className={
                        isAdmin
                            ? "header-plan-badge header-plan-badge--admin"
                            : user.hasPremiumAccess
                                ? "header-plan-badge header-plan-badge--premium"
                                : "header-plan-badge header-plan-badge--demo"
                    }
                >
                    {isAdmin
                        ? "ADMIN"
                        : user.hasPremiumAccess
                            ? "PREMIUM"
                            : "DEMO"}
                </span>

                <span className="header-user-name">
                    👤 {user.username}
                </span>

                <span className="header-user-arrow">
                    ▼
                </span>
            </button>

            {isOpen && (
                <div className="dropdown-menu">
                    <div className="dropdown-header">
                        <p>Zalogowano jako:</p>

                        <div className="user-info-row">
                            <strong>
                                {user.username}
                            </strong>

                            <span className="badge">
                                {user.role}
                            </span>
                        </div>
                    </div>

                    <hr />

                    <ul>
                        {isAdmin && (
                            <li
                                onClick={
                                    handleOpenAdminPanel
                                }
                                className="admin-panel-btn"
                            >
                                🛠️ Panel administratora
                            </li>
                        )}

                        <li
                            onClick={() => {
                                setIsOpen(false);
                                setShowSettings(true);
                            }}
                        >
                            ⚙️ Ustawienia konta
                        </li>

                        <li
                            onClick={handleLogout}
                            className="logout-btn"
                        >
                            🚪 Wyloguj się
                        </li>
                    </ul>
                </div>
            )}

            {showSettings && (
                <AccountSettings
                    user={user}
                    onClose={() =>
                        setShowSettings(false)
                    }
                />
            )}
        </div>
    );
}