// Gra "Auto" — ćwiczenie wypychania policzków językiem przy zamkniętych ustach.
//
// Auto jedzie samo, ze stałą prędkością. Język w LEWYM policzku = skręt w lewo, w PRAWYM = w prawo,
// usta w spoczynku = jedzie prosto. Monety pojawiają się na przemian po obu stronach, więc oba
// policzki pracują tyle samo. Pachołki trzeba ominąć.
//
// Sterowanie: kamera + Mapa ust (gdy test trafności policzków ≥ 80%). Bez tego gra proponuje
// przyciski na ekranie — da się pograć, ale wynik jest oznaczony jako "bez kamery" i nie daje punktów
// terapeutycznych. Tryb testowy: strzałki ← →.

import { useEffect, useRef, useState } from 'react'
import { useMouthControl, isSimMode } from '../vision/useMouthControl'
import { getFaceMap, accuracyFor, STEER_POSES, MIN_ACCURACY } from '../../data/faceMap'
import { addResult } from '../../data/resultsStore'
import SetupCheck from '../vision/SetupCheck'
import { getSetupMode } from '../../data/setupCheck'
import { playGameSound } from '../../components/useAlarm'

const W = 300, H = 480
const ROAD_L = 62, ROAD_R = 238
const LANES = [92, 150, 208]
const CAR_Y = 396
const SPEED = 150            // px/s — stała prędkość jazdy
const STEER = 120            // px/s — prędkość skrętu przy wypchniętym policzku
const SPAWN_MS = 1500
const STEER_EASE_MS = 170    // jak szybko auto wchodzi w skręt i z niego wychodzi
export const CAR_POINTS_PER_COIN = 2

