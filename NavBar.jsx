export default function NavBar({ screen, setScreen }) {
  const items = [
    { id: 'profile', label: 'Profil',   icon: '👤' },
    { id: 'today',   label: 'Dziś',     icon: '📋' },
    { id: 'week',    label: 'Tydzień',  icon: '📅' },
    { id: 'modules', label: 'Moduły',   icon: '🧩' },
    { id: 'rewards', label: 'Nagrody',  icon: '🏆' },
    { id: 'trainer', label: 'Trener',   icon: '🎓' },
    { id: 'parent',  label: 'Rodzic',   icon: '👨‍👩‍👧' },
  ]

  return (
    <nav className="bottom-nav">
      {items.map(item => (
        <button
          key={item.id}
          className={`nav-btn ${screen === item.id ? 'active' : ''}`}
          onClick={() => setScreen(item.id)}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
