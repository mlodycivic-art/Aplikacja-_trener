// Panel rodzica — pomiary postępu, których nie da się wyczytać z samego "ukończono ćwiczenie":
//  1. Próbka tygodniowa: % poprawnych głosek w 2 minutach SWOBODNEJ rozmowy (główna miara celu).
//  2. Dziennik nocny: pozycja języka we śnie (o to prosiła logopedka).
//  3. "Gdzie jest język?": odpowiedzi dziecka z losowych sprawdzeń w ciągu dnia.
//  4. Mowa mieszana: samoocena dziecka z ostatnich sesji.
// Wszystko czyta i zapisuje przez wspólny magazyn wyników (data/resultsStore.js).

import { useEffect, useRef, useState } from 'react'
import { addResult, removeResult, useResults, lastDays, localDateKey } from '../data/resultsStore'
import { isTongueCheckEnabled, TONGUE_CHECK_ENABLED_KEY } from '../components/TongueCheck'

const POS = {
  up:   { label: 'U góry',   short: 'G', color: 'var(--green)',  text: '#fff' },
  mid:  { label: 'Pośrodku', short: 'Ś', color: 'var(--yellow)', text: '#451A03' },
  down: { label: 'Na dole',  short: 'D', color: 'var(--red)',    text: '#fff' },
}
const dayLabel = (key) => { const [, m, d] = key.split('-'); return `${Number(d)}.${Number(m)}` }

