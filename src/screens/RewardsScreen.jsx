// Ekran "Postępy" (dawniej Nagrody) — to, co ćwiczący chce zobaczyć o sobie:
// seria dni, tydzień, rekordy z gier i ćwiczeń, a dopiero potem punkty i odznaki.

import { BADGE_DEFS, LEVELS, getLevel } from '../data/defaultData'
import { buildWeek, currentStreak } from '../data/weekReport'
import { useResults } from '../data/resultsStore'
import Icon from '../components/Icon'
import ThemePicker from '../components/ThemePicker'

function Record({ value, label, color = 'var(--primary)' }) {
  return (
    <div className="stat-card">
      <div className="val" style={{ color, fontFamily: "'Space Mono', monospace" }}>{value}</div>
      <div className="lbl">{label}</div>
    </div>
  )
}

export default function RewardsScreen({ user, plan }) {
  const lvl      = getLevel(user.points)
  const nextLvl  = LEVELS.find(l => l.level === lvl.level + 1)
  const pctInLvl = nextLvl
    ? Math.round(((user.points - lvl.min) / (nextLvl.min - lvl.min)) * 100)
    : 100
  const earned = user.badges || []

  const week   = buildWeek(plan)
  const streak = currentStreak(plan)
  // Rekordy liczone z całej historii (nie tylko z tygodnia)
  const throws   = useResults('bowling_throw')
  const balloons = useResults('balloon_game')
  const trials   = useResults('mix_trial')
  const strikes  = throws.filter(t => t.data.pins === 10).length
  const balloonsDone = balloons.filter(b => b.data.completed).length
  const fixedWords = trials.filter(t => t.data.selfRating === 'good' && t.data.attempts > 1).length
  const goodWords  = trials.filter(t => t.data.selfRating === 'good').length
  const max = Math.max(1, ...week.days.map(d => d.total))

  return (
    <div>
      <p className="section-title">Postępy</p>
      <p className="section-sub">Twoja seria, tydzień i rekordy</p>

      {/* Seria + tydzień */}
      <div className="now-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div className="eyebrow">Seria</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 44, lineHeight: 1.1 }}>
              {streak}<span style={{ fontSize: 16, color: '#CBD5E1', fontFamily: 'inherit' }}> {streak === 1 ? 'dzień' : 'dni'} z rzędu</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow">Ten tydzień</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{week.totals.completed} ćwiczeń</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70, marginTop: 16 }}>
          {week.days.map(d => (
            <div key={d.key} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', maxWidth: 30, height: `${Math.max(6, (d.total / max) * 100)}%`, background: 'rgba(255,255,255,.14)', borderRadius: 6, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: `${d.total ? (d.completed / d.total) * 100 : 0}%`, background: '#22C55E' }} />
              </div>
              <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700 }}>{d.weekday}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rekordy */}
      <div className="form-label" style={{ marginBottom: 10 }}>Rekordy</div>
      <div className="stats-grid">
        <Record value={strikes} label="Strike w kręglach" />
        <Record value={balloonsDone} label="Napompowane balony" color="var(--orange)" />
        <Record value={goodWords} label="Słowa ocenione jako dobre" color="var(--green)" />
        <Record value={fixedWords} label="Słowa poprawione po odsłuchu" color="var(--blue)" />
      </div>

      {/* Punkty i poziom */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Poziom {lvl.level} — {lvl.label}</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 20 }}>{user.points} pkt</div>
        </div>
        <div className="progress-wrap dark" style={{ margin: '10px 0 6px' }}>
          <div className="progress-fill colored" style={{ width: `${pctInLvl}%` }} />
        </div>
        <div className="text-muted" style={{ fontSize: 13 }}>
          {nextLvl ? `${nextLvl.min - user.points} pkt do poziomu ${nextLvl.level} (${nextLvl.label})` : 'Najwyższy poziom'}
        </div>
      </div>

      {/* Odznaki */}
      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Odznaki · {earned.length} z {BADGE_DEFS.length}</div>
        {BADGE_DEFS.map(b => {
          const isEarned = earned.includes(b.id)
          return (
            <div key={b.id} className="row-list-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isEarned ? 'var(--yellow)' : '#EEF0F3', color: isEarned ? '#451A03' : '#94A3B8',
                }}>
                  <Icon name={isEarned ? 'check' : 'lock'} size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: isEarned ? 'var(--text)' : 'var(--muted)' }}>{b.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{b.desc}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ThemePicker />
    </div>
  )
}
