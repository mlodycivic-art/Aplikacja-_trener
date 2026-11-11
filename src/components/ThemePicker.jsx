import { useState } from 'react'
import { SKINS, ACCENTS, getTheme, saveTheme } from '../data/theme'

// Wybór wyglądu: styl + akcent. Zmiana działa od razu.
export default function ThemePicker() {
  const [theme, setTheme] = useState(getTheme())
  const update = (patch) => { const next = { ...theme, ...patch }; setTheme(next); saveTheme(next) }
  // zmiana stylu ustawia jego domyślny akcent — potem można wybrać dowolny
  const pickSkin = (skin) => update({ skin: skin.id, accent: skin.accent })

  return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Wygląd</div>
      <div className="form-label">Styl</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
        {SKINS.map(s => {
          const active = theme.skin === s.id
          return (
            <button key={s.id} onClick={() => pickSkin(s)} aria-pressed={active} style={{
              textAlign: 'left', padding: 10, borderRadius: 14, background: 'var(--surface)', color: 'var(--text)',
              border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
            }}>
              <div style={{ height: 44, borderRadius: 9, background: s.preview[0], border: '1px solid rgba(128,128,128,.35)', position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 12, background: s.preview[2] }} />
                <div style={{ position: 'absolute', left: 8, right: 30, top: 19, height: 17, borderRadius: 5, background: s.preview[1], border: '1px solid rgba(128,128,128,.3)' }} />
                <div style={{ position: 'absolute', right: 8, top: 21, width: 14, height: 14, borderRadius: 7, background: ACCENTS.find(a => a.id === s.accent).hex }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}{active ? ' ✓' : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.desc}</div>
            </button>
          )
        })}
      </div>
      <div className="form-label">Kolor akcentu</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {ACCENTS.map(a => (
          <button key={a.id} onClick={() => update({ accent: a.id })} aria-label={a.name} aria-pressed={theme.accent === a.id} title={a.name} style={{
            width: 40, height: 40, borderRadius: 20, background: a.hex, color: a.on, fontWeight: 800, fontSize: 18,
            outline: theme.accent === a.id ? '3px solid var(--text)' : 'none', outlineOffset: 2,
          }}>{theme.accent === a.id ? '✓' : ''}</button>
        ))}
      </div>
    </div>
  )
}
