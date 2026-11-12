// Gra "Sejf" — ćwiczenie powolnych, dokładnych okrążeń językiem wokół zamkniętych ust.
//
// Sejf ma kilka rygli. Dla każdego: na pierścieniu świeci RÓWEK (cel). Znacznik pokrętła podąża
// za językiem — język prowadzi go dookoła ust, trochę z przodu. Pokrętło kręci się ze stałą,
// spokojną prędkością, więc pośpiech nic nie daje: gdy język ucieknie za daleko przed znacznik,
// zębatki przestają łapać i pokrętło stoi. Gracz sam wybiera kierunek — krótsza droga do rowka
// to szybciej otwarty rygiel. Gdy znacznik stanie w rowku i tam zostanie, rygiel wpada.
// Cel: otworzyć wszystkie rygle w jak najkrótszym czasie, wygrywa precyzja, nie szybkość.
//
// Sterowanie: kamera + Mapa ust (gdy test trafności pozycji "dookoła ust" ≥ 80%).
// Tryb testowy: klawisze A / D obracają "język", z Shift za szybko; strzałki = cztery pozycje.

import { useEffect, useRef, useState } from 'react'
import { useMouthControl, isSimMode } from '../vision/useMouthControl'
import { getFaceMap, accuracyFor, CIRCLE_POSES, MIN_ACCURACY } from '../../data/faceMap'
import { addResult } from '../../data/resultsStore'
import SetupCheck from '../vision/SetupCheck'
import { getSetupMode } from '../../data/setupCheck'
import { playGameSound } from '../../components/useAlarm'

const DIAL_SPEED = 55        // stopni na sekundę — stała prędkość pokrętła
const LEAD_MIN   = 10        // język musi być co najmniej tyle stopni przed znacznikiem, żeby pokrętło ruszyło
const LEAD_MAX   = 115       // dalej niż tyle = "za szybko / za daleko", zębatki nie łapią
const TARGET_TOL = 9         // znacznik w rowku: ±9°
const DIAL_EASE_MS   = 220   // rozpędzanie i hamowanie pokrętła
const TONGUE_EASE_MS = 200   // wygładzanie pozycji języka z kamery (kamera podaje ją skokami)
const LOCK_MS    = 700       // tyle trzeba utrzymać znacznik w rowku
export const SAFE_POINTS_PER_BOLT = 4

const norm = (a) => ((a % 360) + 360) % 360
const diff = (a, b) => { const d = norm(a - b); return d > 180 ? d - 360 : d }   // a względem b, w (-180, 180]

