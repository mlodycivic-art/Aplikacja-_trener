// Gra "Bańki" — w bańce pojawia się słowo albo krótkie zdanie. Gracz czyta je na głos.
// Gdy głoski zabrzmią w przyjętej tolerancji, bańka pęka i są punkty.
//
// Skąd gra wie, co zabrzmiało: z tekstu wylicza, jakie głoski szumiące i syczące powinny paść
// (data/sibilants.js), a z mikrofonu — jakie padły (pomiar szumu + próg z kalibracji).
//
// Dwa tryby, wybierane automatycznie:
//   OCENA   — jest pewny próg (Mikrofon → Kalibracja lub Baza wzorców): bańka pęka tylko za dobrą głoskę.
//   TRENING — progu nie ma: bańka pęka, gdy gracz w ogóle przeczytał słowo z głoską. Mniej punktów,
//             bo aplikacja nie wie, czy było poprawnie. Ekran mówi o tym wprost.
//
// Tryb testowy bez mikrofonu (localStorage stc_debug_sim = '1'): klawisz G = dobrze, B = źle.

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter, analyseFrames } from './useSibilantMeter'
import { parseSibilants, judgeUtterance, TOLERANCE } from '../../data/sibilants'
import { getThreshold } from '../../data/patternStore'
import { GAME_WORDS, getRhythmLines } from '../../data/defaultData'
import { addResult } from '../../data/resultsStore'
import { playGameSound } from '../../components/useAlarm'

export const BUBBLE_POINTS_JUDGED   = 10   // za bańkę w trybie oceny
export const BUBBLE_POINTS_TRAINING = 3    // za bańkę w trybie treningowym
const MAX_TRIES     = 3      // po tylu nieudanych próbach bańka odpływa
const END_SILENCE_MS = 650   // tyle ciszy kończy wypowiedź
const MIN_UTTER_MS   = 250
const MAX_UTTER_MS   = 7000
const COLORS = ['#2563EB', '#DB2777', '#16A34A', '#EA580C', '#7C3AED', '#0891B2']

function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }

function loadItems(setId, level) {
  let items = level === 'words' ? (GAME_WORDS[setId] || []) : getRhythmLines(setId, level)
  if (!items.length) items = GAME_WORDS[setId] || GAME_WORDS.sz
  // tylko teksty, w których jest co oceniać (bezdźwięczna głoska szumiąca lub sycząca)
  const usable = items.filter(t => { const e = parseSibilants(t); return e.L + e.H > 0 })
  return shuffle(usable.length ? usable : items)
}

