import { useState } from 'react';
import './AccountSettings.css';

export default function AccountSettings({ user, onClose }) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [email, setEmail] =
    useState(user?.email || "");
    const [purchaseLoading, setPurchaseLoading] =
        useState(false);

    const [emailPassword, setEmailPassword] =
        useState("");

    const handleStartPurchase = async () => {
        setMessage("");
        setError("");
        setPurchaseLoading(true);

        try {
            const response = await fetch(
                "http://localhost:3001/api/payments/1koszyk/start",
                {
                    method: "POST",
                    credentials: "include"
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Nie udało się rozpocząć zakupu."
                );
            }

            const confirmed = window.confirm(
                `Za chwilę przejdziesz do płatności 1koszyk.\n\n` +
                `Cena: ${data.price.toFixed(2)} ${data.currency}\n` +
                `Dostęp: ${data.accessDays} dni\n\n` +
                `W formularzu zakupu użyj dokładnie adresu:\n` +
                `${data.requiredEmail}\n\n` +
                `Czy przejść do płatności?`
            );

            if (!confirmed) {
                return;
            }

            window.location.href =
                data.checkoutUrl;

        } catch (requestError) {
            setError(
                requestError.message
            );
        } finally {
            setPurchaseLoading(false);
        }
    };
    
    const handleSaveEmail = async (event) => {
        event.preventDefault();

        setMessage("");
        setError("");

        try {
            const response = await fetch(
                "http://localhost:3001/api/account/email",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        email,
                        password:
                            emailPassword
                    })
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Nie udało się zapisać adresu e-mail."
                );
            }

            setEmail(data.email);
            setEmailPassword("");
            setMessage(data.message);

        } catch (requestError) {
            setError(
                requestError.message
            );
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setMessage('');
        setError('');

        if (newPassword.length < 6) {
            return setError("Nowe hasło musi mieć co najmniej 6 znaków.");
        }

        try {
            const res = await fetch('http://localhost:3001/api/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ oldPassword, newPassword })
            });

            const data = await res.json();

            if (res.ok) {
                setMessage(data.message);
                setOldPassword('');
                setNewPassword('');
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError("Błąd połączenia z serwerem.");
        }
    };

    return (
        <div className="settings-overlay">
            <div className="settings-modal">
                <div className="settings-header">
                    <h2>Ustawienia konta</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
                
                <div className="settings-content">
                    <div className="info-group">
                        <label>Nazwa użytkownika (Login)</label>
                        <input type="text" value={user.username} disabled className="disabled-input" />
                    </div>
                    
                    <div className="info-group">
                        <label>Rola w systemie</label>
                        <input type="text" value={user.role.toUpperCase()} disabled className="disabled-input" />
                    </div>
                    <form
                        onSubmit={handleSaveEmail}
                        className="email-form"
                    >
                        <div className="form-group">
                            <label>
                                Adres e-mail do odzyskiwania konta
                            </label>

                            <input
                                type="email"
                                value={email}
                                onChange={(event) =>
                                    setEmail(
                                        event.target.value
                                    )
                                }
                                placeholder="twoj@email.pl"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>
                                Potwierdź hasłem
                            </label>

                            <input
                                type="password"
                                value={emailPassword}
                                onChange={(event) =>
                                    setEmailPassword(
                                        event.target.value
                                    )
                                }
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="save-email-btn"
                        >
                            Zapisz adres e-mail
                        </button>
                    </form>
                    <hr />
                    <section className="premium-section">
                        <div className="premium-section__header">
                            <div>
                                <h3>Dostęp Premium</h3>

                                <p>
                                    Pełna wersja aplikacji przez 30 dni.
                                    Zakup jednorazowy, bez automatycznego
                                    odnawiania.
                                </p>
                            </div>

                            <span
                                className={
                                    user?.hasPremiumAccess
                                        ? "premium-status premium-status--active"
                                        : "premium-status premium-status--demo"
                                }
                            >
                                {user?.accessType === "admin"
                                    ? "ADMIN"
                                    : user?.hasPremiumAccess
                                        ? "PREMIUM"
                                        : "DEMO"}
                            </span>
                        </div>

                        {user?.hasPremiumAccess &&
                        user?.accessType !== "admin" &&
                        user?.accessExpiresAt && (
                            <p className="premium-expiration">
                                Dostęp ważny do:{" "}
                                <strong>
                                    {new Date(
                                        user.accessExpiresAt
                                    ).toLocaleString("pl-PL")}
                                </strong>
                            </p>
                        )}

                        {user?.accessType !== "admin" && (
                            <>
                                <div className="premium-price">
                                    <strong>50 zł</strong>
                                    <span>za 30 dni</span>
                                </div>

                                <button
                                    type="button"
                                    className="premium-buy-button"
                                    onClick={handleStartPurchase}
                                    disabled={purchaseLoading}
                                >
                                    {purchaseLoading
                                        ? "Przygotowywanie zakupu..."
                                        : user?.hasPremiumAccess
                                            ? "Przedłuż dostęp o 30 dni"
                                            : "Kup dostęp na 30 dni"}
                                </button>

                                <p className="premium-email-hint">
                                    Podczas zakupu użyj adresu:
                                    <strong>
                                        {" "}
                                        {user?.email || "brak adresu e-mail"}
                                    </strong>
                                </p>
                            </>
                        )}
                    </section>
                    <h3>Zmiana hasła</h3>
                    <form onSubmit={handleChangePassword}>
                        <div className="form-group">
                            <label>Obecne hasło</label>
                            <input 
                                type="password" 
                                value={oldPassword} 
                                onChange={(e) => setOldPassword(e.target.value)} 
                                required 
                            />
                        </div>
                        <div className="form-group">
                            <label>Nowe hasło</label>
                            <input 
                                type="password" 
                                value={newPassword} 
                                onChange={(e) => setNewPassword(e.target.value)} 
                                required 
                            />
                        </div>
                        
                        {error && <p className="msg error-msg">{error}</p>}
                        {message && <p className="msg success-msg">{message}</p>}
                        
                        <button type="submit" className="save-btn">Zmień hasło</button>
                    </form>
                </div>
            </div>
        </div>
    );
}