function Choice({ options, value, onChange }) {
  return (
    <div className="type-selector">
      {options.map(o => (
        <button key={o.id} className={`type-btn ${value === o.id ? 'active' : ''}`} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

// ── 1. Próbka tygodniowa ─────────────────────────────────────────────────────
const SAMPLE_SEC = 120

function WeeklySample() {
  const samples = useResults('weekly_sample')
  const [running, setRunning] = useState(false)
  const [left, setLeft]       = useState(SAMPLE_SEC)
  const [marks, setMarks]     = useState([])   // 'good' | 'bad' w kolejności stuknięć
  const endAtRef = useRef(0)
  const marksRef = useRef(marks)
  marksRef.current = marks

  const finish = () => {
    setRunning(false)
    const m = marksRef.current
    const good = m.filter(x => x === 'good').length
    const bad  = m.length - good
    if (m.length > 0) {
      const durationSec = SAMPLE_SEC - Math.max(0, Math.round((endAtRef.current - performance.now()) / 1000))
      addResult('weekly_sample', { good, bad, pct: Math.round((good / m.length) * 100), durationSec })
    }
    setMarks([])
    setLeft(SAMPLE_SEC)
  }

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const remain = Math.max(0, Math.ceil((endAtRef.current - performance.now()) / 1000))
      setLeft(remain)
      if (remain <= 0) finish()
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const start = () => { endAtRef.current = performance.now() + SAMPLE_SEC * 1000; setMarks([]); setLeft(SAMPLE_SEC); setRunning(true) }
  const good = marks.filter(x => x === 'good').length
  const recent = samples.slice(-8)

  return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 16 }}>Próbka swobodnej mowy</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px', lineHeight: 1.5 }}>
        Raz w tygodniu: 2 minuty zwykłej rozmowy (bez przypominania o wymowie). Przy każdym słowie
        z „sz”, „cz”, „ż/rz”, „dż” stuknij, czy głoska była poprawna. To główna miara postępu.
      </p>

      {!running ? (
        <button className="btn btn-primary btn-full" onClick={start}>Zacznij 2 minuty</button>
      ) : (<>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 26 }}>
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
          <span style={{ fontWeight: 800 }}>{good} dobrze · {marks.length - good} błąd</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-green" style={{ flex: 1, padding: '22px 10px', fontSize: 17 }} onClick={() => setMarks(m => [...m, 'good'])}>Poprawnie</button>
          <button className="btn btn-red" style={{ flex: 1, padding: '22px 10px', fontSize: 17 }} onClick={() => setMarks(m => [...m, 'bad'])}>Błąd</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={!marks.length} onClick={() => setMarks(m => m.slice(0, -1))}>Cofnij ostatnie</button>
          <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={finish}>Zakończ i zapisz</button>
        </div>
      </>)}

      {recent.length > 0 && (<>
        <div className="divider" />
        <div className="form-label">Ostatnie próbki</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
          {recent.map(s => (
            <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{s.data.pct}%</span>
              <div title={`${s.data.good} dobrze, ${s.data.bad} błąd`} style={{ width: '100%', maxWidth: 34, height: `${Math.max(4, s.data.pct * 0.7)}%`, background: 'var(--primary)', borderRadius: '6px 6px 0 0' }} />
              <span className="text-muted" style={{ fontSize: 11 }}>{dayLabel(s.date)}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm mt-8" onClick={() => { if (window.confirm('Usunąć ostatnią próbkę?')) removeResult(recent[recent.length - 1].id) }}>
          Usuń ostatnią próbkę
        </button>
      </>)}
    </div>
  )
}

// ── 2. Dziennik nocny ────────────────────────────────────────────────────────
function NightLog() {
  const logs = useResults('night_log')
  const [forDate, setForDate]   = useState(localDateKey())
  const [position, setPosition] = useState('')
  const [mouth, setMouth]       = useState('')
  const [saved, setSaved]       = useState(false)

  const byDate = {}
  logs.forEach(l => { byDate[l.data.forDate] = l })
  const days = lastDays(14)

  const save = () => {
    if (!position || !mouth) return
    if (byDate[forDate]) removeResult(byDate[forDate].id)   // jeden wpis na noc
    addResult('night_log', { forDate, position, mouth })
    setPosition(''); setMouth('')
    setSaved(true); setTimeout(() => setSaved(false), 1800)
  }

  const filled = days.filter(d => byDate[d])
  const upCount = filled.filter(d => byDate[d].data.position === 'up').length

  return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 16 }}>Dziennik nocny</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px', lineHeight: 1.5 }}>
        Sprawdzenie we śnie, o które prosiła logopedka: gdzie leży język i czy usta są zamknięte.
      </p>

      <label className="form-label">Noc zakończona rano dnia</label>
      <input className="form-input" type="date" value={forDate} max={localDateKey()} onChange={e => setForDate(e.target.value)} />
      <label className="form-label">Język</label>
      <Choice value={position} onChange={setPosition} options={[{ id: 'up', label: 'U góry' }, { id: 'mid', label: 'Pośrodku' }, { id: 'down', label: 'Na dole' }]} />
      <label className="form-label">Usta</label>
      <Choice value={mouth} onChange={setMouth} options={[{ id: 'closed', label: 'Zamknięte' }, { id: 'open', label: 'Rozchylone' }]} />
      <button className="btn btn-primary btn-full" disabled={!position || !mouth} onClick={save}>
        {saved ? 'Zapisano' : byDate[forDate] ? 'Zastąp wpis z tego dnia' : 'Zapisz'}
      </button>

      <div className="divider" />
      <div className="form-label">Ostatnie 14 nocy · język u góry: {upCount} z {filled.length}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 4 }}>
        {days.map(d => {
          const e = byDate[d]
          const pos = e ? POS[e.data.position] : null
          return (
            <div key={d} style={{ textAlign: 'center' }}>
              <div title={e ? `${pos.label}, usta ${e.data.mouth === 'closed' ? 'zamknięte' : 'rozchylone'}` : 'brak wpisu'}
                style={{
                  aspectRatio: '1', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800,
                  background: pos ? pos.color : '#EEF0F3', color: pos ? pos.text : '#94A3B8',
                  outline: e && e.data.mouth === 'open' ? '2px dashed var(--ink)' : 'none', outlineOffset: -2,
                }}>
                {pos ? pos.short : '·'}
              </div>
              <div className="text-muted" style={{ fontSize: 9, marginTop: 2 }}>{dayLabel(d)}</div>
            </div>
          )
        })}
      </div>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
        G = u góry, Ś = pośrodku, D = na dole. Przerywana ramka = usta rozchylone.
      </div>
    </div>
  )
}