export default function BubbleGame({ exercise, onComplete }) {
  const p = exercise.params || {}
  const durationSec = Math.max(30, p.gameDurationSec ?? 120)
  const setId       = p.bubbleSet || 'sz'
  const level       = p.bubbleLevel || 'words'
  const toleranceId = p.bubbleTolerance || 'normal'

  const meter = useSibilantMeter()
  const sim = useRef((() => { try { return localStorage.getItem('stc_debug_sim') === '1' } catch (e) { return false } })()).current
  const thresholdRef = useRef(null)

  const [status, setStatus] = useState('intro')     // intro | starting | playing | done | error
  const [mode, setMode]     = useState('training')  // judged | training
  const [item, setItem]     = useState('')
  const [color, setColor]   = useState(COLORS[0])
  const [fx, setFx]         = useState('in')        // in | listen | pop | wobble | away
  const [hint, setHint]     = useState('')
  const [score, setScore]   = useState({ popped: 0, shown: 0, points: 0 })
  const [left, setLeft]     = useState(durationSec)

  const g = useRef({ queue: [], idx: 0, tries: 0, endAt: 0, startAt: 0, busy: false, utter: null, lastT: 0, done: false,
                     popped: 0, shown: 0, points: 0 })
  const rafRef = useRef(null)
  const timersRef = useRef([])
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timersRef.current.push(id) }

  const finish = () => {
    const s = g.current
    if (s.done) return
    s.done = true
    cancelAnimationFrame(rafRef.current)
    meter.stop()
    addResult('bubble_game', {
      templateId: exercise.templateId || exercise.id, popped: s.popped, shown: s.shown, points: s.points,
      durationSec: Math.round((performance.now() - s.startAt) / 1000), mode: thresholdRef.current ? 'judged' : 'training',
      setId, level, tolerance: toleranceId,
    })
    setStatus('done')
  }

  const nextBubble = () => {
    const s = g.current
    if (s.done) return
    if (s.idx >= s.queue.length) { s.queue = shuffle(s.queue); s.idx = 0 }
    const text = s.queue[s.idx++]
    s.tries = 0; s.utter = null; s.busy = false; s.shown++
    setItem(text); setColor(COLORS[s.shown % COLORS.length]); setHint(''); setFx('in')
    setScore({ popped: s.popped, shown: s.shown, points: s.points })
    later(() => { if (!g.current.done) setFx('listen') }, 350)
  }

  const pop = (pts) => {
    const s = g.current
    s.busy = true; s.popped++; s.points += pts
    playGameSound('pump', 0.9)
    setFx('pop'); setHint(`+${pts}`)
    setScore({ popped: s.popped, shown: s.shown, points: s.points })
    later(nextBubble, 650)
  }

  const miss = (message) => {
    const s = g.current
    s.tries++
    if (s.tries >= MAX_TRIES) {
      s.busy = true
      setFx('away'); setHint('Ta odpływa. Następna!')
      later(nextBubble, 900)
    } else {
      s.busy = true
      setFx('wobble'); setHint(message)
      later(() => { if (!g.current.done) { g.current.busy = false; g.current.utter = null; setFx('listen') } }, 700)
    }
  }

  // Ocena jednej wypowiedzi (ramki od początku do końca mówienia)
  const judge = (frames, text) => {
    const segments = analyseFrames(frames)
    const expected = parseSibilants(text)
    if (thresholdRef.current) {
      const v = judgeUtterance(segments, expected, thresholdRef.current, toleranceId).verdict
      if (v === 'pass') pop(BUBBLE_POINTS_JUDGED)
      else if (v === 'fail') miss('Jeszcze raz, wolniej. Pilnuj języka.')
      else if (v === 'silent') miss('Nie słyszę głoski. Bliżej mikrofonu.')
      else miss('Nie jestem pewien. Powiedz jeszcze raz, wyraźnie.')
    } else {
      if (segments.length > 0) pop(BUBBLE_POINTS_TRAINING)
      else miss('Nie słyszę głoski. Bliżej mikrofonu.')
    }
  }

  const tick = () => {
    const s = g.current
    if (s.done) return
    const now = performance.now()
    setLeft(Math.max(0, Math.ceil((s.endAt - now) / 1000)))
    if (now >= s.endAt && !s.busy && !s.utter) { finish(); return }

    if (!sim && !s.busy) {
      for (const f of meter.getFrames()) {
        if (f.t <= s.lastT) continue
        s.lastT = f.t
        if (!s.utter) { if (f.loud) s.utter = { startT: f.t, lastLoudT: f.t, frames: [f] } ; continue }
        s.utter.frames.push(f)
        if (f.loud) s.utter.lastLoudT = f.t
      }
      const u = s.utter
      if (u) {
        const ended = now - u.lastLoudT > END_SILENCE_MS
        const tooLong = now - u.startT > MAX_UTTER_MS
        if (ended || tooLong) {
          s.utter = null
          if (u.lastLoudT - u.startT >= MIN_UTTER_MS) {
            const rel = u.frames.map(f => ({ ...f, t: f.t - u.startT }))
            judge(rel, s.queue[s.idx - 1])
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const begin = async () => {
    const th = getThreshold()
    thresholdRef.current = th && th.quality === 'good' ? th : null
    setMode(thresholdRef.current || sim ? 'judged' : 'training')
    if (!sim) {
      setStatus('starting')
      const ok = await meter.start()
      if (!ok) { setStatus('error'); return }
      await new Promise(r => setTimeout(r, 900))   // pomiar tła
    }
    const now = performance.now()
    g.current = { queue: loadItems(setId, level), idx: 0, tries: 0, endAt: now + durationSec * 1000, startAt: now,
                  busy: false, utter: null, lastT: now, done: false, popped: 0, shown: 0, points: 0 }
    setScore({ popped: 0, shown: 0, points: 0 })
    setStatus('playing')
    nextBubble()
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    timersRef.current.forEach(clearTimeout)
    meter.stop()
  }, [meter])

  // tryb testowy: G = dobrze, B = źle
  useEffect(() => {
    if (!sim) return
    const key = (e) => {
      if (status !== 'playing' || g.current.busy) return
      if (e.key === 'g') pop(BUBBLE_POINTS_JUDGED)
      if (e.key === 'b') miss('Jeszcze raz, wolniej. Pilnuj języka.')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, status])

  const skip = () => { if (!g.current.busy) { g.current.busy = true; setFx('away'); setHint(''); later(nextBubble, 500) } }

  // ── Widoki ──────────────────────────────────────────────────────────────────
  if (status === 'intro' || status === 'starting' || status === 'error') {
    const th = getThreshold()
    const judged = (th && th.quality === 'good') || sim
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <Bubble text="szum" color={COLORS[0]} fx="listen" small />
        <div style={{ fontWeight: 800, fontSize: 20 }}>Przebij jak najwięcej baniek</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '8px 0 12px', lineHeight: 1.55 }}>
          Przeczytaj na głos to, co jest w bańce. Powoli i wyraźnie.
          Czas gry: {Math.floor(durationSec / 60)}:{String(durationSec % 60).padStart(2, '0')}.
        </p>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: judged ? 'var(--green)' : 'var(--orange)' }}>
          {judged
            ? `Tryb oceny: bańka pęka za dobrą głoskę (+${BUBBLE_POINTS_JUDGED} pkt). Tolerancja: ${TOLERANCE[toleranceId]?.label || 'Zwykła'}.`
            : `Tryb treningowy: mikrofon nie jest skalibrowany, więc gra nie ocenia głoski (+${BUBBLE_POINTS_TRAINING} pkt za przeczytanie). Kalibracja: strefa dorosłego → Mikrofon.`}
        </div>
        {status === 'error' && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 10 }}>Brak dostępu do mikrofonu.</div>}
        <button className="btn btn-primary btn-full" disabled={status === 'starting'} onClick={begin}>
          {status === 'starting' ? 'Cisza — słucham pokoju…' : 'Zaczynamy'}
        </button>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 44, color: 'var(--primary)' }}>{score.popped}</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>przebite bańki (z {score.shown})</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 14px' }}>
          {score.points} pkt{mode === 'training' ? ' · tryb treningowy, bez oceny głoski' : ''}
        </p>
        <button className="btn btn-green btn-full" onClick={() => onComplete()}>Ukończ ćwiczenie</button>
        <button className="btn btn-outline btn-full mt-8" onClick={begin}>Jeszcze raz</button>
      </div>
    )
  }

  return (
    <div className="card" style={{ textAlign: 'center', userSelect: 'none', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 22 }}>
          {score.points}<span className="text-muted" style={{ fontSize: 14 }}> pkt · bańki: {score.popped}</span>
        </span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 18 }}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
      </div>
      <div className="progress-wrap dark" style={{ marginBottom: 4 }}>
        <div className="progress-fill colored" style={{ width: `${(left / durationSec) * 100}%`, transition: 'width .3s linear' }} />
      </div>

      <Bubble text={item} color={color} fx={fx} />

      <div style={{ minHeight: 26, fontWeight: 800, fontSize: 17, color: fx === 'pop' ? 'var(--green)' : fx === 'wobble' || fx === 'away' ? 'var(--orange)' : 'var(--muted)' }}>
        {hint || (fx === 'listen' ? 'Słucham… przeczytaj na głos' : '')}
      </div>

      {sim && <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>Tryb testowy: klawisz G = dobrze, B = źle</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={skip}>Pomiń</button>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={finish}>Zakończ grę</button>
      </div>
    </div>
  )
}

