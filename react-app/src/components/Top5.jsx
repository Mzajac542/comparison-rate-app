function Top5({ items, onSelect }) {
  if (!items || items.length === 0) {
    return <p>Brak danych do wyliczenia TOP 5</p>;
  }

  return (
    <div>
      <h3>TOP 5 najlepszych okazji</h3>
      <ol>
        {items.map((item) => (
          <li
            key={item.id}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(item)}
          >
            {item.name} (spread: {item.spread.toFixed(2)})
          </li>
        ))}
      </ol>
    </div>
  );
}

export default Top5;