import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SPORT_ICONS = {
  "Piłka nożna": "⚽",
  "Koszykówka": "🏀",
  "Tenis": "🎾",
  "Piłka ręczna": "🤾",
  "Boks": "🥊"
};


function Sidebar({ sports, matches, selectedSport, selectedLeague, onSelectSport, onSelectLeague, showOnlyCommon, onToggleCommon }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [showPremiumMessage, setShowPremiumMessage] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [discordError, setDiscordError] = useState("");

  useEffect(() => {
    let active = true;

    fetch("http://localhost:3001/api/me", {
      credentials: "include"
    })
      .then((response) => response.json())
      .then((data) => {
        if (active) {
          setCurrentUser(data.loggedIn ? data.user : null);
        }
      })
      .catch((error) => {
        console.error("Błąd pobierania użytkownika:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleOpenDiscord = async () => {
    setDiscordError("");

    if (!currentUser) {
      window.location.href = "http://localhost:3001/login.html";
      return;
    }

    if (!currentUser.hasPremiumAccess) {
      setShowPremiumMessage(true);
      return;
    }

    setDiscordLoading(true);

    try {
      const response = await fetch(
        "http://localhost:3001/api/premium/discord-invite",
        { credentials: "include" }
      );
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 || data.requiresPremium) {
          setShowPremiumMessage(true);
          return;
        }
        throw new Error(data.error || "Nie udało się otworzyć Discorda.");
      }

      window.open(data.inviteUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setDiscordError(error.message);
    } finally {
      setDiscordLoading(false);
    }
  };

  const handleBuyPremium = async () => {
    setDiscordError("");
    setDiscordLoading(true);

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
      setDiscordError(error.message);
    } finally {
      setDiscordLoading(false);
    }
  };
  
  // Funkcja grupująca i zliczająca mecze dla wybranego sportu (TYLKO jeśli mają zapisaną ligę)
  const getLeaguesForSport = (sportName) => {
    const sportMatches = matches.filter(m => m.sport === sportName);
    const counts = {};

    sportMatches.forEach(m => {
      // Dodajemy do listy tylko wtedy, gdy mecz faktycznie posiada nazwę ligi
      if (m.league && m.league.trim() !== "") {
        counts[m.league] = (counts[m.league] || 0) + 1;
      }
    });

    // Sortujemy alfabetycznie, żeby ładnie wyglądało na liście
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // Funkcja zliczająca WSZYSTKIE mecze w danej dyscyplinie (do przycisku "Wszystkie")
  const getSportTotalCount = (sportName) => {
    return matches.filter(m => m.sport === sportName).length;
  };

  return (
    <div className="sidebar-container">
      
      {/* PRZEŁĄCZNIK "WSPÓLNE KURSY" (Customowy Toggle) */}
      <div
        style={{
          padding: "12px 15px",
          backgroundColor: "#1e1e1e",
          borderRadius: "8px",
          border: "1px solid #333",
          marginBottom: "25px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          transition: "background 0.2s"
        }}
        onClick={onToggleCommon}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2a2a2a"}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1e1e1e"}
      >
        <span style={{ color: "#fff", fontWeight: "bold", fontSize: "0.85em", lineHeight: "1.2" }}>
          WSPÓLNE<br />KURSY
        </span>
        <div style={{
          position: "relative",
          width: "44px",
          height: "22px",
          backgroundColor: showOnlyCommon ? "#3b82f6" : "#444",
          borderRadius: "12px",
          transition: "background-color 0.3s"
        }}>
          <div style={{
            position: "absolute",
            top: "3px",
            left: showOnlyCommon ? "25px" : "3px",
            width: "16px",
            height: "16px",
            backgroundColor: "#fff",
            borderRadius: "50%",
            transition: "left 0.3s"
          }} />
        </div>
      </div>

      {/* LISTA SPORTÓW I LIG */}
      <h3 style={{ marginBottom: "15px", color: "#fff", fontSize: "1.1em", paddingLeft: "5px" }}>Sporty</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {sports.map(sport => {
          const isSelected = selectedSport === sport;
          const leagues = isSelected ? getLeaguesForSport(sport) : [];
          const totalSportCount = getSportTotalCount(sport); // Pobieramy sumę meczów

          return (
            <li key={sport} style={{ marginBottom: "5px" }}>
              {/* Główny przycisk Sportu */}
              <button
                onClick={() => {
                  onSelectSport(isSelected ? null : sport);
                  onSelectLeague(null); // Reset ligi przy zmianie sportu
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 15px",
                  backgroundColor: isSelected ? "#1f2937" : "transparent",
                  color: isSelected ? "#60a5fa" : "#aaa",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: isSelected ? "bold" : "normal",
                  transition: "all 0.2s"
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px"
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: "1.2em",
                      width: "22px",
                      textAlign: "center"
                    }}
                  >
                    {SPORT_ICONS[sport] || "🏆"}
                  </span>

                  <span>{sport}</span>
                </span>
              </button>

              {/* ROZWIJANA LISTA LIG (Pojawia się tylko gdy sport jest aktywny) */}
              {isSelected && (
                <ul style={{ listStyle: "none", padding: "8px 0 8px 15px", margin: 0 }}>
                  
                  {/* Przycisk "Wszystkie" (teraz z licznikiem) */}
                  <li style={{ marginBottom: "4px" }}>
                    <button
                      onClick={() => onSelectLeague(null)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 12px",
                        backgroundColor: selectedLeague === null ? "#064e3b" : "transparent",
                        color: selectedLeague === null ? "#fff" : "#888",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.9em",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "all 0.2s"
                      }}
                    >
                      <span>Wszystkie</span>
                      <span style={{ 
                        color: selectedLeague === null ? "#6ee7b7" : "#555",
                        fontSize: "0.9em",
                        fontWeight: "bold"
                      }}>
                        ({totalSportCount})
                      </span>
                    </button>
                  </li>
                  
                  {/* Pętla renderująca konkretne ligi z licznikami (ukryte dopóki skrypt ich nie pobierze) */}
                  {leagues.map(([leagueName, count]) => (
                    <li key={leagueName} style={{ marginBottom: "4px" }}>
                      <button
                        onClick={() => onSelectLeague(leagueName)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 12px",
                          backgroundColor: selectedLeague === leagueName ? "#064e3b" : "transparent",
                          color: selectedLeague === leagueName ? "#fff" : "#888",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.9em",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.2s"
                        }}
                      >
                        <span style={{ 
                          overflow: "hidden", 
                          textOverflow: "ellipsis", 
                          whiteSpace: "nowrap",
                          maxWidth: "75%"
                        }}>
                          {leagueName}
                        </span>
                        <span style={{ 
                          color: selectedLeague === leagueName ? "#6ee7b7" : "#555",
                          fontSize: "0.9em",
                          fontWeight: "bold"
                        }}>
                          ({count})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sidebar-discord-area">
        <button
          type="button"
          className="sidebar-discord-button sidebar-discord-button--icon"
          onClick={handleOpenDiscord}
          disabled={discordLoading}
          aria-label="Otwórz Discord Premium"
          title={
            currentUser?.hasPremiumAccess
              ? "Dołącz do Discorda Premium"
              : "Discord dostępny w planie Premium"
          }
        >
          <svg
            className="sidebar-discord-logo"
            viewBox="0 0 127.14 96.36"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0 105.89 105.89 0 0 0 19.39 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-9.39 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.35 2.66-2.07a75.57 75.57 0 0 0 64.32 0c.87.72 1.76 1.41 2.66 2.07a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 9.38 105.25 105.25 0 0 0 32.17-16.15c2.64-27.38-4.51-51.11-18.88-72.14ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.73 11.43-12.73S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.73 11.44-12.73S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"
            />
          </svg>

          {!currentUser?.hasPremiumAccess && (
            <span
              className="sidebar-discord-lock"
              aria-hidden="true"
            >
              🔒
            </span>
          )}
        </button>

        <button
          type="button"
          className="sidebar-about-button"
          onClick={() => setShowAboutModal(true)}
          aria-label="Dowiedz się więcej o aplikacji"
          title="Dowiedz się więcej"
        >
          <span className="sidebar-about-icon" aria-hidden="true">i</span>
          <span>Dowiedz się więcej</span>
        </button>

        {discordError && (
          <p className="sidebar-discord-error">{discordError}</p>
        )}
      </div>
      {showAboutModal && createPortal(
        <div
          className="about-app-overlay"
          onClick={() => setShowAboutModal(false)}
        >
          <section
            className="about-app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-app-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="about-app-close"
              onClick={() => setShowAboutModal(false)}
              aria-label="Zamknij"
            >
              ×
            </button>

            <header className="about-app-header">
              <span className="about-app-header-icon" aria-hidden="true">📊</span>
              <div>
                <span className="about-app-eyebrow">COMPARING RATES</span>
                <h2 id="about-app-title">Jak działa aplikacja?</h2>
                <p>
                  Aplikacja porównuje kursy bukmacherskie i pomaga szybko znaleźć
                  interesujące różnice pomiędzy ofertami.
                </p>
              </div>
            </header>

            <div className="about-app-grid">
              <article className="about-app-card">
                <span className="about-app-card-number">01</span>
                <div>
                  <h3>Pobieranie kursów</h3>
                  <p>
                    System pobiera aktualne kursy na 2 kolejne dni (jutro i poutrze) od polskich i zagranicznych
                    bukmacherów dla obslugiwanych dyscyplin
                  </p>
                </div>
              </article>

              <article className="about-app-card">
                <span className="about-app-card-number">02</span>
                <div>
                  <h3>Porównywanie ofert</h3>
                  <p>
                    Kursy są łączone według meczu, rynku i wyboru. Aplikacja
                    porównuje oferty Polska kontra zagranica oraz Polska kontra Polska.
                  </p>
                </div>
              </article>

              <article className="about-app-card">
                <span className="about-app-card-number">03</span>
                <div>
                  <h3>Wykrywanie okazji</h3>
                  <p>
                    Okazja pojawia się, gdy w polskim bukmacherze kurs jest wiekszy niż w zagranicznym o 15% lub więcej oraz
                    porównuje także polskich z polskimi i także znajduję w nich róznice gdy kurs jest większy lub równy o 15%
                  </p>
                </div>
              </article>

              <article className="about-app-card">
                <span className="about-app-card-number">04</span>
                <div>
                  <h3>Demo i Premium</h3>
                  <p>
                    Konto Demo otrzymuje ograniczony podgląd. Premium odblokowuje
                    wszystkie dostępne mecze, pełne porównania oraz dostęp do
                    społeczności Discord.
                  </p>
                </div>
              </article>

              <article className="about-app-card">
                <span className="about-app-card-number">05</span>
                <div>
                  <h3>Alerty Discord</h3>
                  <p>
                    Bot publikuje wykryte okazje na serwerze Discord. Dostęp do
                    zaproszenia mają użytkownicy z aktywnym Premium i administratorzy.
                  </p>
                </div>
              </article>

              <article className="about-app-card">
                <span className="about-app-card-number">06</span>
                <div>
                  <h3>Aktualność i weryfikacja</h3>
                  <p>
                    Dane przechodzą walidację przed publikacją. Gdy pobieranie nie
                    powiedzie się, aplikacja zachowuje poprzedni poprawny zestaw danych.
                  </p>
                </div>
              </article>
            </div>

            <div className="about-app-notice">
              <span aria-hidden="true">ℹ️</span>
              <p>
                Aplikacja służy do prezentowania i porównywania danych. Nie przyjmuje
                zakładów i nie gwarantuje wyniku wydarzenia. Kursy mogą zmieniać się
                pomiędzy kolejnymi aktualizacjami.
              </p>
            </div>

            <button
              type="button"
              className="about-app-finish"
              onClick={() => setShowAboutModal(false)}
            >
              Rozumiem
            </button>
          </section>
        </div>,
        document.body
      )}

      {showPremiumMessage && createPortal(
        <div
          className="premium-gate-overlay"
          onClick={() => setShowPremiumMessage(false)}
        >
          <div
            className="premium-gate-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="premium-gate-close"
              onClick={() => setShowPremiumMessage(false)}
              aria-label="Zamknij"
            >
              ×
            </button>

            <div className="premium-gate-icon">💬</div>
            <h3>Discord jest częścią Premium</h3>
            <p>
              Dołącz do serwera, na którym bot publikuje alerty oraz wykryte okazje.
            </p>

            <button
              type="button"
              className="premium-gate-buy"
              onClick={handleBuyPremium}
              disabled={discordLoading}
            >
              {discordLoading ? "Przygotowywanie..." : "Kup Premium"}
            </button>

            <button
              type="button"
              className="premium-gate-cancel"
              onClick={() => setShowPremiumMessage(false)}
            >
              Nie teraz
            </button>

            {discordError && (
              <p className="premium-gate-error">{discordError}</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Sidebar;