// Bańka z tekstem. fx steruje animacją: wejście, nasłuch (unosi się), pęknięcie, kołysanie, odpłynięcie.
function Bubble({ text, color, fx, small = false }) {
  const size = small ? 120 : 250
  const long = (text || '').length
  const fontSize = small ? 22 : long > 34 ? 17 : long > 22 ? 20 : long > 12 ? 25 : 34
  const anim = {
    in:     'stcBubIn .35s ease-out',
    listen: 'stcBubFloat 2.6s ease-in-out infinite',
    pop:    'stcBubPop .5s ease-out forwards',
    wobble: 'stcBubWobble .6s ease-in-out',
    away:   'stcBubAway .8s ease-in forwards',
  }[fx]
  return (
    <div style={{ height: size + 30, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <style>{`
        @keyframes stcBubIn { from { transform: scale(.3) translateY(60px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes stcBubFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        @keyframes stcBubPop { 0% { transform: scale(1); opacity: 1 } 40% { transform: scale(1.25); opacity: .9 } 100% { transform: scale(1.7); opacity: 0 } }
        @keyframes stcBubWobble { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-12px) rotate(-3deg) } 60% { transform: translateX(12px) rotate(3deg) } }
        @keyframes stcBubAway { to { transform: translateY(-260px) scale(.7); opacity: 0 } }
        @keyframes stcSpark { from { transform: translate(0,0) scale(1); opacity: 1 } to { transform: var(--to) scale(.2); opacity: 0 } }
      `}</style>
      {fx === 'pop' && [...Array(10)].map((_, i) => {
        const a = (i / 10) * Math.PI * 2
        return <span key={i} style={{
          position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: color,
          '--to': `translate(${Math.cos(a) * 140}px, ${Math.sin(a) * 140}px)`, animation: 'stcSpark .55s ease-out forwards',
        }} />
      })}
      <div style={{
        width: size, height: size, borderRadius: '50%', animation: anim,
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.55) 0 9%, transparent 22%), radial-gradient(circle at 50% 55%, ${color}22 0 55%, ${color}66 78%, ${color} 100%)`,
        border: `3px solid ${color}`, boxShadow: `0 10px 30px ${color}44, inset 0 -12px 26px ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: small ? 10 : 26,
      }}>
        <span style={{ fontWeight: 800, fontSize, lineHeight: 1.2, color: 'var(--text)', textAlign: 'center', wordBreak: 'break-word' }}>{text}</span>
      </div>
    </div>
  )
}
