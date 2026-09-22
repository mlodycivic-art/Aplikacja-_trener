import { MODULES } from '../data/defaultData'

export default function ModulesScreen() {
  return (
    <div>
      <p className="section-title">🧩 Moduły treningowe</p>
      <p className="section-sub">Dostępne i planowane moduły aplikacji</p>

      {MODULES.map(mod => (
        <div key={mod.id} className={`module-card ${mod.available ? '' : 'locked'}`}>
          <div className="module-icon">{mod.emoji}</div>
          <div style={{ flex: 1 }}>
            <div className="module-name">{mod.name}</div>
            <div className="module-desc">{mod.desc}</div>
            <div className="module-tags">
              {mod.available
                ? <span className="module-tag">✅ Dostępne</span>
                : <span className="module-tag soon">🔜 Wkrótce</span>
              }
              {mod.requiresDevice && <span className="module-tag">⚙️ Wymaga urządzenia</span>}
              {mod.future.map(f => (
                <span key={f} className="module-tag soon">📡 {f}</span>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="card" style={{ background: '#F5F3FF', border: '1.5px solid #DDD6FE' }}>
        <h3 style={{ fontWeight: 800, marginBottom: 8, color: 'var(--purple)' }}>🚀 Nadchodzące funkcje</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          W kolejnych wersjach aplikacji pojawią się: analiza kamery, analiza mikrofonu, chmura, panel logopedy, kody raportów i integracja z urządzeniem mechanicznym.
        </p>
      </div>
    </div>
  )
}
