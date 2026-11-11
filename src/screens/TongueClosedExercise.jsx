// "Język za zamkniętymi ustami" — wypychanie policzków i okrążenia językiem między zębami a wargami.
//
// Co aplikacja umie tu sprawdzić: że usta są ZAMKNIĘTE (kamera, ten sam detektor co w kalibracji).
// Postęp liczy się tylko przy zamkniętych ustach. Samego języka kamera nie widzi — ruch prowadzi
// punkt na ekranie, a wykonanie potwierdza się uczciwie własnym odczuciem.
//
// Baza pod przyszłe wykrywanie wypchniętego policzka: przy włączonej kamerze ćwiczenie zapisuje
// średnie położenie kilku punktów policzków w fazach "lewy" / "prawy" / "spoczynek". Z tych danych
// (zebranych przy okazji zwykłych ćwiczeń) sprawdzimy, czy wypchnięcie da się rozpoznać z obrazu.

import { useEffect, useRef, useState } from 'react'
import { useFaceEngine } from './vision/useFaceEngine'
import { checkMouthClosed } from './vision/detectors'
import { getFaceProfile, personalMouthClosed } from '../data/faceProfile'
import { addResult } from '../data/resultsStore'
import { playGameSound } from '../components/useAlarm'

const FACE_LOST_MS = 1200
const CHEEK_POINTS = [205, 425, 214, 434, 50, 280]   // punkty siatki twarzy na policzkach (pary lewa/prawa)

// Lista faz: wypchnięcia naprzemiennie, potem okrążenia w obie strony
function buildPhases(p) {
  const holdMs = (p.holdSec ?? 3) * 1000, lapMs = (p.lapSec ?? 6) * 1000
  const phases = []
  for (let i = 0; i < (p.holdReps ?? 4); i++) {
    phases.push({ kind: 'left',  ms: holdMs, label: 'Wypchnij policzek po tej stronie' })
    phases.push({ kind: 'right', ms: holdMs, label: 'Teraz drugi policzek' })
  }
  for (let i = 0; i < (p.laps ?? 3); i++) phases.push({ kind: 'cw',  ms: lapMs, label: 'Prowadź język dookoła za punktem' })
  for (let i = 0; i < (p.laps ?? 3); i++) phases.push({ kind: 'ccw', ms: lapMs, label: 'I w drugą stronę' })
  return phases
}

// Położenie punktu-przewodnika na okręgu (kąt w radianach; 0 = prawa strona ekranu)
function targetAngle(kind, t) {
  if (kind === 'left')  return Math.PI
  if (kind === 'right') return 0
  if (kind === 'cw')    return -Math.PI / 2 + t * Math.PI * 2
  return -Math.PI / 2 - t * Math.PI * 2
}

function cheekFeatures(points) {
  const nose = points[1], eyeR = points[33], eyeL = points[263]
  if (!nose || !eyeR || !eyeL) return null
  const eye = Math.hypot(eyeL.x - eyeR.x, eyeL.y - eyeR.y)
  if (!eye) return null
  return CHEEK_POINTS.map(i => (points[i] ? [(points[i].x - nose.x) / eye, (points[i].z - nose.z) / eye] : [0, 0])).flat()
}

