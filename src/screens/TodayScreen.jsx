import { useState, useEffect } from 'react'
import Icon from '../components/Icon'
import { calcDayStats, speechRhythmLabel } from '../data/defaultData'

const STATUS_LABELS = {
  planned:   'Zaplanowane',
  completed: 'Ukończone',
  cancelled: 'Anulowane',
  missed:    'Nie wykonane',
}

// Klasa CSS chipa — "missed" wizualnie pożycza styl "skipped" (bursztynowy)
function chipClass(status) {
  if (status === 'missed') return 'skipped'
  return status
}

// Ćwiczenie "aktywne" — od (zaplanowana godzina − wyprzedzenie alarmu tego ćwiczenia),
// do 60 min po niej, LUB wymuszone (forceActive) po przywróceniu z "nie wykonane".
// Każde ćwiczenie ma WŁASNE wyprzedzenie (alarmAdvanceSec) — dotyczy tylko tego ćwiczenia.
function isCurrentlyActive(ex) {
  if (ex.forceActive) return true
  if (!ex.hour) return false // brak ustawionej godziny — nigdy nie jest "aktywne" samo z siebie
  const now         = new Date()
  const nowTotalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  const [h, m]      = ex.hour.split(':').map(Number)
  const exTotalSec  = h * 3600 + m * 60
  const advanceSec  = (ex.alarmEnabled !== false) ? (ex.alarmAdvanceSec ?? 30) : 0
  const startSec    = exTotalSec - advanceSec
  const endSec      = exTotalSec + 3600 // do 60 min po zaplanowanej godzinie
  return nowTotalSec >= startSec && nowTotalSec <= endSec
}

function minutesOf(hourStr) {
  const [h, m] = (hourStr || '00:00').split(':').map(Number)
  return h * 60 + m
}

