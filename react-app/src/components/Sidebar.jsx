function Sidebar({ sports, onSelectSport }) {
  return (
    <div>
      <h3>Sporty</h3>
      <ul>
        {sports.map((sport) => (
          <li
            key={sport}
            style={{ cursor: "pointer" }}
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