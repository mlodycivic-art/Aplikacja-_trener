import { MODULES } from '../data/defaultData'
import Icon from '../components/Icon'

const MODULE_ICON = { mix_speech: 'wave', speech_rhythm: 'mic', sz_lip: 'camera', mechanical: 'trainer', froggy_mouth: 'clock' }

export default function ModulesScreen() {
  return (
    <div>
      <p className="section-title">Moduły treningowe</p>
      <p className="section-sub">Dostępne i planowane moduły aplikacji</p>

      {MODULES.map(mod => (
        <div key={mod.id} className={`module-card ${mod.available ? '' : 'locked'}`}>
          <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: mod.available ? 'var(--primary)' : '#EEF0F3', color: mod.available ? '#fff' : '#94A3B8' }}>
            <Icon name={MODULE_ICON[mod.id] || 'modules'} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="module-name">{mod.name}</div>
            <div className="module-desc">{mod.desc}</div>
            <div className="module-tags">
              {mod.available
                ? <span className="module-tag">Dostępne</span>
                : <span className="module-tag soon">Wkrótce</span>
              }
              {mod.requiresDevice && <span className="module-tag">Wymaga urządzenia</span>}
              {mod.future.map(f => (
                <span key={f} className="module-tag soon">{f}</span>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="card">
        <h3 style={{ fontWeight: 800, marginBottom: 8 }}>Nadchodzące funkcje</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          W kolejnych wersjach aplikacji pojawią się: analiza kamery, analiza mikrofonu, chmura, panel logopedy, kody raportów i integracja z urządzeniem mechanicznym.
        </p>
      </div>
    </div>
  )
}