export default function TongueClosedExercise({ exercise, onComplete }) {
  const p = exercise.params || {}
  const wantCamera = p.useCamera ?? true
  const face = useFaceEngine()
  const personal = useRef(getFaceProfile()).current
  const sim = useRef((() => { try { return localStorage.getItem('stc_debug_sim') === '1' } catch (e) { return false } })()).current

  const [status, setStatus] = useState('intro')   // intro | loading | playing | done
  const [camera, setCamera] = useState(false)
  const [ui, setUi] = useState({ idx: 0, t: 0, mouth: 'ok', kind: 'left', label: '' })
  const phasesRef = useRef(buildPhases(p))
  const g = useRef({ idx: 0, ms: 0, lastT: 0, activeMs: 0, totalMs: 0, closedMs: 0, done: false, feat: {} })
  const rafRef = useRef(null)
  const cameraRef = useRef(false)

  const finish = () => {
    const s = g.current
    if (s.done) return
    s.done = true
    cancelAnimationFrame(rafRef.current)
    face.stop()
    const mean = (k) => (s.feat[k] ? s.feat[k].sum.map(v => +(v / s.feat[k].n).toFixed(4)) : null)
    const phases = phasesRef.current
    addResult('tongue_closed', {
      templateId: exercise.templateId || exercise.id,
      holds: phases.filter(x => x.kind === 'left' || x.kind === 'right').length,
      laps: phases.filter(x => x.kind === 'cw' || x.kind === 'ccw').length,
      activeSec: Math.round(s.activeMs / 1000),
      camera: cameraRef.current,
      closedPct: cameraRef.current && s.totalMs > 0 ? Math.round((s.closedMs / s.totalMs) * 100) : null,
      cheekFeatures: cameraRef.current ? { left: mean('left'), right: mean('right'), rest: mean('rest') } : null,
    })
    setStatus('done')
  }

  const tick = () => {
    const s = g.current
    if (s.done) return
    const now = performance.now()
    const dt = s.lastT ? Math.min(100, now - s.lastT) : 0
    s.lastT = now
    const phases = phasesRef.current
    const phase = phases[s.idx]

    let mouth = 'ok'
    if (cameraRef.current) {
      const points = face.getPoints()
      if (!points || face.msSinceFace() > FACE_LOST_MS) mouth = 'none'
      else {
        const cl = checkMouthClosed(points, face.getCanvasSize())
        const closed = personal ? personalMouthClosed(cl.aspect, personal) : cl.closedEnough
        mouth = closed ? 'ok' : 'open'
        s.totalMs += dt
        if (closed) {
          s.closedMs += dt
          // dane do przyszłego wykrywania policzka: tylko wypchnięcia (lewy/prawy), okrążenia jako "spoczynek" pomijamy
          const key = phase.kind === 'left' || phase.kind === 'right' ? phase.kind : null
          const f = key && cheekFeatures(points)
          if (f) { const acc = s.feat[key] || (s.feat[key] = { sum: f.map(() => 0), n: 0 }); f.forEach((v, i) => { acc.sum[i] += v }); acc.n++ }
        }
      }
    }

    if (mouth === 'ok') {
      s.ms += dt; s.activeMs += dt
      if (s.ms >= phase.ms) {
        s.idx++; s.ms = 0
        playGameSound('pump', Math.min(1, s.idx / phases.length))
        if (s.idx >= phases.length) { finish(); return }
      }
    }
    const cur = phases[Math.min(s.idx, phases.length - 1)]
    setUi({ idx: s.idx, t: Math.min(1, s.ms / cur.ms), mouth, kind: cur.kind, label: cur.label })
    rafRef.current = requestAnimationFrame(tick)
  }

  const begin = async () => {
    let cam = false
    if (wantCamera && !sim) {
      setStatus('loading')
      cam = await face.start()
    }
    cameraRef.current = cam
    setCamera(cam)
    phasesRef.current = buildPhases(p)
    g.current = { idx: 0, ms: 0, lastT: 0, activeMs: 0, totalMs: 0, closedMs: 0, done: false, feat: {} }
    setStatus('playing')
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); face.stop() }, [face])

  if (status === 'intro' || status === 'loading') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <Orbit angle={Math.PI} t={0} kind="left" />
        <div style={{ fontWeight: 800, fontSize: 20 }}>Język prowadzi punkt</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '8px 0 14px', lineHeight: 1.55 }}>
          Usta zamknięte przez cały czas. Wypychaj językiem policzek po tej stronie, gdzie świeci punkt,
          potem prowadź język dookoła. {wantCamera ? 'Kamera sprawdza tylko, czy usta są zamknięte.' : ''}
        </p>
        <button className="btn btn-primary btn-full" disabled={status === 'loading'} onClick={begin}>
          {status === 'loading' ? 'Uruchamiam kamerę…' : 'Zaczynamy'}
        </button>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--green)' }}>Cała trasa zrobiona</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 14px' }}>
          {camera ? 'Postęp liczył się tylko przy zamkniętych ustach.' : 'Bez kamery: liczę czas, zamknięcia ust pilnujesz sam.'}
        </p>
        <button className="btn btn-green btn-full" onClick={() => onComplete()}>Ukończ ćwiczenie</button>
      </div>
    )
  }

  const phases = phasesRef.current
  const paused = ui.mouth !== 'ok'
  return (
    <div className="card" style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 20 }}>
          {Math.min(ui.idx + 1, phases.length)}<span className="text-muted" style={{ fontSize: 14 }}> / {phases.length}</span>
        </span>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 700 }}>{camera ? 'kamera: usta' : 'bez kamery'}</span>
      </div>
      <div className="progress-wrap dark">
        <div className="progress-fill colored" style={{ width: `${((ui.idx + ui.t) / phases.length) * 100}%` }} />
      </div>

      <Orbit angle={targetAngle(ui.kind, ui.t)} t={ui.t} kind={ui.kind} paused={paused} />

      <div style={{ fontWeight: 800, fontSize: 19, minHeight: 26, color: paused ? 'var(--orange)' : 'var(--text)' }}>
        {ui.mouth === 'open' ? 'Zamknij usta — czekam' : ui.mouth === 'none' ? 'Nie widzę twarzy — usiądź przed kamerą' : ui.label}
      </div>
      <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>Oddychaj nosem. Język naciska od środka, zęby lekko rozsunięte.</div>
      <button className="btn btn-ghost btn-full mt-12" onClick={finish}>Zakończ wcześniej</button>
    </div>
  )
}

// Okrąg = tor języka wokół ust (widok jak w lustrze). Punkt pokazuje, gdzie ma być czubek języka.
function Orbit({ angle, t, kind, paused = false }) {
  const R = 78, cx = 120, cy = 105
  const x = cx + Math.cos(angle) * R, y = cy + Math.sin(angle) * R * 0.78
  const isHold = kind === 'left' || kind === 'right'
  return (
    <svg width="100%" height="210" viewBox="0 0 240 210" style={{ maxWidth: 300, display: 'block', margin: '6px auto 0', opacity: paused ? .5 : 1 }} aria-hidden="true">
      <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.78} fill="none" stroke="var(--border)" strokeWidth="14" />
      <path d={`M ${cx - 34} ${cy} Q ${cx} ${cy + 8} ${cx + 34} ${cy}`} fill="none" stroke="var(--muted)" strokeWidth="6" strokeLinecap="round" />
      {isHold && <circle cx={x} cy={y} r={20 + t * 10} fill="none" stroke="var(--primary)" strokeWidth="3" opacity={0.25 + t * 0.6} />}
      <circle cx={x} cy={y} r="15" fill="var(--primary)" />
      <circle cx={x - 4} cy={y - 5} r="4" fill="#fff" opacity=".6" />
    </svg>
  )
}