export default function CarGame({ exercise, onComplete }) {
  const durationSec = Math.max(30, exercise.params?.gameDurationSec ?? 120)
  const ctl = useMouthControl()
  const [status, setStatus] = useState('intro')      // intro | loading | playing | done
  const [control, setControl] = useState('none')     // camera | sim | buttons
  const [, setFrame] = useState(0)
  const [note, setNote] = useState('')
  const g = useRef(null)
  const rafRef = useRef(null)
  const btnRef = useRef(0)                            // -1 / 0 / 1 z przycisków ekranowych
  const pendingRef = useRef('none')

  const map = getFaceMap()
  const steerAcc = accuracyFor(map, STEER_POSES)
  const cameraReady = steerAcc != null && steerAcc >= MIN_ACCURACY

  const finish = () => {
    const s = g.current
    if (!s || s.done) return
    s.done = true
    cancelAnimationFrame(rafRef.current)
    ctl.stop()
    addResult('car_game', {
      templateId: exercise.templateId || exercise.id, coins: s.coins, hits: s.hits, control: s.control, setup: s.setup,
      leftMs: Math.round(s.leftMs), rightMs: Math.round(s.rightMs), durationSec: Math.round(s.t / 1000),
      points: s.control === 'buttons' ? 0 : s.coins * CAR_POINTS_PER_COIN,
    })
    setStatus('done')
  }

  const tick = () => {
    const s = g.current
    if (!s || s.done) return
    const now = performance.now()
    const dt = s.last ? Math.min(60, now - s.last) : 0
    s.last = now

    // sterowanie
    let dir = 0, paused = false
    if (s.control === 'buttons') dir = btnRef.current
    else {
      const r = ctl.read(STEER_POSES)
      if (!r.face) paused = true
      else if (r.pose === 'cheekL') dir = -1
      else if (r.pose === 'cheekR') dir = 1
      s.turned = !!r.turned
    }
    s.paused = paused
    if (!paused) {
      s.t += dt
      s.dir = dir
      if (dir < 0) s.leftMs += dt
      if (dir > 0) s.rightMs += dt
      // prędkość boczna narasta i wygasa płynnie (stała czasowa ~170 ms), więc auto nie szarpie,
      // nawet gdy rozpoznanie policzka na chwilę zamigocze
      s.vx += (dir * STEER - s.vx) * (1 - Math.exp(-dt / STEER_EASE_MS))
      const nx = s.x + s.vx * dt / 1000
      s.x = Math.max(ROAD_L + 28, Math.min(ROAD_R - 28, nx))
      if (s.x !== nx) s.vx *= 0.5                       // przy krawędzi drogi miękko wytracamy skręt
      s.tilt = (s.vx / STEER) * 10                      // przechył nadwozia wynika z prędkości skrętu
      s.scroll = (s.scroll + SPEED * dt / 1000) % 48

      // nowe obiekty: moneta na przemian lewy / prawy pas (środek co trzeci raz), czasem pachołek obok
      s.spawnIn -= dt
      if (s.spawnIn <= 0) {
        s.spawnIn = SPAWN_MS
        s.n++
        const lane = s.n % 3 === 0 ? 1 : (s.n % 2 === 0 ? 0 : 2)
        s.items.push({ id: s.n, kind: 'coin', x: LANES[lane], y: -20 })
        if (s.n % 4 === 2) s.items.push({ id: s.n + 0.5, kind: 'cone', x: LANES[lane === 1 ? (s.n % 8 === 2 ? 0 : 2) : 1], y: -90 })
      }
      for (const it of s.items) {
        it.y += SPEED * dt / 1000
        if (!it.gone && Math.abs(it.y - CAR_Y) < 26 && Math.abs(it.x - s.x) < 26) {
          it.gone = true
          if (it.kind === 'coin') { s.coins++; playGameSound('pump', 0.8) }
          else { s.hits++; s.shake = 300; playGameSound('gutter') }
        }
      }
      s.items = s.items.filter(it => it.y < H + 30 && !it.gone)
      s.shake = Math.max(0, s.shake - dt)
      if (s.t >= durationSec * 1000) { finish(); return }
    }
    setFrame(f => (f + 1) % 100000)
    rafRef.current = requestAnimationFrame(tick)
  }

  const begin = async (useButtons = false) => {
    let mode = 'buttons'
    if (!useButtons) {
      setStatus('loading')
      const m = isSimMode() ? await ctl.start() : cameraReady ? await ctl.start() : 'none'
      if (m === 'camera' || m === 'sim') mode = m
      else { setNote('Nie udało się uruchomić kamery. Można zagrać przyciskami.'); setStatus('intro'); return }
    }
    setControl(mode)
    pendingRef.current = mode
    // przy sterowaniu kamerą najpierw kontrola stanowiska (porównanie z warunkami z kalibracji)
    if (mode === 'camera' && getSetupMode() !== 'off') { setStatus('setup'); return }
    run(mode, mode === 'camera' ? 'off' : null)
  }
  const run = (mode, setup) => {
    g.current = { x: 150, vx: 0, tilt: 0, dir: 0, scroll: 0, items: [], spawnIn: 600, n: 0, coins: 0, hits: 0, t: 0, last: 0,
                  leftMs: 0, rightMs: 0, shake: 0, paused: false, done: false, control: mode, setup }
    setStatus('playing')
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); ctl.stop() }, [ctl])

  if (status === 'setup') {
    return <SetupCheck face={ctl.face} reference={map?.setup || null} onReady={() => run(pendingRef.current, 'checked')} />
  }

  if (status === 'intro' || status === 'loading') {
    const sim = isSimMode()
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <svg viewBox="0 0 120 150" width="110" height="130" aria-hidden="true"><CarDefs /><Car x={60} y={80} tilt={0} /></svg>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Kieruj policzkami</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '8px 0 12px', lineHeight: 1.55 }}>
          Usta zamknięte. Język w lewy policzek: auto skręca w lewo. W prawy: w prawo. Zbieraj monety, omijaj pachołki.
        </p>
        {!cameraReady && !sim && (
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)', marginBottom: 10 }}>
            {map ? `Mapa ust rozpoznaje policzki w ${Math.round((steerAcc || 0) * 100)}% — to za mało do sterowania kamerą.` : 'Brak Mapy ust.'}
            {' '}Kalibracja: strefa dorosłego → Kalibracja → Mapa ust.
          </div>
        )}
        {note && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>{note}</div>}
        {(cameraReady || sim) && (
          <button className="btn btn-primary btn-full" disabled={status === 'loading'} onClick={() => begin(false)}>
            {status === 'loading' ? 'Uruchamiam kamerę…' : sim ? 'Start (tryb testowy: strzałki)' : 'Start'}
          </button>
        )}
        <button className={`btn btn-full mt-8 ${cameraReady || sim ? 'btn-ghost' : 'btn-outline'}`} onClick={() => begin(true)}>
          Zagraj przyciskami (bez kamery, bez punktów)
        </button>
      </div>
    )
  }

  const s = g.current
  if (status === 'done') {
    const total = s.leftMs + s.rightMs
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 44, color: 'var(--primary)' }}>{s.coins}</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>zebrane monety · stłuczki: {s.hits}</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 14px' }}>
          {s.control === 'buttons' ? 'Gra przyciskami — bez punktów.' : `Lewy policzek ${total ? Math.round((s.leftMs / total) * 100) : 0}% czasu skrętów, prawy ${total ? Math.round((s.rightMs / total) * 100) : 0}%.`}
        </p>
        <button className="btn btn-green btn-full" onClick={() => onComplete()}>Ukończ ćwiczenie</button>
        <button className="btn btn-outline btn-full mt-8" onClick={() => begin(s.control === 'buttons')}>Jeszcze raz</button>
      </div>
    )
  }

  const left = Math.max(0, Math.ceil(durationSec - s.t / 1000))
  const shakeX = s.shake > 0 ? Math.sin(s.shake / 18) * 4 : 0
  return (
    <div className="card" style={{ textAlign: 'center', userSelect: 'none', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 6px 6px' }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 22 }}>{s.coins}<span className="text-muted" style={{ fontSize: 14 }}> monet</span></span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 18 }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 340, borderRadius: 16, display: 'block', margin: '0 auto' }}>
        <CarDefs />
        <g transform={`translate(${shakeX} 0)`}>
          <rect width={W} height={H} fill="url(#stcGrass)" />
          <rect x={ROAD_L - 8} y="0" width={ROAD_R - ROAD_L + 16} height={H} fill="#E5E7EB" />
          <rect x={ROAD_L} y="0" width={ROAD_R - ROAD_L} height={H} fill="url(#stcRoad)" />
          {[121, 179].map(x => (
            <line key={x} x1={x} y1={-48 + s.scroll} x2={x} y2={H} stroke="#F8FAFC" strokeWidth="4" strokeDasharray="24 24" opacity=".85" />
          ))}
          <rect x={ROAD_L} y="0" width={ROAD_R - ROAD_L} height={H} fill="url(#stcRoadLight)" />
          {s.items.map(it => it.kind === 'coin' ? <Coin key={it.id} x={it.x} y={it.y} /> : <Cone key={it.id} x={it.x} y={it.y} />)}
          <Car x={s.x} y={CAR_Y} tilt={s.tilt} />
          <rect width={W} height={H} fill="url(#stcVignette)" />
        </g>
        {s.paused && (<>
          <rect width={W} height={H} fill="#0008" />
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#fff" fontSize="17" fontWeight="800">Nie widzę twarzy</text>
        </>)}
      </svg>

      {/* wskaźnik: co system widzi */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 }}>
        {[[-1, '◀ lewy policzek'], [1, 'prawy policzek ▶']].map(([d, label]) => (
          control === 'buttons' ? (
            <button key={d} className="btn btn-outline" style={{ flex: 1, padding: '16px 8px' }}
              onPointerDown={() => { btnRef.current = d }} onPointerUp={() => { btnRef.current = 0 }} onPointerLeave={() => { btnRef.current = 0 }}>{label}</button>
          ) : (
            <span key={d} style={{ flex: 1, padding: '10px 8px', borderRadius: 12, fontWeight: 800, fontSize: 14,
              background: s.dir === d ? 'var(--primary)' : 'var(--soft)', color: s.dir === d ? 'var(--on-primary)' : 'var(--muted)' }}>{label}</span>
          )
        ))}
      </div>
      {s.turned && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)', marginTop: 6 }}>Patrz prosto w ekran — obrócona głowa nie steruje.</div>}
      <button className="btn btn-ghost btn-full mt-8" onClick={finish}>Zakończ jazdę</button>
    </div>
  )
}

