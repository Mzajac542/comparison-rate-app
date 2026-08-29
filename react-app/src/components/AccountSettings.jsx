import { useState } from 'react';
import './AccountSettings.css';

export default function AccountSettings({ user, onClose }) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [email, setEmail] =
    useState(user?.email || "");

    const [emailPassword, setEmailPassword] =
        useState("");

    
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