function addMinutesToHour(hourStr, addMin) {
  let total = minutesOf(hourStr) + addMin
  total = ((total % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function TodayScreen({ user, plan, setPlan, setScreen, setActiveEx }) {
  const stats = calcDayStats(plan)
  const today = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })

  const [snoozeOpenId, setSnoozeOpenId] = useState(null)
  const [snoozeError,  setSnoozeError]  = useState('')

  const changeStatus = (id, status) => setPlan(prev => prev.map(e => e.id === id ? { ...e, status } : e))

  const startEx = (ex) => { setActiveEx(ex); setScreen('exercise') }

  const confirmCancel = (ex) => {
    if (window.confirm(`Czy na pewno chcesz anulować "${ex.name}"? Tej operacji nie można cofnąć.`)) {
      changeStatus(ex.id, 'cancelled')
    }
  }

  // Przywróć "nie wykonane" — od razu aktywuje przycisk Start, niezależnie od godziny
  const restoreMissed = (ex) => {
    setPlan(prev => prev.map(e => e.id === ex.id
      ? { ...e, status: 'planned', forceActive: true, restoredFromMissed: true }
      : e
    ))
  }

  const openSnooze  = (id) => { setSnoozeOpenId(id); setSnoozeError('') }
  const closeSnooze = ()   => { setSnoozeOpenId(null); setSnoozeError('') }

  const applySnooze = (ex, minutes) => {
    const newHour  = addMinutesToHour(ex.hour, minutes)
    const newTotal = minutesOf(newHour)

    const conflict = plan.find(other => {
      if (other.id === ex.id) return false
      if (other.status !== 'planned') return false
      return Math.abs(minutesOf(other.hour) - newTotal) < 15
    })

    if (conflict) {
      setSnoozeError(`Nie można odłożyć — zbyt blisko treningu "${conflict.name}" (${conflict.hour}). Wybierz inny czas.`)
      return
    }

    setPlan(prev => prev.map(e => e.id === ex.id ? { ...e, hour: newHour } : e))
    closeSnooze()
  }

  // Odświeżanie co 20 s — "aktywne teraz" zależy od zegara, a ekran sam się nie przerysowuje
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 20000)
    return () => clearInterval(id)
  }, [])

  // Karta "Teraz": jedno ćwiczenie do zrobienia i jeden duży przycisk.
  const sortedPlan = [...plan].sort((a, b) => {
    if (!a.hour) return 1
    if (!b.hour) return -1
    return a.hour.localeCompare(b.hour)
  })
  const nowEx  = sortedPlan.find(ex => ex.status === 'planned' && isCurrentlyActive(ex))
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nextEx = sortedPlan.find(ex => ex.status === 'planned' && ex.hour && minutesOf(ex.hour) > nowMin && !isCurrentlyActive(ex))
  const allDone = stats.total > 0 && stats.pct === 100

  return (
    <div>
      <p className="section-title">Cześć, {user.name}</p>
      <p className="section-sub">{today}</p>

      <div className="now-card">
        {nowEx ? (<>
          <div className="eyebrow">Teraz</div>
          <div className="now-title">{speechRhythmLabel(nowEx)}</div>
          <div className="now-meta">{nowEx.duration} min · +{nowEx.points} pkt</div>
          <button className="btn-start" onClick={() => startEx(nowEx)}>
            <Icon name="play" size={18} /> Start
          </button>
        </>) : allDone ? (<>
          <div className="eyebrow" style={{ color: '#86EFAC' }}>Plan wykonany</div>
          <div className="now-title">Wszystko zrobione na dziś</div>
          <div className="now-meta">+50 pkt bonusu za cały dzień</div>
        </>) : nextEx ? (<>
          <div className="eyebrow">Następne o {nextEx.hour}</div>
          <div className="now-title">{speechRhythmLabel(nextEx)}</div>
          <div className="now-meta">{nextEx.duration} min · przycisk Start pojawi się o czasie</div>
        </>) : (<>
          <div className="eyebrow">Dziś</div>
          <div className="now-title">{stats.total === 0 ? 'Brak ćwiczeń w planie' : 'Na teraz nic do zrobienia'}</div>
          <div className="now-meta">{stats.total === 0 ? 'Plan ustawia dorosły w Trenerze.' : 'Sprawdź listę poniżej.'}</div>
        </>)}

        <div className="day-row">
          <div className="progress-wrap">
            <div className="progress-fill" style={{ width: `${stats.pct}%` }} />
          </div>
          <div className="day-pct">{stats.completed}/{stats.total}</div>
        </div>
      </div>

      {plan.length > 0 && (
        <div className="form-label" style={{ marginBottom: 10 }}>Plan dnia · {stats.minutes} min zrobione</div>
      )}

      {/* Lista ćwiczeń */}
      {sortedPlan.map(ex => {
        const active   = isCurrentlyActive(ex)
        const inactive = ex.status === 'planned' && !active
        const showSnoozePanel = snoozeOpenId === ex.id

        return (
          <div key={ex.id}
            className={`ex-card ${ex.status}`}
            style={inactive ? { opacity: 0.45, filter: 'grayscale(0.4)' } : {}}>

            <div className="ex-card-header">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{speechRhythmLabel(ex)}</div>
                <div className="ex-card-meta">{ex.hour || 'brak godziny'} · {ex.duration} min · +{ex.points} pkt</div>
              </div>
              <span className={`chip chip-${chipClass(ex.status)}`}>{STATUS_LABELS[ex.status] || ex.status}</span>
            </div>

            {/* Akcje — tylko gdy ćwiczenie jest aktywne i panel odłóż nie jest otwarty */}
            {ex.status === 'planned' && active && !showSnoozePanel && (
              <div className="ex-card-actions">
                <button className="btn btn-primary btn-sm" onClick={() => startEx(ex)}>▶ Start</button>
                <button className="btn btn-ghost btn-sm" style={{ color: '#E11D48' }} onClick={() => confirmCancel(ex)}>Anuluj</button>
                <button className="btn btn-ghost btn-sm" style={{ color: '#7C3AED' }} onClick={() => openSnooze(ex.id)}>Odłóż</button>
              </div>
            )}

            {/* Panel wyboru czasu odłożenia */}
            {showSnoozePanel && (
              <div style={{ marginTop: 10, background: '#F5F3FF', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)', marginBottom: 8 }}>Odłóż o:</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[5, 10, 15].map(min => (
                    <button key={min} className="btn btn-outline btn-sm" style={{ flex: 1 }}
                      onClick={() => applySnooze(ex, min)}>
                      {min} min
                    </button>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={closeSnooze}>✕</button>
                </div>
                {snoozeError && (
                  <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700, marginTop: 8 }}>
                    ⚠ {snoozeError}
                  </div>
                )}
              </div>
            )}

            {/* Nie wykonane — przywróć od razu z aktywnym Start */}
            {ex.status === 'missed' && (
              <div className="ex-card-actions">
                <div style={{ fontSize: 12, color: 'var(--muted)', flex: 1, alignSelf: 'center' }}>
                  Alarm wygasł bez reakcji
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => restoreMissed(ex)}>↩ Przywróć</button>
              </div>
            )}

            {/* Informacja dla nieaktywnych zaplanowanych */}
            {ex.status === 'planned' && inactive && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                {ex.hour ? `Zaplanowane na ${ex.hour}` : 'Brak ustawionej godziny — ustawia dorosły w Trenerze'}
              </div>
            )}
          </div>
        )
      })}

    </div>
  )
}
