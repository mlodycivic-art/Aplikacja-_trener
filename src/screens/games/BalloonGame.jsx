// Gra "Balon" do ćwiczenia SZ Lip Shape.
//
// Zasada: jeden cykl = dzióbek utrzymany przez X sekund, potem odpoczynek z zamkniętymi
// ustami przez Y sekund. Każdy udany cykl dopompowuje balon. Po N cyklach balon odlatuje.
// X, Y, N i poziom trudności ustawia trener (Trener → SZ Lip Shape → Ustawienia gry).
//
// Gra przyznaje postęp WYŁĄCZNIE za wykryty dzióbek — sam upływ czasu nic nie daje.
// Dziecko nie widzi obrazu z kamery, tylko balon i prosty wskaźnik ust.
//
// Wersja 1 ocenia sam OBRAZ (układ warg). Dźwięk "sz" z mikrofonu dołączymy po
// kalibracji mikrofonu — miejsce na to jest oznaczone niżej jako [MIKROFON].
//
// Tryb testowy bez kamery: w konsoli przeglądarki wpisz
//   localStorage.setItem('stc_debug_sim', '1')
// i odśwież. Wtedy dzióbek = przytrzymany przycisk na ekranie albo spacja.

import { useEffect, useRef, useState } from 'react'
import { useFaceEngine } from '../vision/useFaceEngine'
import { checkPucker, checkMouthClosed } from '../vision/detectors'
import { getAgeProfile } from '../vision/ageProfiles'
import { getFaceProfile, personalPuckerLevel, personalMouthClosed } from '../../data/faceProfile'
import { addResult } from '../../data/resultsStore'
import { playGameSound } from '../../components/useAlarm'
import SetupCheck from '../vision/SetupCheck'
import { getSetupMode } from '../../data/setupCheck'
import { getFaceMap } from '../../data/faceMap'

const REQUIRED_LEVEL = { easy: 1, normal: 2, hard: 3 }   // wymagany poziom dzióbka (1–3)
const DROPOUT_MS     = 250    // tak krótka utrata dzióbka nie zeruje utrzymania (mrugnięcie detektora)
const FACE_LOST_MS   = 1200   // po tylu ms bez twarzy gra się wstrzymuje
const BALLOON_COLORS = ['#DC2626', '#2563EB', '#16A34A', '#EA580C', '#7C3AED']

function isSimMode() {
  try { return localStorage.getItem('stc_debug_sim') === '1' } catch (e) { return false }
}

