import { useState } from 'react'
import { generateTodayPlan } from '../data/defaultData'
import {
  PROGRAM_WEEKS, readProgram, writeProgram, syncProgram, restoreBackup, weekIndexFor, weekRange,
  programEnd, shortDate, parseIso, nextMonday, isoDate, describeItems, sessionMinutes, DEFAULT_PROGRAM_STATE,
} from '../data/program'

const DAY_GROUP = (days) => {
  const N = ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sb', 'Nd']
  if (days.length === 7) return 'Codziennie'
  return days.length > 2 ? `${N[days[0]]}–${N[days[days.length - 1]]}` : days.map(d => N[d]).join(', ')
}

// Karta „Plan 4‑tygodniowy” w Trenerze
export default function ProgramCard({ exercises, setExercises, plan, setPlan }) {
  const [state, setState] = useState(() => readProgram() || { ...DEFAULT_PROGRAM_STATE, enabled: false })
  const [open, setOpen] = useState(false)

  const rebuildPlan = (list) => {
    const old = Object.fromEntries((plan || []).map(e => [e.id, e]))
    setPlan(generateTodayPlan(list).map(e => (old[e.id] && old[e.id].status !== 'planned' ? old[e.id] : e)))
  }

  const save = (next) => {
    writeProgram(next)
    let list = exercises
    if (!next.enabled && state.backup) list = restoreBackup(exercises, state.backup)
    if (next.enabled) list = syncProgram(list) || list
    setState(readProgram())
    if (list !== exercises) { setExercises(list); rebuildPlan(list) }
  }

  const turnOff = () => {
    if (!window.confirm('Wyłączyć plan 4‑tygodniowy? Wrócą godziny ćwiczeń sprzed planu.')) return
    save({ ...state, enabled: false, appliedWeek: null, backup: null })
  }
  const turnOn = () => save({ ...state, enabled: true, appliedWeek: null })
  const setStart = (iso) => { if (iso) save({ ...state, start: iso, appliedWeek: null }) }

  const idx = weekIndexFor(state)
  const end = programEnd(state)
  let status
  if (!state.enabled) status = 'Wyłączony — obowiązują godziny ustawione ręcznie'
  else if (idx < 0) status = `Startuje ${shortDate(parseIso(state.start))} (poniedziałek). Do tego czasu nic się nie zmienia.`
  else if (idx >= PROGRAM_WEEKS.length) status = 'Zakończony — zostały godziny z ostatniego tygodnia'
  else status = `Teraz: ${PROGRAM_WEEKS[idx].title.split(' — ')[0]} (${weekRange(state, idx)})`

  return (
    <div className="card" style={{ marginBottom: 14, border: '2px solid var(--primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Plan 4‑tygodniowy</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            {state.start && end ? `${shortDate(parseIso(state.start))} – ${shortDate(end)} · ` : ''}2 sesje po ok. 12 min + Froggy 20 min
          </div>
          <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }} data-program-status>{status}</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setOpen(o => !o)}>{open ? 'Zwiń' : 'Szczegóły'}</button>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            Pn–Pt: 15:30 i 20:00, Froggy 20:40 · Sb–Nd: 10:00 i 19:00, Froggy 19:30.
            W każdy poniedziałek aplikacja sama wpisuje godziny i zestawy nowego tygodnia (Twoje zmiany w tych
            czterech ćwiczeniach zostaną wtedy nadpisane). Pozostałe ćwiczenia nie są w planie na czas jego trwania.
          </div>
          {PROGRAM_WEEKS.map((w, i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 10, marginBottom: 6,
              background: i === idx && state.enabled ? 'var(--active-bg)' : 'var(--soft)' }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{w.title} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {weekRange(state, i)}</span></div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                Gimnastyka: tempo {w.gym.tempo === 'slow' ? 'wolne' : 'normalne'}
                {Object.keys(w.gym.reps).length ? ', winda i koszyczek po 8' : ''}
              </div>
              {w.days.map((g, k) => {
                const mins = sessionMinutes(i, g.days[0])
                return (
                  <div key={k} style={{ fontSize: 12, marginTop: 4 }}>
                    <strong>{DAY_GROUP(g.days)}:</strong>
                    {g.sessions.map((s, si) => (
                      <div key={si} style={{ marginLeft: 8 }}>
                        {si === 0 ? 'Sesja 1' : 'Sesja 2'} (~{mins[si]} min): {describeItems(s)}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13 }}>Początek (poniedziałek):</label>
            <input type="date" value={state.start || ''} onChange={e => setStart(e.target.value)} />
            <button className="btn btn-outline btn-sm" onClick={() => setStart(isoDate(nextMonday()))}>Od najbliższego pon.</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {state.enabled
          ? <button className="btn btn-sm" style={{ background: '#FEF2F2', color: 'var(--red)' }} onClick={turnOff} data-program-off>Wyłącz plan</button>
          : <button className="btn btn-primary btn-sm" onClick={turnOn} data-program-on>Włącz plan</button>}
      </div>
    </div>
  )
}
