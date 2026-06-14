import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './UserMenu.css';

export default function UserMenu() {
    const [user, setUser] = useState(null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // Pobierz aktualną sesję
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });

        // Nasłuchuj zmian
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    if (!user) {
        return <button onClick={() => window.location.href = '/login.html'}>Zaloguj się</button>;
    }

    return (
        <div className="user-menu-container">
            <button className="user-menu-btn" onClick={() => setIsOpen(!isOpen)}>👤 {user.email} ▼</button>
            {isOpen && (
                <div className="dropdown-menu">
                    <p>Zalogowano jako: <strong>{user.email}</strong></p>
                    <button onClick={handleLogout}>Wyloguj się</button>
                </div>
            )}
        </div>
    );
}