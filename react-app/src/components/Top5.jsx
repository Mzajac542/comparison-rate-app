import React from 'react';

export default function Top5({ items, onSelect }) {
    if (!items || items.length === 0) {
        return (
            <div style={{ padding: "20px", color: "#aaa", textAlign: "center" }}>
                Brak danych do wyliczenia TOP 5. <br/>
                (Brak meczów występujących jednocześnie u obu bukmacherów).
            </div>
        );
    }

    return (
        <div className="top5-container">
            {items.map((item, index) => (
                <div 
                    key={index} 
                    className="top5-item"
                    onClick={() => onSelect(item)}
                    style={{
                        padding: "15px",
                        borderBottom: "1px solid #333",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <div>
                        <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1em", color: "#fff" }}>
                            <span style={{ color: "#3b82f6", marginRight: "10px" }}>#{index + 1}</span>
                            {item.match}
                        </h3>
                        <div style={{ fontSize: "0.85em", color: "#888" }}>
                            {item.sport} | {item.date || "Brak daty"}
                        </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#10b981", fontWeight: "bold", fontSize: "1.2em", marginBottom: "5px" }}>
                            Różnica: {item.maxDiff.toFixed(2)}
                        </div>
                        <div style={{ fontSize: "0.85em", color: "#aaa" }}>
                            Typ: <strong style={{color: "#fff"}}>{item.bestOutcome}</strong> 
                            <br/>
                            (Betclic: <span style={{color: item.bOdd > item.sOdd ? '#10b981' : '#aaa'}}>{item.bOdd}</span> | 
                            Superbet: <span style={{color: item.sOdd > item.bOdd ? '#10b981' : '#aaa'}}>{item.sOdd}</span>)
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}