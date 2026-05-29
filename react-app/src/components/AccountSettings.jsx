import { useState } from 'react';
import './AccountSettings.css';

export default function AccountSettings({ user, onClose }) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

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