// Gradienty i filtry wspólne dla sceny: światło pada z góry-lewej, obiekty mają cień i połysk.
function CarDefs() {
  return (
    <defs>
      <linearGradient id="stcGrass" x1="0" x2="1"><stop offset="0" stopColor="#14532D" /><stop offset=".5" stopColor="#166534" /><stop offset="1" stopColor="#14532D" /></linearGradient>
      <linearGradient id="stcRoad" x1="0" x2="1"><stop offset="0" stopColor="#262B36" /><stop offset=".5" stopColor="#3A4150" /><stop offset="1" stopColor="#262B36" /></linearGradient>
      <linearGradient id="stcRoadLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity=".45" /><stop offset=".45" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".06" /></linearGradient>
      <radialGradient id="stcVignette" cx=".5" cy=".62" r=".75"><stop offset=".6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".45" /></radialGradient>
      <linearGradient id="stcCarBody" x1="0" x2="1"><stop offset="0" stopColor="#7F1D1D" /><stop offset=".28" stopColor="#EF4444" /><stop offset=".5" stopColor="#FCA5A5" /><stop offset=".72" stopColor="#DC2626" /><stop offset="1" stopColor="#7F1D1D" /></linearGradient>
      <linearGradient id="stcGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E0F2FE" /><stop offset=".45" stopColor="#38BDF8" /><stop offset="1" stopColor="#0C4A6E" /></linearGradient>
      <radialGradient id="stcCoin" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FEF9C3" /><stop offset=".45" stopColor="#FACC15" /><stop offset="1" stopColor="#A16207" /></radialGradient>
      <linearGradient id="stcCone" x1="0" x2="1"><stop offset="0" stopColor="#9A3412" /><stop offset=".4" stopColor="#FB923C" /><stop offset="1" stopColor="#9A3412" /></linearGradient>
      <radialGradient id="stcLamp" cx=".5" cy="1" r="1"><stop offset="0" stopColor="#FEF08A" stopOpacity=".7" /><stop offset="1" stopColor="#FEF08A" stopOpacity="0" /></radialGradient>
      <filter id="stcSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
    </defs>
  )
}