export default function BalloonGame({ exercise, ageGroup, onComplete, onExit }) {
  const p            = exercise.params || {}
  const puckerMs     = (p.puckerDurationSec ?? 2) * 1000
  const restMs       = (p.restDurationSec ?? 1) * 1000
  const targetCycles = Math.max(1, p.targetCycles ?? 30)
  const difficulty   = p.gameDifficulty || 'normal'
  const needLevel    = REQUIRED_LEVEL[difficulty] || 2
  const profile      = getAgeProfile(ageGroup)
  // Osobisty profil ust (Kalibracja → Osobista kalibracja ust) ma pierwszeństwo przed progami grupy wiekowej
  const personal     = useRef(getFaceProfile()).current

  const face = useFaceEngine()
  const sim  = useRef(isSimMode()).current
  const simPuckerRef = useRef(false)

  const [status, setStatus] = useState('intro')        // intro | loading | playing | done | error
  const [ui, setUi] = useState({ phase: 'pucker', hold: 0, cycles: 0, mouth: 'none', paused: false })
  const [elapsedSec, setElapsedSec] = useState(0)
  const [color] = useState(() => BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)])

  const g = useRef({
    phase: 'pucker', holdMs: 0, cycles: 0, lastOkT: 0, lastT: 0, startT: 0, activeMs: 0, done: false,
  })
  const rafRef = useRef(null)
  const loggedRef = useRef(false)

  const logResult = (completed) => {
    if (loggedRef.current) return
    loggedRef.current = true
    const s = g.current
    if (s.cycles === 0 && !completed) return
    addResult('balloon_game', {
      templateId: exercise.templateId || exercise.id,
      cycles: s.cycles, targetCycles, difficulty, completed,
      durationSec: Math.round(s.activeMs / 1000),
    })
  }

  // ── Pętla gry ───────────────────────────────────────────────────────────────
  const tick = () => {
    const s = g.current
    const now = performance.now()
    const dt = s.lastT ? Math.min(100, now - s.lastT) : 0
    s.lastT = now

    // 1. Odczyt ust: 'pucker' | 'closed' | 'other' | 'none' (brak twarzy)
    let mouth = 'none'
    if (sim) {
      mouth = simPuckerRef.current ? 'pucker' : 'closed'
    } else {
      const points = face.getPoints()
      if (points && face.msSinceFace() < FACE_LOST_MS) {
        const size = face.getCanvasSize()
        const pk = checkPucker(points, size, profile.pucker)
        const level = personal ? personalPuckerLevel(pk.widthRatio, pk.aspect, personal) : pk.level
        if (level >= needLevel) mouth = 'pucker'
        else {
          const cl = checkMouthClosed(points, size, profile.mouth)
          const closed = personal ? personalMouthClosed(pk.aspect, personal) : cl.closedEnough
          // Na poziomie łatwym odpoczynek = po prostu brak dzióbka; wyżej = usta zamknięte
          mouth = (difficulty === 'easy' ? level === 0 : closed) ? 'closed' : 'other'
        }
      }
      // [MIKROFON] tu dojdzie warunek: podczas dzióbka słychać szum "sz" (useSibilantMeter)
    }

    const paused = mouth === 'none'
    if (!paused && !s.done) {
      s.activeMs += dt
      if (s.phase === 'pucker') {
        if (mouth === 'pucker') { s.holdMs += dt; s.lastOkT = now }
        else if (now - s.lastOkT > DROPOUT_MS) s.holdMs = 0
        if (s.holdMs >= puckerMs) {
          s.cycles += 1
          playGameSound('pump', s.cycles / targetCycles)
          s.holdMs = 0
          s.lastOkT = now
          if (s.cycles >= targetCycles) {
            s.done = true
            logResult(true)
            setStatus('done')
          } else {
            s.phase = 'rest'
          }
        }
      } else {
        if (mouth === 'closed') { s.holdMs += dt; s.lastOkT = now }
        else if (now - s.lastOkT > DROPOUT_MS) s.holdMs = 0
        if (s.holdMs >= restMs) { s.phase = 'pucker'; s.holdMs = 0; s.lastOkT = now }
      }
    } else if (paused) {
      s.holdMs = 0
    }

    const need = s.phase === 'pucker' ? puckerMs : restMs
    setUi({ phase: s.phase, hold: Math.min(1, s.holdMs / need), cycles: s.cycles, mouth, paused })
    setElapsedSec(Math.round(s.activeMs / 1000))
    if (!s.done) rafRef.current = requestAnimationFrame(tick)
  }

  const begin = async () => {
    if (!sim) {
      setStatus('loading')
      const ok = await face.start()
      if (!ok) { setStatus('error'); return }
      if (getSetupMode() !== 'off') { setStatus('setup'); return }   // kontrola stanowiska przed grą
    }
    run()
  }
  const run = () => {
    g.current = { phase: 'pucker', holdMs: 0, cycles: 0, lastOkT: performance.now(), lastT: 0, startT: performance.now(), activeMs: 0, done: false }
    loggedRef.current = false
    setStatus('playing')
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  // Sprzątanie: kamera wyłączona zawsze przy wyjściu z gry
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    logResult(false)
    face.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (status === 'done') { cancelAnimationFrame(rafRef.current); face.stop() } }, [status, face])

  // Tryb testowy: spacja = dzióbek
  useEffect(() => {
    if (!sim) return
    const down = (e) => { if (e.code === 'Space') { e.preventDefault(); simPuckerRef.current = true } }
    const up   = (e) => { if (e.code === 'Space') { e.preventDefault(); simPuckerRef.current = false } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [sim])

  if (status === 'setup') {
    return <SetupCheck face={face} reference={getFaceMap()?.setup || null} onReady={run} />
  }

  // ── Widoki ──────────────────────────────────────────────────────────────────
  if (status === 'intro' || status === 'loading' || status === 'error') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <BalloonSvg fill={0.55} color={color} />
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 6 }}>Napompuj balon</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '8px 0 14px', lineHeight: 1.55 }}>
          Zrób dzióbek i trzymaj {p.puckerDurationSec ?? 2} s, potem zamknij usta na {p.restDurationSec ?? 1} s.
          Każdy cykl to jedno pompnięcie. Do pełna: {targetCycles}.
        </p>
        {status === 'error' && (
          <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{face.getError()}</div>
        )}
        <button className="btn btn-primary btn-full" disabled={status === 'loading'} onClick={begin}>
          {status === 'loading' ? 'Uruchamiam kamerę…' : status === 'error' ? 'Spróbuj ponownie' : 'Zaczynamy'}
        </button>
        <button className="btn btn-ghost btn-full mt-8" onClick={onExit}>Wróć do wyboru trybu</button>
        {sim && <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>Tryb testowy bez kamery (spacja lub przycisk = dzióbek)</div>}
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="card" style={{ textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ height: 210, overflow: 'hidden' }}>
          <div style={{ animation: 'stcBalloonFly 1.8s ease-in forwards' }}>
            <BalloonSvg fill={1} color={color} />
          </div>
        </div>
        <style>{`@keyframes stcBalloonFly { 0% { transform: translateY(0) } 100% { transform: translateY(-240px) rotate(6deg) } }`}</style>
        <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--green)' }}>Balon odleciał!</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 16px' }}>
          {targetCycles} dzióbków w {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}
        </p>
        <button className="btn btn-green btn-full" onClick={() => onComplete()}>Ukończ ćwiczenie</button>
        <button className="btn btn-outline btn-full mt-8" onClick={begin}>Jeszcze raz</button>
      </div>
    )
  }

  // status === 'playing'
  // Balon rośnie z każdym cyklem; w trakcie trzymania dzióbka widać, jak się dopompowuje
  const fill = (ui.cycles + (ui.phase === 'pucker' ? ui.hold * 0.8 : 0)) / targetCycles
  const prompt = ui.paused
    ? 'Nie widzę twarzy — usiądź przed kamerą'
    : ui.phase === 'pucker' ? 'Dzióbek i trzymaj' : 'Zamknij usta, odpocznij'
  const ringColor = ui.paused ? '#94A3B8' : ui.phase === 'pucker' ? 'var(--primary)' : 'var(--green)'
  const mouthOk = (ui.phase === 'pucker' && ui.mouth === 'pucker') || (ui.phase === 'rest' && ui.mouth === 'closed')

  return (
    <div className="card" style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 22 }}>
          {ui.cycles}<span style={{ color: 'var(--muted)', fontSize: 15 }}> / {targetCycles}</span>
        </span>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 700 }}>
          {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}
        </span>
      </div>
      <div className="progress-wrap dark" style={{ marginBottom: 6 }}>
        <div className="progress-fill colored" style={{ width: `${(ui.cycles / targetCycles) * 100}%` }} />
      </div>

      <BalloonSvg fill={fill} color={color} pulse={ui.phase === 'pucker' && ui.mouth === 'pucker' ? ui.hold : 0} dim={ui.paused} />

      <div style={{ fontWeight: 800, fontSize: 20, color: ui.paused ? 'var(--muted)' : 'var(--text)', minHeight: 28 }}>{prompt}</div>

      {/* Wskaźnik ust + pierścień utrzymania */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="42" fill="none" stroke="var(--soft)" strokeWidth="8" />
          <circle cx="48" cy="48" r="42" fill="none" stroke={ringColor} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - ui.hold)}
            transform="rotate(-90 48 48)" />
          {ui.mouth === 'pucker' && <circle cx="48" cy="48" r="11" fill="none" stroke={mouthOk ? ringColor : '#94A3B8'} strokeWidth="6" />}
          {ui.mouth === 'closed' && <path d="M30 48h36" stroke={mouthOk ? ringColor : '#94A3B8'} strokeWidth="6" strokeLinecap="round" />}
          {ui.mouth === 'other'  && <ellipse cx="48" cy="48" rx="18" ry="9" fill="none" stroke="#94A3B8" strokeWidth="6" />}
          {ui.mouth === 'none'   && <text x="48" y="57" textAnchor="middle" fontSize="28" fontWeight="800" fill="#94A3B8">?</text>}
        </svg>
      </div>
      <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
        {ui.phase === 'pucker' ? 'Kółko = widzę dzióbek' : 'Kreska = widzę zamknięte usta'}
      </div>

      {sim && (
        <button className="btn btn-outline btn-full mt-12"
          onPointerDown={() => { simPuckerRef.current = true }}
          onPointerUp={() => { simPuckerRef.current = false }}
          onPointerLeave={() => { simPuckerRef.current = false }}>
          Przytrzymaj = dzióbek (tryb testowy)
        </button>
      )}
      <button className="btn btn-ghost btn-full mt-8" onClick={onExit}>Przerwij grę</button>
    </div>
  )
}

