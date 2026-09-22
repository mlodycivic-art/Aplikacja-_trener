import { BADGE_DEFS, LEVELS, getLevel } from '../data/defaultData'

export default function RewardsScreen({ user, plan }) {
  const lvl      = getLevel(user.points)
  const nextLvl  = LEVELS.find(l => l.level === lvl.level + 1)
  const pctInLvl = nextLvl
    ? Math.round(((user.points - lvl.min) / (nextLvl.min - lvl.min)) * 100)
    : 100
  const earned   = user.badges || []
  const totalDone = plan.filter(e => e.status === 'completed').length

  return (
    <div>
      <p className="section-title">🏆 Nagrody</p>
      <p className="section-sub">Twoje punkty, poziom i odznaki</p>

      {/* Points card */}
      <div className="card card-grad-yellow" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, fontWeight: 900, fontFamily: "'Space Mono', monospace" }}>
          {user.points}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>punktów</div>
        <div style={{ margin: '10px 0 4px' }}>
          <div className="progress-wrap" style={{ background: 'rgba(120,53,15,.2)' }}>
            <div className="progress-fill" style={{ width: `${pctInLvl}%`, background: '#78350F' }} />
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: .8 }}>
          Poziom {lvl.level} — {lvl.label}
          {nextLvl && ` · ${nextLvl.min - user.points} pkt do Poziomu ${nextLvl.level}`}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="val">✅ {totalDone}</div>
          <div className="lbl">Ukończone ćwiczenia</div>
        </div>
        <div className="stat-card">
          <div className="val">⭐ {lvl.level}</div>
          <div className="lbl">Aktualny poziom</div>
        </div>
        <div className="stat-card">
          <div className="val">🎖 {earned.length}</div>
          <div className="lbl">Zdobyte odznaki</div>
        </div>
        <div className="stat-card">
          <div className="val">{pctInLvl}%</div>
          <div className="lbl">Do następnego poziomu</div>
        </div>
      </div>

      {/* Levels */}
      <div className="card">
        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>📊 Poziomy</h3>
        {LEVELS.map(l => (
          <div key={l.level} className="row-list-item">
            <span className="rli-label">
              {l.level === lvl.level ? '👉 ' : ''}Poziom {l.level} — {l.label}
            </span>
            <span className="rli-val" style={{ fontSize: 12 }}>
              {l.max === Infinity ? `${l.min}+ pkt` : `${l.min}–${l.max} pkt`}
            </span>
          </div>
        ))}
      </div>

      {/* Badges */}
      <div className="card">
        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>🎖 Odznaki</h3>
        {BADGE_DEFS.map(b => {
          const isEarned = earned.includes(b.id)
          return (
            <div key={b.id} className="row-list-item">
              <div>
                <span className={`badge-pill ${isEarned ? 'badge-earned' : 'badge-locked'}`}>
                  {b.emoji} {b.label}
                </span>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, paddingLeft: 4 }}>{b.desc}</div>
              </div>
              <span style={{ fontSize: 12, color: isEarned ? 'var(--green)' : 'var(--muted)', fontWeight: 800 }}>
                {isEarned ? '✓' : '🔒'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
