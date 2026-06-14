import React, { useState, useEffect } from 'react';

// Słownik czasów trwania meczów w minutach dla poszczególnych dyscyplin
const SPORT_DURATIONS = {
  "piłka nożna": 120,
  "⚽ piłka nożna": 120,
  "tenis": 150,
  "🎾 tenis": 150,
  "koszykówka": 120,
  "🏀 koszykówka": 120,
  "siatkówka": 120,
  "🏐 siatkówka": 120,
  "piłka ręczna": 120,
  "🏐 piłka ręczna": 120,
  "hokej": 150
};

// Pancerna funkcja wyliczająca status na podstawie czasu systemowego
const getMatchStatus = (match) => {
  let dateStr = match.dzien || match.date;
  let timeStr = match.godzina || match.time || "00:00";
  
  if (!dateStr) return { text: "ZAPLANOWANY", color: "#718096" };

  dateStr = String(dateStr).trim();
  timeStr = String(timeStr).trim();

  let year, month, day;
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
    return { text: "ZAPLANOWANY", color: "#718096" };
  }

  const timeParts = timeStr.split(':');
  const hours = parseInt(timeParts[0], 10) || 0;
  const minutes = parseInt(timeParts[1], 10) || 0;

  const matchStart = new Date(year, month - 1, day, hours, minutes, 0);
  if (isNaN(matchStart.getTime())) return { text: "ZAPLANOWANY", color: "#718096" };

  const now = new Date();
  const diffInMinutes = (now - matchStart) / 1000 / 60;

  const sportKey = String(match.dyscyplina || match.sport || "").toLowerCase().trim();
  const duration = SPORT_DURATIONS[sportKey] || 120;

  if (diffInMinutes < 0) {
    const isToday = matchStart.getFullYear() === now.getFullYear() &&
                    matchStart.getMonth() === now.getMonth() &&
                    matchStart.getDate() === now.getDate();
                    
    return isToday ? { text: "OCZEKUJE", color: "#ffa500" } : { text: "ZAPLANOWANY", color: "#718096" };
  } else if (diffInMinutes >= 0 && diffInMinutes < duration) {
    return { text: "LIVE", color: "#e53e3e" };
  } else {
    return { text: "ZAKOŃCZONO", color: "#4a5568" };
  }
};

function formatSimpleDate(dateString) {
  if (!dateString) return "-";
  if (dateString === "Jutro" || dateString === "Pojutrze") return dateString;

  if (dateString.includes("-") && dateString.length === 10) {
    const [year, month, day] = dateString.split("-");
    return `${day}.${month}.${year}`;
  }

  return dateString;
}

function MatchDetails({ match }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  if (!match) {
    return <div style={{ color: "#aaa", padding: "10px" }}>Wybierz mecz</div>;
  }

  const matchTime = match.time || match.godzina || "";
  const status = getMatchStatus(match);

  return (
    <div style={{ color: "white" }}>
      <p>
        <strong>Status:</strong>{" "}
        <span style={{ 
          backgroundColor: status.color, 
          padding: "3px 8px", 
          borderRadius: "4px", 
          fontWeight: "bold",
          fontSize: "12px",
          color: "#fff"
        }}>
          {status.text}
        </span>
      </p>
      
      <p><strong>Sport:</strong> {match.sport || match.dyscyplina || "-"}</p>
      <p><strong>Kraj:</strong> {match.country || "-"}</p>
      <p><strong>Data:</strong> {formatSimpleDate(match.date || match.dzien)}{matchTime ? `, ${matchTime}` : ''}</p>
      <p><strong>Mecz:</strong> {match.match || match.mecz || "-"}</p>
    </div>
  );
}

export default MatchDetails;