// ── 3. Sprawdzenia języka w ciągu dnia + 4. Mowa mieszana ────────────────────
function DayChecks() {
  const checks = useResults('tongue_check', 7)
  const trials = useResults('mix_trial', 7)
  const [enabled, setEnabled] = useState(isTongueCheckEnabled())

  const toggle = () => {
    const next = !enabled
    try { localStorage.setItem(TONGUE_CHECK_ENABLED_KEY, next ? '1' : '0') } catch (e) {}
    setEnabled(next)
  }

  const count = (p) => checks.filter(c => c.data.position === p).length
  const total = checks.length
  const good  = trials.filter(t => t.data.selfRating === 'good').length
  const fixed = trials.filter(t => t.data.selfRating === 'good' && t.data.attempts > 1).length

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>„Gdzie jest język?” — 7 dni</div>
        <button className={`btn btn-sm ${enabled ? 'btn-primary' : 'btn-ghost'}`} onClick={toggle}>{enabled ? 'Włączone' : 'Wyłączone'}</button>
      </div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px', lineHeight: 1.5 }}>
        Losowe pytanie co 40–90 minut między 8:00 a 20:00, gdy aplikacja jest otwarta. To odpowiedzi dziecka, nie pomiar.
      </p>
      {total === 0 ? (
        <div className="text-muted" style={{ fontSize: 13 }}>Brak odpowiedzi w ostatnich 7 dniach.</div>
      ) : (<>
        <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
          {['up', 'mid', 'down'].map(p => count(p) > 0 && (
            <div key={p} style={{ flex: count(p), background: POS[p].color, color: POS[p].text, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {POS[p].short} {count(p)}
            </div>
          ))}
        </div>
        <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
          U góry: {Math.round((count('up') / total) * 100)}% z {total} odpowiedzi
        </div>
      </>)}

      <div className="divider" />
      <div style={{ fontWeight: 800, fontSize: 16 }}>Mowa mieszana — 7 dni</div>
      {trials.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>Brak prób w ostatnich 7 dniach.</div>
      ) : (
        <div className="row-list-item" style={{ borderBottom: 'none' }}>
          <span className="rli-label">Słowa ocenione przez dziecko jako dobre</span>
          <span className="rli-val">{good}/{trials.length}{fixed > 0 ? ` · ${fixed} po poprawce` : ''}</span>
        </div>
      )}
    </div>
  )
}

// Okna starannej mowy z ostatnich 14 dni: ile słów z listy padło dobrze, ile było do poprawy
function CarefulWindows() {
  const items = useResults('careful_window', 14)
  if (!items.length) return null
  const rows = [...items].reverse().slice(0, 10)
  return (
    <div className="card" style={{ marginBottom: 10 }} data-card="careful">
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Staranna mowa</div>
      <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Słowa z własnej listy wyłapane w oknach starannej mowy. Liczy się każdy głos przy mikrofonie, wynik jest orientacyjny.
      </p>
      {rows.map(e => {
        const d = e.data || {}
        const judged = (d.good || 0) + (d.bad || 0)
        return (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span>{new Date(e.ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}, {new Date(e.ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} · {d.activeMin} min</span>
            <span style={{ fontWeight: 700 }}>
              <span style={{ color: 'var(--green)' }}>{d.good || 0} dobrze</span> · <span style={{ color: d.bad ? 'var(--yellow)' : 'var(--muted)' }}>{d.bad || 0} do poprawy</span>
              {judged > 0 && <span className="text-muted"> · {Math.round(100 * d.good / judged)}%</span>}
              {d.share != null && <span className="text-muted"> · sz {Math.round(d.share * 100)}%</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function ParentExtras() {
  return (
    <>
      <CarefulWindows />
      <WeeklySample />
      <NightLog />
      <DayChecks />
    </>
  )
}
