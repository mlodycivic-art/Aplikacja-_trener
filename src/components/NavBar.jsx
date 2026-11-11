import Icon from './Icon'

// Dwie strefy:
//  - "child": to, czego potrzebuje ćwiczący (3 pozycje),
//  - "adult": ustawienia i narzędzia dorosłego, dostępne po podaniu PIN-u.
export const CHILD_ITEMS = [
  { id: 'today',   label: 'Dziś',    icon: 'today' },
  { id: 'week',    label: 'Tydzień', icon: 'week' },
  { id: 'rewards', label: 'Nagrody', icon: 'rewards' },
]

export const ADULT_ITEMS = [
  { id: 'trainer', label: 'Trener',     icon: 'trainer' },
  { id: 'vision',  label: 'Kalibracja', icon: 'camera' },
  { id: 'sibtest', label: 'Test SZ',    icon: 'wave' },
  { id: 'parent',  label: 'Rodzic',     icon: 'parent' },
  { id: 'profile', label: 'Profil',     icon: 'profile' },
  { id: 'modules', label: 'Moduły',     icon: 'modules' },
]

export const ADULT_SCREEN_IDS = ADULT_ITEMS.map(i => i.id)

export default function NavBar({ screen, setScreen, zone = 'child' }) {
  const items = zone === 'adult' ? ADULT_ITEMS : CHILD_ITEMS

  return (
    <nav className="bottom-nav" aria-label={zone === 'adult' ? 'Strefa dorosłego' : 'Menu'}>
      {items.map(item => (
        <button
          key={item.id}
          className={`nav-btn ${screen === item.id ? 'active' : ''}`}
          onClick={() => setScreen(item.id)}
        >
          <span className="nav-icon"><Icon name={item.icon} /></span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
