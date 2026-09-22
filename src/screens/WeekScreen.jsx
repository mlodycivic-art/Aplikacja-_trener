import { calcDayStats, speechRhythmLabel } from '../data/defaultData'

const DAYS_PL_FULL  = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela']
const DAYS_PL_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd']

const MODULE_EMOJI = {
  tongue_position: '👅',
  sz_lip:          '👄',
  speech_rhythm:   '🎵',
  mechanical:      '⚙️',
  froggy_mouth:    '🐸',
}

function getWeekDates() {
  const now     = new Date()
  const jsDay   = now.getDay() // 0=Sun
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1  // 0=Mon
  const monday  = new Date(now)
  monday.setDate(now.getDate() - todayIdx)
  monday.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export default function WeekScreen({ exercises, user, plan }) {
  const jsDay    = new Date().getDay()
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1
  const weekDates = getWeekDates()
  const stats    = calcDayStats(plan)

  const weekDays = DAYS_PL_FULL.map((name, i) => {
    // Dla danego dnia tygodnia zbierz wszystkie sloty ze wszystkich szablonów ćwiczeń
    const dayExercises = (exercises || []).flatMap(ex =>
      (ex.schedule || [])
        .filter(s => s.day === i)
        .sort((a, b) => a.hour.localeCompare(b.hour))
        .map(slot => ({ ...ex, hour: slot.hour, id: `${ex.id}_${slot.hour.replace(':', '')}` }))
    )
    const isToday   = i === todayIdx
    const totalMin  = dayExercises.reduce((s, e) => s + e.duration, 0)
    const calDay    = weekDates[i].getDate()
    return { name, short: DAYS_PL_SHORT[i], idx: i, exercises: dayExercises, isToday, totalMin, calDay }
  })

  const totalWeekMin = weekDays.reduce((s, d) => s + d.totalMin, 0)
  const activeDays   = weekDays.filter(d => d.exercises.length > 0).length

  return (
    <div>
      <p className="section-title">📅 Plan tygodnia</p>
      <p className="section-sub">Harmonogram ćwiczeń, {user.name}</p>

      {/* Podsumowanie */}
      <div className="card card-grad-purple" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Tydzień w skrócie</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div style={{ background: 'rgba(255,255,255,.15)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{activeDays}</div>
            <div style={{ fontSize: 10, opacity: .85 }}>dni aktywnych</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.15)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{plan.length}</div>
            <div style={{ fontSize: 10, opacity: .85 }}>ćw. dziennie</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.15)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{totalWeekMin}</div>
            <div style={{ fontSize: 10, opacity: .85 }}>min / tydzień</div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, opacity: .85 }}>
          Dziś: {stats.completed}/{stats.total} ukończonych · {stats.pct}%
        </div>
      </div>

      {/* Pasek dni — numery kalendarzowe */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {weekDays.map(day => (
          <div key={day.idx} style={{
            flex: '0 0 auto',
            width: 54,
            textAlign: 'center',
            background: day.isToday
              ? 'linear-gradient(135deg, #6C63FF, #9B8FFF)'
              : day.exercises.length > 0 ? '#fff' : '#F8FAFC',
            color:   day.isToday ? '#fff' : 'var(--text)',
            borderRadius: 12,
            padding: '8px 4px',
            boxShadow: day.isToday ? '0 4px 16px rgba(108,99,255,.4)' : 'var(--shadow-sm)',
            border: day.isToday ? 'none' : `1.5px solid ${day.exercises.length > 0 ? 'var(--border)' : '#F1F5F9'}`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, opacity: day.isToday ? .9 : .55, marginBottom: 2 }}>
              {day.short}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>
              {day.calDay}
            </div>
            {day.totalMin > 0 && (
              <div style={{ fontSize: 9, opacity: .7, marginTop: 2 }}>
                {day.totalMin} min
              </div>
            )}
            {day.exercises.length === 0 && (
              <div style={{ fontSize: 9, opacity: .5, marginTop: 2 }}>wolne</div>
            )}
          </div>
        ))}
      </div>

      {/* Szczegółowa lista dni */}
      {weekDays.map(day => (
        <div key={day.idx} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              fontWeight: 900, fontSize: 14,
              color: day.isToday ? 'var(--primary)' : 'var(--text)',
            }}>
              {day.isToday ? '👉 ' : ''}{day.name} {day.calDay}
            </div>
            {day.isToday && <span className="chip chip-planned" style={{ fontSize: 10 }}>Dziś</span>}
            {day.exercises.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>— dzień wolny</span>
              : <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {day.exercises.length} ćwiczenia · {day.totalMin} min
                </span>
            }
          </div>

          {day.exercises.length > 0 && (
            <div style={{
              background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
              border: day.isToday ? '2px solid var(--primary)' : '1px solid var(--border)',
            }}>
              {day.exercises.map((ex, i) => (
                <div key={ex.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px',
                  borderBottom: i < day.exercises.length - 1 ? '1px solid #F1F5F9' : 'none',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{MODULE_EMOJI[ex.module] || '🎯'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{speechRhythmLabel(ex)}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      🕐 {ex.hour} · ⏱ {ex.duration} min · +{ex.points} pkt
                    </div>
                  </div>
                  {day.isToday ? (
                    <span className={`chip chip-${ex.status === 'missed' ? 'skipped' : ex.status}`} style={{ fontSize: 10 }}>
                      {{ planned:'Plan', completed:'✓', skipped:'Pom.', cancelled:'Anul.', snoozed:'Odł.', missed:'Nie wyk.' }[ex.status]}
                    </span>
                  ) : (
                    ex.alarmEnabled !== false && <span style={{ fontSize: 13 }}>🔔</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="card" style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', marginTop: 4 }}>
        <p style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
          💡 Aby zmienić harmonogram lub parametry ćwiczeń, przejdź do zakładki <strong>Trener</strong>.
        </p>
      </div>
    </div>
  )
}
