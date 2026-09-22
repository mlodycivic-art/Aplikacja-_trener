import { useState } from 'react'
import { calcDayStats, BADGE_DEFS, getLevel, speechRhythmLabel } from '../data/defaultData'

const STATUS_PL = {
  planned:   'zaplanowane',
  completed: 'ukończone',
  cancelled: 'anulowane',
  missed:    'nie wykonane',
  skipped:   'pominięte',
}

function chipClass(status) {
  if (status === 'missed') return 'skipped'
  return status
}

function buildReport(user, plan, stats) {
  const lvl    = getLevel(user.points)
  const badges = (user.badges || []).map(id => {
    const b = BADGE_DEFS.find(b => b.id === id)
    return b ? `${b.emoji} ${b.label}` : id
  })
  const today  = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const exerciseLines = plan.map(e => {
    let label = STATUS_PL[e.status] || e.status
    if (e.restoredFromMissed && e.status === 'completed') label += ' (po przywróceniu)'
    if (e.extendedTraining) {
      const sec = e.overtimeSeconds || 0
      const m   = Math.floor(sec / 60)
      const s   = sec % 60
      const t   = sec > 0 ? ` o ${m > 0 ? `${m} min ` : ''}${s} sek` : ''
      label += ` ⚠️ (przedłużone${t} ponad plan)`
    }
    if (e.completedViaGameTab) label += ' 🎮 (zakończono przez zamknięcie karty z grą)'
    return `• ${speechRhythmLabel(e)} — ${label} (${e.duration} min)`
  }).join('\n')

  return `📊 RAPORT TYGODNIOWY — Speech Training Coach
Wygenerowano: ${today}
Użytkownik: ${user.name} (wiek: ${user.age}, typ: ${user.type})
Cel: ${user.goal}

📅 DZISIEJSZY PLAN
• Wykonanie: ${stats.pct}% (${stats.completed}/${stats.total} ćwiczeń)
• Nie wykonane: ${stats.missed}
• Anulowane: ${stats.cancelled}
• Czas ćwiczeń: ${stats.minutes} min

🏆 STATYSTYKI
• Punkty łącznie: ${user.points} pkt
• Aktualny poziom: ${lvl.level} — ${lvl.label}
• Zdobyte odznaki: ${badges.length ? badges.join(', ') : 'brak'}

📋 SZCZEGÓŁY ĆWICZEŃ
${exerciseLines}

---
Raport wygenerowany przez Speech Training Coach
Źródło planu: Manual setup
Przyszłość: import od logopedy / kod planu`
}

export default function ParentScreen({ user, plan }) {
  const stats      = calcDayStats(plan)
  const lvl        = getLevel(user.points)
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied]       = useState(false)

  const report = buildReport(user, plan, stats)

  const copyReport = () => {
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      <p className="section-title">👨‍👩‍👧 Panel rodzica</p>
      <p className="section-sub">Postępy: {user.name}</p>

      {/* Day progress */}
      <div className="card card-grad-green" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, fontWeight: 900 }}>{stats.pct}%</div>
        <div style={{ fontWeight: 700 }}>wykonania dzisiejszego planu</div>
        <div className="progress-wrap" style={{ margin: '10px 0 4px' }}>
          <div className="progress-fill" style={{ width: `${stats.pct}%` }} />
        </div>
        <div style={{ fontSize: 12, opacity: .8 }}>
          {stats.completed} ukończone · {stats.cancelled} anulowane · {stats.missed} nie wykonane
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="val">⏱ {stats.minutes}</div>
          <div className="lbl">Minut ćwiczeń dziś</div>
        </div>
        <div className="stat-card">
          <div className="val">🏆 {user.points}</div>
          <div className="lbl">Punkty łącznie</div>
        </div>
        <div className="stat-card">
          <div className="val">⭐ {lvl.level}</div>
          <div className="lbl">Aktualny poziom</div>
        </div>
        <div className="stat-card">
          <div className="val">🎖 {(user.badges || []).length}</div>
          <div className="lbl">Zdobyte odznaki</div>
        </div>
      </div>

      {/* Today's exercises */}
      <div className="card">
        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>📋 Harmonogram dziś</h3>
        {plan.map(ex => (
          <div key={ex.id} className="row-list-item">
            <div>
              <div style={{ fontWeight: 700 }}>{speechRhythmLabel(ex)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {ex.hour} · {ex.duration} min
                {ex.restoredFromMissed && ex.status === 'completed' && (
                  <span style={{ color: 'var(--purple)' }}> · po przywróceniu</span>
                )}
                {ex.extendedTraining && (() => {
                  const sec = ex.overtimeSeconds || 0
                  const m = Math.floor(sec / 60)
                  const s = sec % 60
                  const t = sec > 0 ? ` o ${m > 0 ? `${m} min ` : ''}${s} sek` : ''
                  return <span style={{ color: 'var(--orange)' }}>· ⚠️ przedłużone{t}</span>
                })()}
                {ex.completedViaGameTab && (
                  <span style={{ color: 'var(--primary)' }}> · 🎮 zamknięcie karty z grą</span>
                )}
              </div>
            </div>
            <span className={`chip chip-${chipClass(ex.status)}`}>
              {{
                planned:   'Zaplanowane',
                completed: 'Ukończone ✓',
                skipped:   'Pominięte',
                cancelled: 'Anulowane',
                snoozed:   'Odłożone',
                missed:    'Nie wykonane ⏰',
              }[ex.status]}
            </span>
          </div>
        ))}
      </div>

      {/* Last plan update */}
      <div className="card mb-0">
        <h3 style={{ fontWeight: 800, marginBottom: 8 }}>🔧 Informacje o planie</h3>
        <div className="row-list-item">
          <span className="rli-label">Ostatnia aktualizacja planu</span>
          <span className="rli-val">{new Date().toLocaleDateString('pl-PL')}</span>
        </div>
        <div className="row-list-item">
          <span className="rli-label">Źródło planu</span>
          <span className="rli-val">Manual setup</span>
        </div>
        <div className="row-list-item" style={{ borderBottom: 'none' }}>
          <span className="rli-label">Przyszłość</span>
          <span className="rli-val" style={{ color: 'var(--purple)', fontSize: 12 }}>Import od logopedy</span>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <button className="btn btn-primary btn-full" onClick={() => setShowModal(true)}>
        📊 Generate Weekly Report
      </button>

      {/* Report modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>📊 Raport tygodniowy</h3>
            <div className="report-text">{report}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={copyReport}>
                {copied ? '✓ Skopiowano!' : '📋 Copy Report'}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowModal(false)}>
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