// Balon: rośnie z postępem (fill 0–1), lekko "oddycha" podczas trzymania dzióbka
function BalloonSvg({ fill, color, pulse = 0, dim = false }) {
  const scale = 0.45 + 0.55 * Math.max(0, Math.min(1, fill)) + pulse * 0.04
  return (
    <svg width="100%" height="210" viewBox="0 0 200 210" style={{ maxWidth: 260, display: 'block', margin: '0 auto', opacity: dim ? .45 : 1, transition: 'opacity .2s' }} aria-hidden="true">
      <defs>
        <radialGradient id="blShade" cx=".34" cy=".28" r=".9"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".35" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".42" /></radialGradient>
        <filter id="blSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <ellipse cx="100" cy="200" rx={34 * scale} ry="6" fill="#000" opacity=".22" filter="url(#blSoft)" />
      <g transform={`translate(100 108) scale(${scale}) translate(-100 -108)`} style={{ transition: 'transform .35s cubic-bezier(.3,1.3,.5,1)' }}>
        <path d="M100 196 C 96 180, 106 172, 100 158" fill="none" stroke="#64748B" strokeWidth="2" />
        <ellipse cx="100" cy="88" rx="62" ry="72" fill={color} />
        <ellipse cx="100" cy="88" rx="62" ry="72" fill="url(#blShade)" />
        <path d="M92 158 L108 158 L100 148 Z" fill={color} />
        <path d="M92 158 L108 158 L100 148 Z" fill="#000" opacity=".25" />
        <ellipse cx="76" cy="56" rx="11" ry="20" fill="#fff" opacity=".5" transform="rotate(-22 76 56)" />
        <ellipse cx="124" cy="126" rx="18" ry="8" fill="#fff" opacity=".1" transform="rotate(-40 124 126)" />
      </g>
    </svg>
  )
}
