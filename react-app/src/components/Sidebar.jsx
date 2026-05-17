function Sidebar({ sports, selectedSport, onSelectSport }) {
  return (
    <div>
      <h3>Sporty</h3>
      <ul>
        {sports.map((sport) => (
          <li
            key={sport}
            className={sport === selectedSport ? "active" : ""}
            onClick={() => onSelectSport(sport)}
          >
            {sport}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Sidebar;