function Car({ x, y, tilt }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <ellipse cx="4" cy="8" rx="24" ry="36" fill="#000" opacity=".45" filter="url(#stcSoft)" />
      <path d="M-15 -36 L15 -36 L34 -112 L-34 -112 Z" fill="url(#stcLamp)" />
      {[[-21, -24], [21, -24], [-21, 22], [21, 22]].map(([wx, wy], i) => <rect key={i} x={wx - 5} y={wy - 9} width="10" height="18" rx="3" fill="#0B0F17" />)}
      <rect x="-19" y="-38" width="38" height="76" rx="11" fill="url(#stcCarBody)" stroke="#450A0A" strokeWidth="1" />
      <path d="M-14 -18 Q0 -26 14 -18 L11 -4 L-11 -4 Z" fill="url(#stcGlass)" />
      <rect x="-12" y="-4" width="24" height="22" rx="4" fill="#991B1B" />
      <rect x="-12" y="-4" width="24" height="22" rx="4" fill="#fff" opacity=".12" />
      <path d="M-11 18 L11 18 L13 27 Q0 31 -13 27 Z" fill="url(#stcGlass)" opacity=".85" />
      <rect x="-15" y="-37" width="9" height="4" rx="2" fill="#FEF9C3" /><rect x="6" y="-37" width="9" height="4" rx="2" fill="#FEF9C3" />
      <rect x="-15" y="33" width="8" height="3" rx="1.5" fill="#F87171" /><rect x="7" y="33" width="8" height="3" rx="1.5" fill="#F87171" />
      <path d="M-13 -33 Q-6 -37 2 -36" stroke="#fff" strokeWidth="2.2" fill="none" opacity=".55" strokeLinecap="round" />
    </g>
  )
}

function Coin({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="3" cy="5" rx="12" ry="10" fill="#000" opacity=".35" filter="url(#stcSoft)" />
      <circle r="13" fill="url(#stcCoin)" stroke="#854D0E" strokeWidth="1.5" />
      <circle r="8.5" fill="none" stroke="#FDE68A" strokeWidth="1.5" opacity=".8" />
      <ellipse cx="-4" cy="-5" rx="4" ry="2.5" fill="#fff" opacity=".7" transform="rotate(-30)" />
    </g>
  )
}

function Cone({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="4" cy="8" rx="15" ry="9" fill="#000" opacity=".4" filter="url(#stcSoft)" />
      <rect x="-15" y="-15" width="30" height="30" rx="5" fill="#7C2D12" />
      <circle r="11" fill="url(#stcCone)" />
      <circle r="6.5" fill="#FFF7ED" /><circle r="3.5" fill="url(#stcCone)" />
      <ellipse cx="-3" cy="-4" rx="2.2" ry="1.4" fill="#fff" opacity=".8" />
    </g>
  )
}