function gearPath(r, teeth, depth) {
  let d = ''
  const n = teeth * 4
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = i % 4 < 2 ? r : r - depth
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)} `
  }
  return d + 'Z'
}
const GEAR_BIG = gearPath(34, 12, 6), GEAR_SMALL = gearPath(21, 8, 5)

export default function SafeGame({ exercise, onComplete }) {
  const bolts = Math.max(1, exercise.params?.bolts ?? 5)
  const ctl = useMouthControl()
  const [status, setStatus] = useState('intro')
  const [, setFrame] = useState(0)
  const [note, setNote] = useState('')
  const g = useRef(null)
  const rafRef = useRef(null)

  const map = getFaceMap()
  const acc = accuracyFor(map, CIRCLE_POSES)
  const cameraReady = acc != null && acc >= MIN_ACCURACY
  const sim = isSimMode()

  const newTarget = (dial) => norm(dial + (90 + Math.floor(Math.random() * 7) * 30) * (Math.random() < 0.5 ? 1 : -1))

  const finish = (opened) => {
    const s = g.current
    if (!s || s.done) return
    s.done = true
    cancelAnimationFrame(rafRef.current)
    ctl.stop()
    addResult('safe_game', {
      templateId: exercise.templateId || exercise.id, bolts: s.open, totalBolts: bolts, opened, setup: s.setup,
      timeSec: Math.round(s.t / 100) / 10, slipSec: Math.round(s.slipMs / 100) / 10,
      points: s.open * SAFE_POINTS_PER_BOLT + (opened ? 10 : 0),
    })
    setStatus('done')
  }

  const tick = () => {
    const s = g.current
    if (!s || s.done) return
    const now = performance.now()
    const dt = s.last ? Math.min(60, now - s.last) : 0
    s.last = now
    const r = ctl.read(CIRCLE_POSES)
    s.face = r.face
    s.state = 'idle'

    if (s.slide > 0) {                       // animacja wpadającego rygla
      s.slide = Math.max(0, s.slide - dt)
      s.w *= Math.exp(-dt / 90)
      s.dial = norm(s.dial + s.w * dt / 1000); s.gear += s.w * dt / 1000
      if (s.slide === 0) {
        if (s.open >= bolts) { finish(true); return }
        s.target = newTarget(s.dial)
      }
    } else if (r.face) {
      s.t += dt
      // wygładzony kąt języka (średnia ruchoma po okręgu)
      let wantW = 0
      if (r.angle != null) {
        if (s.tongue == null) s.tongue = r.angle
        else s.tongue = norm(s.tongue + diff(r.angle, s.tongue) * (1 - Math.exp(-dt / TONGUE_EASE_MS)))
        const lead = diff(s.tongue, s.dial)
        const a = Math.abs(lead)
        if (a > LEAD_MAX) { s.state = 'slip'; s.slipMs += dt }
        else if (a >= LEAD_MIN) { s.state = 'turn'; wantW = Math.sign(lead) * DIAL_SPEED }
        else s.state = 'hold'
      } else s.tongue = null
      // prędkość kątowa pokrętła narasta i wygasa płynnie — bez szarpnięć przy starcie i zatrzymaniu
      s.w += (wantW - s.w) * (1 - Math.exp(-dt / DIAL_EASE_MS))
      if (Math.abs(s.w) < 0.3 && wantW === 0) s.w = 0
      const step = s.w * dt / 1000
      s.dial = norm(s.dial + step)
      s.gear += step

      // rygiel: znacznik w rowku przez LOCK_MS
      if (Math.abs(diff(s.dial, s.target)) <= TARGET_TOL) {
        s.lock += dt
        if (s.lock >= LOCK_MS) {
          s.open++; s.lock = 0; s.slide = 550
          playGameSound('crash', 0.35)
        }
      } else s.lock = 0
    }
    setFrame(f => (f + 1) % 100000)
    rafRef.current = requestAnimationFrame(tick)
  }

  const begin = async () => {
    setStatus('loading')
    const m = sim || cameraReady ? await ctl.start() : 'none'
    if (m !== 'camera' && m !== 'sim') { setNote('Nie udało się uruchomić kamery.'); setStatus('intro'); return }
    if (m === 'camera' && getSetupMode() !== 'off') { setStatus('setup'); return }
    run(m === 'camera' ? 'off' : null)
  }
  const run = (setup) => {
    g.current = { dial: 270, w: 0, target: newTarget(270), tongue: null, gear: 0, open: 0, lock: 0, slide: 0, t: 0, last: 0,
                  slipMs: 0, state: 'idle', dirNow: 0, face: true, done: false, setup }
    setStatus('playing')
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); ctl.stop() }, [ctl])

  if (status === 'setup') {
    return <SetupCheck face={ctl.face} reference={map?.setup || null} onReady={() => run('checked')} />
  }

  if (status === 'intro' || status === 'loading') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <svg viewBox="0 0 320 300" width="220" aria-hidden="true"><SafeDefs /><SafeDoor dial={300} target={30} gear={20} open={2} bolts={bolts} lock={0} slide={0} state="idle" /></svg>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Otwórz sejf językiem</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '8px 0 12px', lineHeight: 1.55 }}>
          Usta zamknięte. Prowadź język dookoła, między zębami a wargami, tuż przed świecącym znacznikiem.
          Doprowadź znacznik do rowka i zatrzymaj. Powoli i dokładnie: gdy język ucieknie, pokrętło stoi.
          Rygli do otwarcia: {bolts}.
        </p>
        {!cameraReady && !sim && (
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)', marginBottom: 10 }}>
            {map ? `Mapa ust rozpoznaje pozycje języka dookoła ust w ${Math.round((acc || 0) * 100)}% — to za mało, żeby sterować sejfem.` : 'Brak Mapy ust.'}
            {' '}Kalibracja: strefa dorosłego → Kalibracja → Mapa ust. Do tego czasu ćwicz okrążenia w „Język za zamkniętymi ustami”.
          </div>
        )}
        {note && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>{note}</div>}
        <button className="btn btn-primary btn-full" disabled={status === 'loading' || (!cameraReady && !sim)} onClick={begin}>
          {status === 'loading' ? 'Uruchamiam kamerę…' : sim ? 'Start (tryb testowy: A / D)' : 'Start'}
        </button>
      </div>
    )
  }

  const s = g.current
  const time = `${Math.floor(s.t / 60000)}:${String(Math.floor(s.t / 1000) % 60).padStart(2, '0')}`

  if (status === 'done') {
    const opened = s.open >= bolts
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: opened ? 'var(--green)' : 'var(--text)' }}>{opened ? 'Sejf otwarty!' : `Otwarte rygle: ${s.open} z ${bolts}`}</div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 40, color: 'var(--primary)' }}>{time}</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '4px 0 14px' }}>
          Czas, gdy zębatki nie łapały (język za daleko): {Math.round(s.slipMs / 1000)} s. Im mniej, tym spokojniejszy ruch.
        </p>
        <button className="btn btn-green btn-full" onClick={() => onComplete()}>Ukończ ćwiczenie</button>
        <button className="btn btn-outline btn-full mt-8" onClick={begin}>Jeszcze raz</button>
      </div>
    )
  }

  const d = diff(s.target, s.dial)
  const hint = !s.face ? 'Nie widzę twarzy'
    : s.slide > 0 ? 'Rygiel wpadł!'
    : s.lock > 0 ? 'W rowku — trzymaj'
    : s.state === 'slip' ? 'Za daleko — wróć językiem przed znacznik'
    : s.state === 'turn' ? 'Dobrze, prowadź spokojnie'
    : s.tongue == null ? 'Wypchnij język i prowadź znacznik do rowka'
    : 'Przesuń język trochę dalej, przed znacznik'
  return (
    <div className="card" style={{ textAlign: 'center', userSelect: 'none', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 6px 4px' }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>Rygiel {Math.min(s.open + 1, bolts)} z {bolts}</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 20 }}>{time}</span>
      </div>
      <svg viewBox="0 0 320 300" width="100%" style={{ maxWidth: 380, display: 'block', margin: '0 auto' }}>
        <SafeDefs />
        <SafeDoor dial={s.dial} target={s.target} gear={s.gear} open={s.open} bolts={bolts} lock={s.lock / LOCK_MS} slide={s.slide / 550}
          state={s.state} tongue={s.tongue} shorter={Math.sign(d)} />
      </svg>
      <div style={{ fontWeight: 800, fontSize: 17, minHeight: 24, color: s.state === 'slip' || !s.face ? 'var(--orange)' : s.lock > 0 || s.slide > 0 ? 'var(--green)' : 'var(--text)' }}>{hint}</div>
      <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>
        Krótsza droga do rowka: {d > 0 ? 'zgodnie z zegarem ↻' : 'przeciwnie do zegara ↺'}
      </div>
      <button className="btn btn-ghost btn-full mt-8" onClick={() => finish(false)}>Zakończ</button>
    </div>
  )
}

function SafeDefs() {
  return (
    <defs>
      <linearGradient id="sfDoor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#64748B" /><stop offset=".35" stopColor="#334155" /><stop offset="1" stopColor="#0F172A" /></linearGradient>
      <linearGradient id="sfFrame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#94A3B8" /><stop offset=".5" stopColor="#475569" /><stop offset="1" stopColor="#1E293B" /></linearGradient>
      <radialGradient id="sfDial" cx=".35" cy=".3" r=".85"><stop offset="0" stopColor="#F8FAFC" /><stop offset=".35" stopColor="#CBD5E1" /><stop offset=".8" stopColor="#64748B" /><stop offset="1" stopColor="#334155" /></radialGradient>
      <radialGradient id="sfKnob" cx=".35" cy=".3" r=".9"><stop offset="0" stopColor="#E2E8F0" /><stop offset=".5" stopColor="#475569" /><stop offset="1" stopColor="#0F172A" /></radialGradient>
      <radialGradient id="sfGear" cx=".35" cy=".3" r=".9"><stop offset="0" stopColor="#FDE68A" /><stop offset=".5" stopColor="#D97706" /><stop offset="1" stopColor="#78350F" /></radialGradient>
      <linearGradient id="sfBolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F1F5F9" /><stop offset=".45" stopColor="#94A3B8" /><stop offset="1" stopColor="#475569" /></linearGradient>
      <radialGradient id="sfGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#22C55E" stopOpacity=".95" /><stop offset="1" stopColor="#22C55E" stopOpacity="0" /></radialGradient>
      <filter id="sfShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="2" dy="4" stdDeviation="4" floodColor="#000" floodOpacity=".5" /></filter>
    </defs>
  )
}

// Drzwi sejfu: pokrętło ze znacznikiem, pierścień z rowkiem, zębatki sprzężone z pokrętłem, rygiel i lampki.
function SafeDoor({ dial, target, gear, open, bolts, lock, slide, state, tongue = null, shorter = 0 }) {
  const cx = 130, cy = 152, R = 84
  const pos = (deg, r) => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r]
  const [tx, ty] = pos(target, R + 13)
  const [mx, my] = pos(dial, R - 16)
  const boltX = 262 + (slide > 0 ? (1 - slide) * 26 : 0)
  const shake = state === 'slip' ? Math.sin(performance.now() / 30) * 1.5 : 0
  return (
    <g>
      <rect x="6" y="14" width="308" height="276" rx="20" fill="url(#sfFrame)" />
      <rect x="18" y="26" width="284" height="252" rx="14" fill="url(#sfDoor)" stroke="#0B1220" strokeWidth="2" />
      <rect x="18" y="26" width="284" height="60" rx="14" fill="#fff" opacity=".05" />
      {[[32, 40], [288, 40], [32, 264], [288, 264]].map(([x, y], i) => (
        <g key={i}><circle cx={x} cy={y} r="6" fill="url(#sfKnob)" /><circle cx={x - 1.5} cy={y - 1.5} r="1.6" fill="#fff" opacity=".7" /></g>
      ))}

      {/* lampki rygli */}
      {[...Array(bolts)].map((_, i) => {
        const x = 160 - ((bolts - 1) * 16) / 2 + i * 16
        const on = i < open
        return <g key={i}>{on && <circle cx={x} cy="46" r="9" fill="url(#sfGlow)" />}<circle cx={x} cy="46" r="4.5" fill={on ? '#4ADE80' : '#1E293B'} stroke="#0B1220" /></g>
      })}

      {/* zębatki: kręcą się razem z pokrętłem, przy poślizgu drżą */}
      <g transform={`translate(${246 + shake} 118) rotate(${-gear * 2.2})`} filter="url(#sfShadow)"><path d={GEAR_BIG} fill="url(#sfGear)" stroke="#451A03" /><circle r="9" fill="#451A03" /><circle r="4" fill="#FDE68A" /></g>
      <g transform={`translate(${268 - shake} 172) rotate(${gear * 3.4 + 12})`} filter="url(#sfShadow)"><path d={GEAR_SMALL} fill="url(#sfGear)" stroke="#451A03" /><circle r="6" fill="#451A03" /></g>

      {/* rygiel i jego gniazdo */}
      <rect x="240" y="212" width="58" height="26" rx="5" fill="#0B1220" />
      <rect x={boltX - 30} y="216" width="44" height="18" rx="4" fill="url(#sfBolt)" stroke="#1E293B" />
      <rect x={boltX - 28} y="218" width="40" height="4" rx="2" fill="#fff" opacity=".5" />

      {/* pierścień z podziałką i rowkiem (celem) */}
      <circle cx={cx} cy={cy} r={R + 14} fill="#0B1220" />
      <circle cx={cx} cy={cy} r={R + 12} fill="none" stroke="#1E293B" strokeWidth="18" />
      {[...Array(24)].map((_, i) => { const [x1, y1] = pos(i * 15, R + 6), [x2, y2] = pos(i * 15, R + (i % 2 ? 14 : 19)); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748B" strokeWidth={i % 2 ? 1 : 2} /> })}
      <circle cx={tx} cy={ty} r="17" fill="url(#sfGlow)" opacity={0.55 + lock * 0.45} />
      <circle cx={tx} cy={ty} r="8.5" fill="#052E16" stroke="#4ADE80" strokeWidth="2.5" />

      {/* pokrętło */}
      <g filter="url(#sfShadow)">
        <circle cx={cx} cy={cy} r={R} fill="url(#sfDial)" stroke="#1E293B" strokeWidth="2" />
        <g transform={`rotate(${dial} ${cx} ${cy})`}>
          {[...Array(12)].map((_, i) => <line key={i} x1={cx + R - 9} y1={cy} x2={cx + R - 3} y2={cy} stroke="#334155" strokeWidth="2" transform={`rotate(${i * 30} ${cx} ${cy})`} />)}
          <rect x={cx - 8} y={cy - 46} width="16" height="92" rx="8" fill="url(#sfKnob)" transform={`rotate(90 ${cx} ${cy})`} />
        </g>
        <circle cx={cx} cy={cy} r="26" fill="url(#sfKnob)" stroke="#0B1220" />
        <ellipse cx={cx - 26} cy={cy - 34} rx="26" ry="12" fill="#fff" opacity=".22" transform={`rotate(-35 ${cx - 26} ${cy - 34})`} />
      </g>
      {/* znacznik pokrętła — to on ma trafić do rowka */}
      <circle cx={mx} cy={my} r="9" fill={lock > 0 ? '#4ADE80' : 'var(--primary)'} stroke="#fff" strokeWidth="2.5" />
      {/* gdzie system widzi język */}
      {tongue != null && (() => { const [x, y] = pos(tongue, R + 34); return <circle cx={x} cy={y} r="5" fill="#F8FAFC" opacity=".85" /> })()}
      {shorter !== 0 && lock === 0 && slide === 0 && (
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize="22" fontWeight="800" fill="#E2E8F0">{shorter > 0 ? '↻' : '↺'}</text>
      )}
    </g>
  )
}
