import { useState } from "react";
import "./AccountSettings.css";

const maskEmail = (value) => {
    const email = String(value || "").trim();
    const separator = email.indexOf("@");

    if (separator <= 0) {
        return "Nie przypisano";
    }

    const local = email.slice(0, separator);
    const domain = email.slice(separator + 1);
    const visibleStart = local.slice(0, Math.min(3, local.length));
    const hiddenLength = Math.max(4, local.length - visibleStart.length);

    return `${visibleStart}${"*".repeat(hiddenLength)}@${domain}`;
};

export default function AccountSettings({ user, onClose }) {
    const [activeTab, setActiveTab] =
        useState("account");

    const [showFullEmail, setShowFullEmail] =
        useState(false);



    const [oldPassword, setOldPassword] =
        useState("");

    const [newPassword, setNewPassword] =
        useState("");

    const [confirmNewPassword, setConfirmNewPassword] =
        useState("");

    const [passwordEmail, setPasswordEmail] =
        useState(user?.email || "");


    const [showPasswordForm, setShowPasswordForm] =
        useState(false);

    const [message, setMessage] =
        useState("");

    const [error, setError] =
        useState("");

    const clearMessages = () => {
        setMessage("");
        setError("");
    };

    const handleTabChange = (tab) => {
        clearMessages();
        setActiveTab(tab);
    };

    const handleRequestEmailChange = async () => {
        clearMessages();

        try {
            const response = await fetch(
                "http://localhost:3001/api/account/email-change/request",
                {
                    method: "POST",
                    credentials: "include"
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Nie udało się wysłać linku zmiany adresu."
                );
            }

            setMessage(data.message);
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    const handleChangePassword = async (event) => {
        event.preventDefault();
        clearMessages();

        if (newPassword.length < 6) {
            setError(
                "Nowe hasło musi mieć co najmniej 6 znaków."
            );
            return;
        }

        if (newPassword !== confirmNewPassword) {
            setError("Nowe hasła nie są identyczne.");
            return;
        }

        try {
            const response = await fetch(
                "http://localhost:3001/api/change-password",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        email: passwordEmail,
                        oldPassword,
                        newPassword,
                        confirmPassword: confirmNewPassword
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Nie udało się zmienić hasła."
                );
            }

            setOldPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
            setShowPasswordForm(false);
            setMessage(
                data.message ||
                "Hasło zostało zmienione."
            );
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    const accessLabel =
        user?.accessType === "admin"
            ? "ADMIN"
            : user?.hasPremiumAccess
                ? "PREMIUM"
                : "DEMO";

    return (
        <div
            className="settings-overlay"
            onClick={onClose}
        >
            <div
                className="settings-modal"
                onClick={(event) =>
                    event.stopPropagation()
                }
            >
                <div className="settings-header">
                    <h2>Ustawienia konta</h2>

                    <button
                        type="button"
                        className="close-btn"
                        onClick={onClose}
                        aria-label="Zamknij ustawienia"
                    >
                        ×
                    </button>
                </div>

                <div className="settings-tabs">
                    <button
                        type="button"
                        className={
                            activeTab === "account"
                                ? "settings-tab settings-tab--active"
                                : "settings-tab"
                        }
                        onClick={() =>
                            handleTabChange("account")
                        }
                    >
                        Konto
                    </button>

                    <button
                        type="button"
                        className={
                            activeTab === "security"
                                ? "settings-tab settings-tab--active"
                                : "settings-tab"
                        }
                        onClick={() =>
                            handleTabChange("security")
                        }
                    >
                        Dane i bezpieczeństwo
                    </button>
                </div>

                <div className="settings-content">
                    {message && (
                        <p className="msg success-msg">
                            {message}
                        </p>
                    )}

                    {error && (
                        <p className="msg error-msg">
                            {error}
                        </p>
                    )}

                    {activeTab === "account" && (
                        <div className="account-overview">
                            <div className="account-overview-card">
                                <span className="account-overview-label">
                                    Nazwa użytkownika
                                </span>
                                <strong>
                                    {user?.username || "Brak"}
                                </strong>
                            </div>

                            <div className="account-overview-card">
                                <span className="account-overview-label">
                                    Rola w systemie
                                </span>
                                <strong>
                                    {String(
                                        user?.role || "user"
                                    ).toUpperCase()}
                                </strong>
                            </div>

                            <div className="account-overview-card">
                                <span className="account-overview-label">
                                    Rodzaj dostępu
                                </span>
                                <strong>{accessLabel}</strong>
                            </div>

                            {user?.hasPremiumAccess &&
                             user?.accessExpiresAt && (
                                <div className="account-overview-card">
                                    <span className="account-overview-label">
                                        Dostęp ważny do
                                    </span>
                                    <strong>
                                        {new Date(
                                            user.accessExpiresAt
                                        ).toLocaleString("pl-PL")}
                                    </strong>
                                </div>
                            )}

                            <div className="account-overview-card account-email-card">
                                <span className="account-overview-label">
                                    Adres e-mail
                                </span>

                                <div className="account-email-value">
                                    <strong>
                                        {showFullEmail
                                            ? user?.email || "Nie przypisano"
                                            : maskEmail(user?.email)}
                                    </strong>

                                    {user?.email && (
                                        <button
                                            type="button"
                                            className="email-visibility-button"
                                            onClick={() =>
                                                setShowFullEmail(
                                                    (previous) => !previous
                                                )
                                            }
                                            aria-pressed={showFullEmail}
                                        >
                                            {showFullEmail ? "Ukryj" : "Pokaż"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="account-overview-card">
                                <span className="account-overview-label">
                                    Hasło
                                </span>
                                <strong className="masked-password">
                                    ••••••••••••
                                </strong>
                            </div>
                        </div>
                    )}

                    {activeTab === "security" && (
                        <div className="security-sections">
                            <section className="security-card">
                                <div className="security-card-header">
                                    <div>
                                        <h3>Adres e-mail</h3>
                                        <p>Aktualnie przypisany adres:</p>
                                        <strong>
                                            {maskEmail(user?.email)}
                                        </strong>
                                    </div>

                                    <button
                                        type="button"
                                        className="security-action-button"
                                        onClick={handleRequestEmailChange}
                                    >
                                        Zmień e-mail
                                    </button>
                                </div>

                                <p className="email-change-hint">
                                    Link do ustawienia nowego adresu zostanie wysłany na aktualną skrzynkę. Link będzie ważny przez 30 minut.
                                </p>
                            </section>

                            <section className="security-card">
                                <div className="security-card-header">
                                    <div>
                                        <h3>Hasło</h3>
                                        <p>Aktualne hasło:</p>
                                        <strong className="masked-password">
                                            ••••••••••••
                                        </strong>
                                    </div>

                                    <button
                                        type="button"
                                        className="security-action-button"
                                        onClick={() => {
                                            clearMessages();
                                            setShowPasswordForm(
                                                (previous) => !previous
                                            );
                                        }}
                                    >
                                        {showPasswordForm
                                            ? "Anuluj"
                                            : "Zmień hasło"}
                                    </button>
                                </div>

                                {showPasswordForm && (
                                    <form
                                        className="security-form"
                                        onSubmit={handleChangePassword}
                                    >
                                        <div className="form-group">
                                            <label>Adres e-mail konta</label>
                                            <input
                                                type="email"
                                                value={passwordEmail}
                                                onChange={(event) =>
                                                    setPasswordEmail(
                                                        event.target.value
                                                    )
                                                }
                                                required
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Obecne hasło</label>
                                            <input
                                                type="password"
                                                value={oldPassword}
                                                onChange={(event) =>
                                                    setOldPassword(
                                                        event.target.value
                                                    )
                                                }
                                                required
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Nowe hasło</label>
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(event) =>
                                                    setNewPassword(
                                                        event.target.value
                                                    )
                                                }
                                                minLength={6}
                                                required
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Powtórz nowe hasło</label>
                                            <input
                                                type="password"
                                                value={confirmNewPassword}
                                                onChange={(event) =>
                                                    setConfirmNewPassword(
                                                        event.target.value
                                                    )
                                                }
                                                minLength={6}
                                                required
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            className="save-btn"
                                        >
                                            Zmień hasło
                                        </button>
                                    </form>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
