import { useState, useEffect, useRef } from 'react'
import { calcDayStats } from '../data/defaultData'
import { playSound, useTitleFlash, playApplause } from '../components/useAlarm'
import { useMicRhythm } from './games/useMicRhythm'
import BowlingReward, { pinsForPct } from './games/BowlingReward'

const TAU = 2 * Math.PI

// ── Szacowanie czasu odczytu wyrazu (ms) na podstawie długości i tempa ───────
function estimateWordMs(word, rate = 1) {
  const len = (word || '').replace(/[.,!?]/g, '').length || 1
  const base = len * 110 + 150
  return base / Math.max(0.01, rate)
}

// ── Shared Arc component ──────────────────────────────────────────────────────
function Arc({ cx, cy, r, pct, color, strokeWidth = 10, transition = '.9s' }) {
  const circ   = TAU * r
  const offset = circ * (1 - Math.max(0, Math.min(1, pct / 100)))
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E9EEF8" strokeWidth={strokeWidth} />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: `stroke-dashoffset ${transition} linear` }} />
    </>
  )
}

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Tongue Up Position ────────────────────────────────────────────────────────
function TongueTimer({ exercise, onHalfPoints, onComplete }) {
  const totalSec    = exercise.duration * 60
  const activeSec   = exercise.params?.activeSec ?? 5
  const breakSec    = exercise.params?.breakSec  ?? 5
  const cycleLenSec = activeSec + breakSec

  const [mainSec,   setMainSec]   = useState(totalSec)
  const [cycleLeft, setCycleLeft] = useState(activeSec)
  const [phase,     setPhase]     = useState('active')
  const [blink,     setBlink]     = useState(true)
  const [running,   setRunning]   = useState(false)
  const [halfGiven, setHalfGiven] = useState(false)

  const ivRef    = useRef(null)
  const blinkRef = useRef(null)
  // Liczenie odporne na zwalnianie kart w tle przez przeglądarkę — bazuje na
  // rzeczywistym zegarze (różnica czasu), nie na liczbie odpaleń interwału.
  const accumulatedMsRef = useRef(0)
  const runStartRef      = useRef(0)

  useEffect(() => () => { clearInterval(ivRef.current); clearInterval(blinkRef.current) }, [])

  useEffect(() => {
    clearInterval(blinkRef.current)
    if (running && phase === 'active') {
      blinkRef.current = setInterval(() => setBlink(b => !b), 500)
    } else {
      setBlink(true)
    }
    return () => clearInterval(blinkRef.current)
  }, [running, phase])

  const tick = () => {
    const elapsedMs   = accumulatedMsRef.current + (performance.now() - runStartRef.current)
    const remainingMs = totalSec * 1000 - elapsedMs

    if (remainingMs <= 0) {
      setMainSec(0)
      clearInterval(ivRef.current)
      setRunning(false)
      onComplete()
      return
    }
    setMainSec(Math.ceil(remainingMs / 1000))

    // Faza cyklu (aktywność/przerwa) — wyliczana z minionego czasu, więc nawet
    // po dłuższej przerwie w odpalaniu (throttling) natychmiast "dogania" prawdę.
    const cycleLenMs = cycleLenSec * 1000
    const posMs = elapsedMs % cycleLenMs
    if (posMs < activeSec * 1000) {
      setPhase('active')
      setCycleLeft(Math.ceil((activeSec * 1000 - posMs) / 1000))
    } else {
      setPhase('break')
      setCycleLeft(Math.ceil((cycleLenMs - posMs) / 1000))
    }
  }

  useEffect(() => {
    if (!running) { clearInterval(ivRef.current); return }
    runStartRef.current = performance.now()
    tick()
    ivRef.current = setInterval(tick, 1000)
    return () => clearInterval(ivRef.current)
  }, [running])

  useEffect(() => {
    if (!halfGiven && mainSec > 0 && mainSec <= Math.floor(totalSec / 2)) {
      setHalfGiven(true)
      onHalfPoints()
    }
  }, [mainSec])

  const toggleRunning = () => {
    if (running) {
      accumulatedMsRef.current += performance.now() - runStartRef.current
      setRunning(false)
    } else {
      setRunning(true)
    }
  }

  const mainPct = ((totalSec - mainSec) / totalSec) * 100
  const mm = String(Math.floor(mainSec / 60)).padStart(2, '0')
  const ss = String(mainSec % 60).padStart(2, '0')

  const CX = 110, CY = 110, R = 90
  const SVG_W = 220, SVG_H = 220

  return (
    <div className="card">
      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ display: 'block', margin: '0 auto' }}>

        <Arc cx={CX} cy={CY} r={R} pct={mainPct} color="#6C63FF" strokeWidth={12} transition="1s" />
        <circle cx={CX} cy={CY} r={R - 14} fill="#F8FAFC" />

        <text x={CX} y={CY - 34} textAnchor="middle"
          fontFamily="'Space Mono',monospace" fontSize="20" fontWeight="700" fill="#1E293B">
          {mm}:{ss}
        </text>

        {phase === 'active' && (
          <g opacity={blink ? 1 : 0.15} style={{ transition: 'opacity .15s' }}>
            <line x1={CX} y1={CY + 16} x2={CX} y2={CY - 2}
              stroke="#22C55E" strokeWidth={9} strokeLinecap="round" />
            <polygon points={`${CX},${CY - 16} ${CX - 12},${CY - 1} ${CX + 12},${CY - 1}`} fill="#22C55E" />
          </g>
        )}

        {phase === 'break' && (
          <line x1={CX - 34} y1={CY + 6} x2={CX + 34} y2={CY + 6}
            stroke="#8B5CF6" strokeWidth={9} strokeLinecap="round" />
        )}

        <text x={CX} y={CY + 44} textAnchor="middle"
          fontFamily="Nunito" fontSize="13" fontWeight="900"
          fill={phase === 'active' ? '#16A34A' : '#7C3AED'}>
          {phase === 'active' ? `AKTYWNOŚĆ  ${cycleLeft}s` : `PRZERWA  ${cycleLeft}s`}
        </text>
      </svg>

      <Legend items={[
        { color: '#6C63FF', label: 'Czas treningu' },
        { color: '#22C55E', label: 'Aktywność' },
        { color: '#8B5CF6', label: 'Przerwa' },
      ]} />

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        {halfGiven ? '✓ +5 pkt za 50%' : 'Bonus +5 pkt za 50% czasu'}
      </div>

      <button className="btn btn-primary btn-full" onClick={toggleRunning}>
        {running ? '⏸ Pauza' : mainSec === totalSec ? '▶ Start' : '▶ Wznów'}
      </button>
    </div>
  )
}

// ── SZ Lip Shape — w pełni oparte na czasie (nie na zdarzeniu zakończenia mowy) ──
function SzLipTimer({ exercise, onComplete }) {
  const rawWords = exercise.params?.words      || 'sza,sze,szo,szu'
  const rate     = exercise.params?.speechRate ?? 0.3
  const gapSec   = exercise.params?.gapSec     ?? 0.4
  const reps     = exercise.params?.reps       ?? 5
  const pitch    = exercise.params?.pitch      ?? 1.2

  const words = rawWords.split(',').map(w => w.trim()).filter(Boolean)

  const [repIdx,      setRepIdx]      = useState(0)
  const [wordIdx,     setWordIdx]     = useState(0)
  const [phase,       setPhase]       = useState('idle')
  const [wordVisible, setWordVisible] = useState(false) // słowo widoczne 0.2s po starcie do 0.5s przed następnym
  const [running,     setRunning]     = useState(false)
  const [speakOn,     setSpeakOn]     = useState(true)

  const timeoutRef        = useRef(null)
  const showWordTimerRef  = useRef(null) // timer pokazania słowa 0.2s po starcie
  const phaseStartedAtRef = useRef(0)
  const phaseDurationRef  = useRef(0)
  const phaseRemainingRef = useRef(0)
  const idxStateRef       = useRef({ repIdx: 0, wordIdx: 0 })
  const phaseRef          = useRef('idle')
  const speakingGuardRef  = useRef(null)

  useEffect(() => () => {
    clearTimeout(timeoutRef.current)
    clearTimeout(showWordTimerRef.current)
    if (speakingGuardRef.current) speakingGuardRef.current.done = true
    try { window.speechSynthesis?.cancel() } catch (e) {}
  }, [])

  // Auto-zakończenie gdy wszystkie słowa/powtórzenia wykonane.
  // Krótkie opóźnienie żeby animacja okręgu zdążyła dojechać do 100% zanim ekran się zmieni.
  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(() => onComplete(), 700)
    return () => clearTimeout(t)
  }, [phase])

  const getPolishVoice = () => {
    try {
      const voices = window.speechSynthesis?.getVoices() || []
      return voices.find(v => v.lang.startsWith('pl')) || null
    } catch (e) { return null }
  }

  const enterSpeaking = (rIdx, wIdx) => {
    if (speakingGuardRef.current) speakingGuardRef.current.done = true
    clearTimeout(showWordTimerRef.current)

    idxStateRef.current = { repIdx: rIdx, wordIdx: wIdx }
    setRepIdx(rIdx)
    setWordIdx(wIdx)
    phaseRef.current = 'speaking'
    setPhase('speaking')
    setWordVisible(false)
    phaseStartedAtRef.current = performance.now()

    const estD = estimateWordMs(words[wIdx], rate)
    phaseDurationRef.current = estD

    const guard = { done: false }
    speakingGuardRef.current = guard

    // Słowo pojawia się 0.2s po starcie wymowy
    showWordTimerRef.current = setTimeout(() => setWordVisible(true), 200)

    // Po zakończeniu mówienia: słowo znika 0.5s przed kolejnym, potem advance
    const reveal = () => {
      if (guard.done) return
      guard.done = true
      clearTimeout(timeoutRef.current)
      const hideDelay = Math.max(50, (gapSec - 0.5) * 1000)
      timeoutRef.current = setTimeout(() => {
        setWordVisible(false)
        setTimeout(() => advance(), 500)
      }, hideDelay)
    }

    if (speakOn && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(words[wIdx])
        u.lang  = 'pl-PL'
        u.rate  = Math.max(0.1, Math.min(2, rate))
        u.pitch = Math.max(0.1, Math.min(2, pitch))
        const plVoice = getPolishVoice()
        if (plVoice) u.voice = plVoice
        u.onend   = () => reveal()
        u.onerror = () => reveal()
        window.speechSynthesis.speak(u)
      } catch (e) {}
    }

    const fallbackMs = estD * 1.5 + 300
    timeoutRef.current = setTimeout(() => reveal(), fallbackMs)
  }

  const advance = () => {
    const { repIdx: rIdx, wordIdx: wIdx } = idxStateRef.current
    const nextWordIdx = wIdx + 1
    if (nextWordIdx >= words.length) {
      const nextRep = rIdx + 1
      if (nextRep >= reps) {
        phaseRef.current = 'done'
        setPhase('done') // useEffect wywołuje onComplete()
        setRunning(false)
        return
      }
      enterSpeaking(nextRep, 0)
    } else {
      enterSpeaking(rIdx, nextWordIdx)
    }
  }

  const handleStartPause = () => {
    if (running) {
      setRunning(false)
      clearTimeout(timeoutRef.current)
      clearTimeout(showWordTimerRef.current)
      if (speakingGuardRef.current) speakingGuardRef.current.done = true
      try { window.speechSynthesis?.cancel() } catch (e) {}
      const elapsedInPhase = performance.now() - phaseStartedAtRef.current
      phaseRemainingRef.current = Math.max(0, (phaseDurationRef.current || 0) - elapsedInPhase)
      return
    }

    setRunning(true)
    if (phase === 'idle') {
      enterSpeaking(0, 0)
    } else if (phase !== 'done') {
      // Wznawiamy — po prostu powtarzamy bieżące słowo od nowa
      const { repIdx: rIdx, wordIdx: wIdx } = idxStateRef.current
      enterSpeaking(rIdx, wIdx)
    }
  }

  const totalSteps = words.length * reps
  const unitsDone = repIdx * words.length + wordIdx
  const totalPct = phase === 'done'
    ? 100
    : (totalSteps > 0 ? Math.min(100, (unitsDone / totalSteps) * 100) : 0)
  const currentWord = (words[wordIdx] || '').toUpperCase().slice(0, 10)
  const isListening = phase === 'speaking' && !wordVisible
  const showProgressInfo = phase === 'speaking' || phase === 'pause' || wordVisible

  const CX = 110, CY = 110, R = 90
  const SVG_W = 220, SVG_H = 220
  const innerR = R - 14

  return (
    <div className="card">
      <style>{`
        @keyframes szWordPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        @keyframes szListenFade {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.9; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
          onClick={() => setSpeakOn(s => !s)}>
          {speakOn ? '🔊 Czytanie: WŁ' : '🔇 Czytanie: WYŁ'}
        </button>
      </div>

      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ display: 'block', margin: '0 auto' }}>

        <Arc cx={CX} cy={CY} r={R} pct={totalPct} color="#22C55E" strokeWidth={12} transition="1s" />
        <circle cx={CX} cy={CY} r={innerR} fill="#F8FAFC" />

        {phase === 'done' ? (
          <text x={CX} y={CY + 8} textAnchor="middle"
            fontFamily="Nunito" fontSize="20" fontWeight="900" fill="#16A34A">
            GOTOWE! ✓
          </text>
        ) : phase === 'idle' ? (
          <text x={CX} y={CY + 8} textAnchor="middle"
            fontFamily="Nunito" fontSize="16" fontWeight="800" fill="#94A3B8">
            Gotowy?
          </text>
        ) : isListening ? (
          <text x={CX} y={CY} textAnchor="middle"
            fontFamily="Nunito" fontSize="30"
            style={{ animation: 'szListenFade 1s ease-in-out infinite' }}>
            🔊
          </text>
        ) : wordVisible ? (
          <text x={CX} y={CY} textAnchor="middle"
            fontFamily="Nunito" fontSize={currentWord.length > 6 ? 20 : 26}
            fontWeight="900" fill="#7C3AED"
            style={{ animation: 'szWordPulse 0.7s ease-in-out infinite' }}>
            {currentWord}
          </text>
        ) : (
          <text x={CX} y={CY} textAnchor="middle"
            fontFamily="Nunito" fontSize="24" fill="#CBD5E1">
            ···
          </text>
        )}

        {showProgressInfo && (
          <text x={CX} y={CY + 28} textAnchor="middle"
            fontFamily="Nunito" fontSize="11" fill="#94A3B8" fontWeight="700">
            {wordIdx + 1}/{words.length} · seria {repIdx + 1}/{reps}
          </text>
        )}
      </svg>

      <Legend items={[{ color: '#22C55E', label: 'Czas treningu' }]} />

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        {phase === 'done'
          ? '✓ Wszystkie serie ukończone!'
          : phase === 'idle'
          ? 'Kliknij Start, aby zacząć'
          : isListening
          ? '🔊 Słuchaj lektora...'
          : `🗣 Powtórz: "${currentWord}"`}
      </div>

      {phase === 'done' ? (
        <button className="btn btn-green btn-full" onClick={onComplete}>✓ Ukończ ćwiczenie</button>
      ) : (
        <button className="btn btn-primary btn-full" onClick={handleStartPause}>
          {running ? '⏸ Pauza' : phase === 'idle' ? '▶ Start' : '▶ Wznów'}
        </button>
      )}
    </div>
  )
}

// ── Speech Rhythm — zdanie po zdaniu: 1) lektor + wizualizacja razem, 2) sama wizualizacja (powtórka) ──
// ── Speech Rhythm — zdanie po zdaniu: 1) lektor + RZECZYWISTA synchronizacja wizualizacji, 2) sama wizualizacja (powtórka) ──
// Synchronizacja w przebiegu 1 korzysta z prawdziwego zdarzenia 'boundary' syntezatora mowy
// (działa w Chrome/Edge) — podświetlenie dosłownie śledzi głos. Jeśli przeglądarka nie wspiera
// tego zdarzenia (np. czasem Safari), aplikacja automatycznie przełącza się na szacowanie czasu.
function RhythmTimer({ exercise, onComplete }) {
  // Jedno wspólne tempo — lektor czyta w tym tempie, a wizualizacja (w obu przebiegach)
  // nadąża za tym samym tempem, więc dziecko powtarza w identycznym rytmie co lektor.
  const narratorRate = exercise.params?.narratorRate ?? 0.3
  const pauseSec      = exercise.params?.pauseSec     ?? 0.4
  const commaPause    = exercise.params?.commaPause   ?? 0.2
  const periodPause   = exercise.params?.periodPause  ?? 0.4
  const phoneme       = exercise.params?.activePhoneme || ''

  const sentenceList = (exercise.params?.sentenceList && exercise.params.sentenceList.length > 0)
    ? exercise.params.sentenceList
    : (exercise.params?.sentences ? [exercise.params.sentences] : ['TAK tak tak TAK tak tak mów powoli i równo'])

  const [sentenceIdx, setSentenceIdx] = useState(0)
  const [idx,    setIdx]    = useState(-1)     // indeks słowa w obrębie aktualnego zdania
  const [pass,   setPass]   = useState('with_narrator') // 'with_narrator' | 'silent'
  const [phase,  setPhase]  = useState('idle')           // idle | reading | pause | done
  const [running, setRunning] = useState(false)
  const [stepsDone, setStepsDone] = useState(0)

  // ── Mikrofon: pokrycie czasowe mowy podczas przebiegu "cichego" (rytm/tempo, nie treść) ──
  const mic = useMicRhythm()
  const micStartedRef = useRef(false)
  const [showThrow, setShowThrow] = useState(false)
  const [throwPct, setThrowPct]   = useState(0)
  const throwHistoryRef      = useRef([])   // % dla każdego rzutu (zdania) w tej sesji
  const pendingNextSentenceRef = useRef(0)
  const isLastThrowRef       = useRef(false)

  const ensureMicStarted = () => {
    if (!micStartedRef.current) {
      micStartedRef.current = true
      mic.start()
    }
  }

  useEffect(() => {
    mic.setWindowActive(running && pass === 'silent')
  }, [running, pass])

  useEffect(() => () => { mic.stop() }, [])

  const timeoutRef        = useRef(null)
  const phaseStartedAtRef = useRef(0)
  const phaseDurationRef  = useRef(0)
  const phaseRemainingRef = useRef(0)
  const pauseStartRef     = useRef(0)
  const sentenceIdxRef    = useRef(0)
  const idxRef            = useRef(-1)
  const phaseRef          = useRef('idle')
  const passRef           = useRef('with_narrator')
  const tokenRef          = useRef(0)
  const bump = () => { tokenRef.current += 1; return tokenRef.current }

  const containerRef = useRef(null)
  const wordRefs      = useRef([])
  const [dotPos, setDotPos] = useState(null)
  const dotAnimRef = useRef(null)
  const dotPosRef  = useRef(null)

  // Czy w tej sesji zdarzenie 'boundary' faktycznie zadziałało — jeśli tak, używamy go nadal
  const boundarySupportedRef = useRef(null) // null = nieznane, true/false = sprawdzone

  // Realnie ZMIERZONE czasy trwania każdego słowa podczas czytania przez lektora
  // (przebieg 1, dzięki zdarzeniu 'boundary') — odtwarzane 1:1 w przebiegu 2 (cichym),
  // żeby tempo ucznia było DOSŁOWNIE takie samo jak tempo, które usłyszał.
  const recordedDurationsRef = useRef({}) // { [sentenceIdx]: [ms, ms, ...] }
  const safetyTimerRef = useRef(null)

  const currentWords = (sentenceList[sentenceIdx] || '').trim().split(/\s+/).filter(Boolean)

  // Każde słowo jest "odwiedzane" dwa razy na zdanie: raz z lektorem, raz cicho (powtórka)
  const totalStepsAll = sentenceList.reduce((s, sent) =>
    s + 2 * sent.trim().split(/\s+/).filter(Boolean).length, 0)

  // Jedno wspólne tempo dla obu przebiegów — pełna synchronizacja lektor ↔ wizualizacja
  const wordReadMs = (w) => estimateWordMs(w, narratorRate)
  const wordPauseMs = (w) => {
    let p = pauseSec * 1000
    if (/,$/.test(w)) p += commaPause * 1000
    if (/\.$/.test(w)) p += periodPause * 1000
    return p
  }

  const measureWordTop = (i) => {
    const el = wordRefs.current[i]
    const container = containerRef.current
    if (!el || !container) return null
    const er = el.getBoundingClientRect()
    const cr = container.getBoundingClientRect()
    return { x: er.left - cr.left + er.width / 2, y: er.top - cr.top }
  }

  const placeDotInstant = (i) => {
    const t = measureWordTop(i)
    if (t) { dotPosRef.current = t; setDotPos(t) }
  }

  const animateDotTo = (i, duration) => {
    const target = measureWordTop(i)
    if (!target) return
    const start = dotPosRef.current || target
    const startTime = performance.now()
    const arcHeight = 20
    cancelAnimationFrame(dotAnimRef.current)
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration)
      const x = start.x + (target.x - start.x) * t
      const y = start.y + (target.y - start.y) * t - arcHeight * 4 * t * (1 - t)
      const pos = { x, y }
      dotPosRef.current = pos
      setDotPos(pos)
      if (t < 1) dotAnimRef.current = requestAnimationFrame(step)
    }
    dotAnimRef.current = requestAnimationFrame(step)
  }

  useEffect(() => () => {
    bump() // unieważnij WSZYSTKO co mogło być w toku (boundary/onend/safetyTimer)
    clearTimeout(timeoutRef.current)
    clearTimeout(safetyTimerRef.current)
    cancelAnimationFrame(dotAnimRef.current)
    try { window.speechSynthesis?.cancel() } catch (e) {}
  }, [])

  // Wyznacza pozycje (indeks znaku) początku każdego słowa w oryginalnym tekście zdania —
  // potrzebne do zmapowania zdarzenia 'boundary' (charIndex) na konkretne słowo.
  const computeWordOffsets = (sentence) => {
    const offsets = []
    const re = /\S+/g
    let m
    while ((m = re.exec(sentence)) !== null) offsets.push(m.index)
    return offsets
  }

  // ── PRZEBIEG 1 (z lektorem) — realna synchronizacja przez zdarzenie 'boundary' ──
  const speakSentenceWithSync = (sIdx) => {
    const myToken = bump()
    const sentence = sentenceList[sIdx] || ''
    const offsets  = computeWordOffsets(sentence)
    const words    = sentence.trim().split(/\s+/).filter(Boolean)

    if (!window.speechSynthesis || boundarySupportedRef.current === false) {
      // Synteza niedostępna albo już wiemy, że 'boundary' nie działa w tej przeglądarce —
      // od razu licz na szacowanym, własnym tempie (stary, sprawdzony sposób).
      try { window.speechSynthesis?.cancel() } catch (e) {}
      if (window.speechSynthesis) {
        try {
          const u = new SpeechSynthesisUtterance(sentence)
          u.lang = 'pl-PL'
          u.rate = Math.max(0.1, Math.min(2, narratorRate))
          window.speechSynthesis.speak(u)
        } catch (e) {}
      }
      goToWord(sIdx, 0)
      return
    }

    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(sentence)
      u.lang = 'pl-PL'
      u.rate = Math.max(0.1, Math.min(2, narratorRate))

      let boundaryUsed = false
      let lastBoundaryTime = performance.now()
      let lastWordIdx = -1
      const recordDuration = (now) => {
        if (lastWordIdx < 0) return
        if (!recordedDurationsRef.current[sIdx]) recordedDurationsRef.current[sIdx] = []
        const d = Math.max(80, Math.min(3000, now - lastBoundaryTime))
        recordedDurationsRef.current[sIdx][lastWordIdx] = d
      }

      safetyTimerRef.current = setTimeout(() => {
        if (tokenRef.current !== myToken) return
        if (!boundaryUsed) {
          // 'boundary' się nie odpalił w rozsądnym czasie — ta przeglądarka go nie wspiera
          boundarySupportedRef.current = false
          goToWord(sIdx, 0)
        }
      }, 700)

      u.onboundary = (event) => {
        if (tokenRef.current !== myToken) return
        if (event.name && event.name !== 'word') return
        boundaryUsed = true
        boundarySupportedRef.current = true
        clearTimeout(safetyTimerRef.current)

        const now = performance.now()
        const charIdx = event.charIndex ?? 0
        let wIdx = 0
        for (let i = 0; i < offsets.length; i++) if (charIdx >= offsets[i]) wIdx = i

        if (wIdx !== lastWordIdx) {
          recordDuration(now)
          lastBoundaryTime = now
          lastWordIdx = wIdx
        }

        idxRef.current = wIdx
        setIdx(wIdx)
        phaseRef.current = 'reading'
        setPhase('reading')
        animateDotTo(wIdx, 150)
      }

      u.onend = () => {
        if (tokenRef.current !== myToken) return
        clearTimeout(safetyTimerRef.current)
        if (boundaryUsed) {
          // Ostatnie słowo: użyj średniej zmierzonych czasów POZOSTAŁYCH słów w tym zdaniu.
          // Nie mierzymy do onend (post-processing TTS wydłuża czas) ani nie używamy estimateWordMs
          // (może być nieprecyzyjne). Średnia z realnych pomiarów = najlepsza aproksymacja.
          if (lastWordIdx >= 0) {
            if (!recordedDurationsRef.current[sIdx]) recordedDurationsRef.current[sIdx] = []
            const otherDurations = (recordedDurationsRef.current[sIdx] || [])
              .filter((d, i) => i < lastWordIdx && d > 0)
            const avgDuration = otherDurations.length > 0
              ? Math.round(otherDurations.reduce((a, b) => a + b, 0) / otherDurations.length)
              : estimateWordMs(words[lastWordIdx], narratorRate)
            recordedDurationsRef.current[sIdx][lastWordIdx] = avgDuration
          }
          finishNarratedPass(sIdx, words.length)
        } else {
          boundarySupportedRef.current = false
          goToWord(sIdx, 0)
        }
      }
      u.onerror = () => {
        if (tokenRef.current !== myToken) return
        clearTimeout(safetyTimerRef.current)
        if (boundaryUsed) {
          if (lastWordIdx >= 0) {
            if (!recordedDurationsRef.current[sIdx]) recordedDurationsRef.current[sIdx] = []
            const otherDurations = (recordedDurationsRef.current[sIdx] || [])
              .filter((d, i) => i < lastWordIdx && d > 0)
            const avgDuration = otherDurations.length > 0
              ? Math.round(otherDurations.reduce((a, b) => a + b, 0) / otherDurations.length)
              : estimateWordMs(words[lastWordIdx], narratorRate)
            recordedDurationsRef.current[sIdx][lastWordIdx] = avgDuration
          }
          finishNarratedPass(sIdx, words.length)
        } else {
          boundarySupportedRef.current = false
          goToWord(sIdx, 0)
        }
      }

      window.speechSynthesis.speak(u)
    } catch (e) {
      goToWord(sIdx, 0)
    }
  }

  // Lektor naprawdę skończył (zdarzenie 'boundary' działało) — zalicz cały przebieg
  // i przejdź do przebiegu 2 (cichego, na szacowanym tempie — tak jak dotychczas).
  const finishNarratedPass = (sIdx, wordCount) => {
    setStepsDone(n => n + wordCount)
    passRef.current = 'silent'
    setPass('silent')
    placeDotInstant(0)
    goToWord(sIdx, 0)
  }

  const enterSentence = (sIdx) => {
    sentenceIdxRef.current = sIdx
    setSentenceIdx(sIdx)
    passRef.current = 'with_narrator'
    setPass('with_narrator')
    placeDotInstant(0)
    speakSentenceWithSync(sIdx)
  }

  // ── Czas trwania słowa: nagrane realne tempo lektora (priorytet) → szacowanie (fallback) ──
  const getWordDuration = (sIdx, wIdx, w) => {
    const recorded = recordedDurationsRef.current[sIdx]?.[wIdx]
    return recorded || wordReadMs(w)
  }

  // ── Timer (przebieg 2 zawsze odtwarza nagrane tempo; przebieg 1 tylko jako fallback) ──
  const goToWord = (sIdx, wIdx) => {
    const myToken = bump()
    idxRef.current = wIdx
    setIdx(wIdx)
    phaseRef.current = 'reading'
    setPhase('reading')
    phaseStartedAtRef.current = performance.now()
    const words = (sentenceList[sIdx] || '').trim().split(/\s+/).filter(Boolean)
    const d = getWordDuration(sIdx, wIdx, words[wIdx])
    phaseDurationRef.current = d
    timeoutRef.current = setTimeout(() => {
      if (tokenRef.current !== myToken) return
      enterWordPause(sIdx, wIdx)
    }, d)
  }

  const enterWordPause = (sIdx, wIdx) => {
    const myToken = bump()
    phaseRef.current = 'pause'
    setPhase('pause')
    phaseStartedAtRef.current = performance.now()
    const words = (sentenceList[sIdx] || '').trim().split(/\s+/).filter(Boolean)
    const p = wordPauseMs(words[wIdx])
    phaseDurationRef.current = p

    const nextWIdx = wIdx + 1
    if (nextWIdx < words.length) {
      const hopDuration = Math.max(120, Math.min(p * 0.75, 420))
      animateDotTo(nextWIdx, hopDuration)
    }

    timeoutRef.current = setTimeout(() => {
      if (tokenRef.current !== myToken) return
      advanceWord(sIdx, wIdx)
    }, p)
  }

  const advanceWord = (sIdx, wIdx) => {
    setStepsDone(n => n + 1)
    const words = (sentenceList[sIdx] || '').trim().split(/\s+/).filter(Boolean)
    const nextWIdx = wIdx + 1

    if (nextWIdx < words.length) {
      goToWord(sIdx, nextWIdx)
      return
    }

    // Koniec przebiegu przez wszystkie słowa zdania (tylko fallback bez boundary trafia tutaj dla pass 1)
    if (passRef.current === 'with_narrator') {
      passRef.current = 'silent'
      setPass('silent')
      placeDotInstant(0)
      goToWord(sIdx, 0)
    } else {
      // Koniec przebiegu cichego DANEGO zdania = koniec jednego "rzutu" w grze kręgli.
      // Dwa zdania = jedna runda (dwa rzuty), tak jak w prawdziwych kręglach.
      bump()
      const res = mic.getResult()
      mic.resetCounters()
      const nextS = sIdx + 1
      const isLast = nextS >= sentenceList.length
      throwHistoryRef.current = [...throwHistoryRef.current, res.ratio * 100]
      isLastThrowRef.current = isLast
      pendingNextSentenceRef.current = nextS
      setRunning(false)
      setThrowPct(res.ratio * 100)
      setShowThrow(true)
      if (isLast) {
        phaseRef.current = 'done'
        setPhase('done')
        mic.stop()
        micStartedRef.current = false
      }
      return
    }
  }

  const handleThrowDone = () => {
    setShowThrow(false)
    if (isLastThrowRef.current) return // koniec ćwiczenia — normalne przyciski Powtórz/Ukończ
    setRunning(true)
    enterSentence(pendingNextSentenceRef.current)
  }

  const handleStartPause = () => {
    if (running) {
      bump()
      setRunning(false)
      clearTimeout(timeoutRef.current)
      cancelAnimationFrame(dotAnimRef.current)
      try { window.speechSynthesis?.cancel() } catch (e) {}
      const elapsedInPhase = performance.now() - phaseStartedAtRef.current
      phaseRemainingRef.current = Math.max(0, (phaseDurationRef.current || 0) - elapsedInPhase)
      pauseStartRef.current = performance.now()
      return
    }

    setRunning(true)
    if (phase === 'idle' || phase === 'done') {
      setStepsDone(0)
      setShowThrow(false)
      throwHistoryRef.current = []
      ensureMicStarted()
      enterSentence(0)
    } else if (phaseRef.current === 'reading' && pass === 'with_narrator' && boundarySupportedRef.current !== false) {
      // Wznowienie w trakcie przebiegu z lektorem (zsynchronizowanego) — po prostu przeczytaj zdanie od nowa
      enterSentence(sentenceIdxRef.current)
    } else if (phaseRef.current === 'reading') {
      goToWord(sentenceIdxRef.current, idxRef.current)
    } else if (phaseRef.current === 'pause') {
      const myToken = bump()
      const remain = phaseRemainingRef.current
      timeoutRef.current = setTimeout(() => {
        if (tokenRef.current !== myToken) return
        advanceWord(sentenceIdxRef.current, idxRef.current)
      }, remain)
    }
  }

  const restart = () => {
    setPhase('idle')
    setStepsDone(0)
    setShowThrow(false)
    throwHistoryRef.current = []
    ensureMicStarted()
    setRunning(true)
    enterSentence(0)
  }

  const pct = totalStepsAll > 0 ? Math.min(100, (stepsDone / totalStepsAll) * 100) : 0
  const withNarrator = pass === 'with_narrator'

  return (
    <div className="card">
      <style>{`
        @keyframes underlineGrow {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>

      <div className="progress-wrap dark" style={{ marginBottom: 14 }}>
        <div className="progress-fill colored" style={{ width: `${pct}%` }} />
      </div>

      {phase !== 'idle' && phase !== 'done' && (
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 800,
            padding: '3px 10px', borderRadius: 999,
            background: withNarrator ? '#EEF2FF' : '#F0FDF4',
            color:      withNarrator ? 'var(--primary)' : 'var(--green)',
          }}>
            {withNarrator ? '🔊 Z lektorem' : '🗣 Samodzielnie (bez lektora)'}
          </span>
        </div>
      )}

      <div ref={containerRef} style={{
        position: 'relative',
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: '10px 12px', alignContent: 'center',
        background: '#F8FAFC', borderRadius: 12, padding: '26px 14px 18px',
        minHeight: 90, marginBottom: 14, overflow: 'visible',
      }}>
        {dotPos && (
          <div style={{
            position: 'absolute', left: 0, top: 0,
            width: 10, height: 10, borderRadius: '50%',
            background: '#EF4444', boxShadow: '0 2px 6px rgba(239,68,68,.5)',
            transform: `translate(${dotPos.x - 5}px, ${dotPos.y - 16}px)`,
            pointerEvents: 'none', zIndex: 2,
          }} />
        )}

        {currentWords.map((w, i) => {
          const isActive = i === idx
          const isReading = isActive && phase === 'reading'
          const isJustRead = isActive && phase === 'pause'

          let wordContent = w
          if (isActive && phoneme) {
            const core = w.replace(/^[^a-zżźćńółęąśA-ZŻŹĆŃÓŁĘĄŚ]+/, '')
            const prefixLen = w.length - core.length
            if (core.toLowerCase().startsWith(phoneme.toLowerCase())) {
              const boldPart = w.slice(prefixLen, prefixLen + phoneme.length)
              const beforePart = w.slice(0, prefixLen)
              const restPart = w.slice(prefixLen + phoneme.length)
              wordContent = (
                <>
                  {beforePart}
                  <strong style={{ color: '#DC2626', fontWeight: 900 }}>{boldPart}</strong>
                  {restPart}
                </>
              )
            }
          }

          return (
            <span key={i}
              ref={el => { wordRefs.current[i] = el }}
              style={{
                position: 'relative',
                color:      isActive ? '#6C63FF' : i < idx ? '#CBD5E1' : '#1E293B',
                background: isActive ? '#EEF2FF' : 'transparent',
                borderRadius: 6, padding: '3px 7px',
                fontSize: 16, fontWeight: 700,
                whiteSpace: 'nowrap',
                transition: 'color .2s, background .2s',
              }}>
              {wordContent}
              {(isReading || isJustRead) && pass === 'silent' && (
                <span key={`ul-${sentenceIdx}-${pass}-${idx}`} style={{
                  position: 'absolute', left: 7, bottom: 0, height: 2,
                  background: '#6C63FF', borderRadius: 2,
                  width: isJustRead ? '100%' : undefined,
                  animation: isReading ? `underlineGrow ${getWordDuration(sentenceIdx, i, w)}ms linear forwards` : 'none',
                }} />
              )}
            </span>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        {phase === 'idle'
          ? 'Gotowy do startu'
          : phase === 'done'
          ? 'Wszystkie zdania ukończone!'
          : `Zdanie ${sentenceIdx + 1}/${sentenceList.length} · słowo ${idx + 1} z ${currentWords.length}`}
      </div>

      {showThrow ? (
        <BowlingReward pct={throwPct} onDone={handleThrowDone} />
      ) : phase === 'done' ? (
        <div>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
            Rzutów: {throwHistoryRef.current.length} · Łącznie kręgli: {throwHistoryRef.current.reduce((s, p) => s + pinsForPct(p), 0)}/{throwHistoryRef.current.length * 10}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={restart}>↩ Powtórz</button>
            <button className="btn btn-green" style={{ flex: 2 }} onClick={onComplete}>✓ Ukończ ćwiczenie</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-full" onClick={handleStartPause}>
          {running ? '⏸ Pauza' : (phase === 'idle' ? '▶ Start' : '▶ Wznów')}
        </button>
      )}
    </div>
  )
}

// ── Urządzenia (Mechanical Tongue Trainer / Froggy Mouth) ────────────────────
// Dwa alarmy: przypomnienie ~1 min przed końcem (2x, bez potwierdzenia)
// i alarm końcowy, który dzwoni aż do kliknięcia (wymaga potwierdzenia).
function DeviceTimer({ exercise, onComplete, gameWindow }) {
  const totalSec = exercise.duration * 60
  const sound = exercise.alarmSound || 'phone'

  const [sec, setSec]         = useState(totalSec)
  const [running, setRunning] = useState(false)
  const [ended, setEnded]     = useState(false)
  const ivRef   = useRef(null)
  const ringRef = useRef(null)
  const reminderFiredRef = useRef(false)
  const endedAtRef       = useRef(0)
  const accumulatedMsRef = useRef(0)
  const runStartRef      = useRef(0)

  useEffect(() => () => { clearInterval(ivRef.current); clearInterval(ringRef.current) }, [])

  // Timer startuje automatycznie po wejściu w ćwiczenie
  useEffect(() => { setRunning(true) }, [])

  const tick = () => {
    const elapsedMs   = accumulatedMsRef.current + (performance.now() - runStartRef.current)
    const remainingMs = totalSec * 1000 - elapsedMs
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))

    if (remainingSec <= 60 && totalSec > 60 && !reminderFiredRef.current) {
      reminderFiredRef.current = true
      for (let i = 0; i < 4; i++) {
        setTimeout(() => playSound(sound), i * 700)
      }
    }

    if (remainingMs <= 0) {
      setSec(0)
      clearInterval(ivRef.current)
      setRunning(false)
      setEnded(true)
      endedAtRef.current = performance.now()
      return
    }
    setSec(remainingSec)
  }

  useEffect(() => {
    if (!running) { clearInterval(ivRef.current); return }
    runStartRef.current = performance.now()
    tick() // odśwież natychmiast (np. po powrocie z innej karty)
    ivRef.current = setInterval(tick, 1000)
    return () => clearInterval(ivRef.current)
  }, [running])

  useEffect(() => {
    if (!ended) return
    playSound(sound)
    ringRef.current = setInterval(() => playSound(sound), 3500)
    return () => clearInterval(ringRef.current)
  }, [ended])

  // Migający tytuł karty — widoczny nawet gdy użytkownik jest na innej karcie (np. w grze)
  useTitleFlash(ended, '⏰ KONIEC TRENINGU!')

  const toggleRunning = () => {
    if (running) {
      accumulatedMsRef.current += performance.now() - runStartRef.current
      setRunning(false)
    } else {
      setRunning(true)
    }
  }

  const dismissAndComplete = () => {
    clearInterval(ringRef.current)
    const overtimeMs  = Math.max(0, performance.now() - endedAtRef.current)
    const extended    = overtimeMs > 30000
    const overtimeSec = extended ? Math.round(overtimeMs / 1000) : 0
    onComplete(extended, false, overtimeSec)
  }

  const pct  = Math.round(((totalSec - sec) / totalSec) * 100)
  const R    = 68
  const circ = TAU * R
  const mm   = String(Math.floor(sec / 60)).padStart(2, '0')
  const ss2  = String(sec % 60).padStart(2, '0')

  // Liczymy na bieżąco ile czasu minęło po zakończeniu timera (overtime)
  const [overtimeDisplay, setOvertimeDisplay] = useState(0)
  useEffect(() => {
    if (!ended) return
    const iv = setInterval(() => {
      setOvertimeDisplay(Math.floor((performance.now() - endedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [ended])

  if (ended) {
    const om = Math.floor(overtimeDisplay / 60)
    const os = overtimeDisplay % 60
    const overtimeStr = om > 0 ? `${om} min ${os} sek` : `${os} sek`
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>⏰</div>
        <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--red)', marginBottom: 6 }}>Czas minął!</div>
        {overtimeDisplay > 0 && (
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--orange)', marginBottom: 8 }}>
            Trenujesz już {overtimeStr} ponad plan
          </div>
        )}
        {gameWindow && !gameWindow.closed && (
          <div style={{
            fontSize: 12, color: 'var(--muted)', marginBottom: 12,
            padding: '8px 12px', background: '#F8FAFC', borderRadius: 8,
            border: '1px solid var(--border)',
          }}>
            💡 Możesz teraz zamknąć kartę z grą
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          Kliknij, aby zatrzymać alarm i zakończyć ćwiczenie
        </div>
        <button className="btn btn-green btn-full" onClick={dismissAndComplete}>🔕 Zatrzymaj i zakończ</button>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="timer-wrap">
        <svg width="170" height="170" viewBox="0 0 170 170">
          <Arc cx={85} cy={85} r={R} pct={pct} color="url(#mg1)" strokeWidth={11} transition=".8s" />
          <defs>
            <linearGradient id="mg1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6C63FF" /><stop offset="100%" stopColor="#9B8FFF" />
            </linearGradient>
          </defs>
          <text x="85" y="78" textAnchor="middle"
            fontFamily="'Space Mono',monospace" fontSize="28" fontWeight="700" fill="#1E293B">
            {mm}:{ss2}
          </text>
          <text x="85" y="102" textAnchor="middle" fontFamily="Nunito" fontSize="13" fill="#64748B">
            {pct}%
          </text>
        </svg>
      </div>
      {totalSec > 60 && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          🔔 Przypomnienie ~1 min przed końcem · 🔔 Alarm na koniec (wymaga potwierdzenia)
        </div>
      )}
      <button className="btn btn-primary btn-full mt-8" onClick={toggleRunning}>
        {running ? '⏸ Pauza' : sec === totalSec ? '▶ Start' : '▶ Wznów'}
      </button>
    </div>
  )
}

// ── Instrukcja dynamiczna ──────────────────────────────────────────────────────
function buildInstruction(exercise) {
  const p = exercise.params || {}

  if (exercise.module === 'tongue_position') {
    const sec = p.activeSec ?? 5
    return `Przez chwilę skup się na spokojnym utrzymaniu prawidłowej pozycji języka. Otwórz szeroko usta, a następnie dotknij czubkiem języka podniebienia, tak aby język utworzył koszyczek, i utrzymaj przez ${sec} sekund. Ćwicz dokładnie, bez pośpiechu.`
  }

  if (exercise.module === 'sz_lip') {
    const words = (p.words || 'sza,sze,szo,szu').split(',').map(w => w.trim()).filter(Boolean)
    return `Posłuchaj lektora, a gdy wyraz pojawi się na ekranie — powtórz go. Kolejność wyrazów: ${words.join(', ')}. Cały cykl powtórzony zostanie ${p.reps ?? 5} razy.`
  }

  if (exercise.module === 'speech_rhythm') {
    return 'Mów powoli i równo. Powtórz słowa lub sylaby w spokojnym rytmie. Podczas wymawiania początku wyrazów otwieraj usta i w słowach tego wymagających rób dzióbek. Pilnujemy języka!!! (Język nie może wychodzić poza zęby).'
  }

  return exercise.instruction || ''
}

// ── Główny ekran ──────────────────────────────────────────────────────────────
export default function ExerciseScreen({ exercise, plan, setPlan, user, setUser, setScreen, gameWindow }) {
  const [finished,  setFinished]  = useState(false)
  const [earnedPts, setEarnedPts] = useState(0)

  if (!exercise) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--muted)' }}>Brak wybranego ćwiczenia.</p>
        <button className="btn btn-primary mt-12" onClick={() => setScreen('today')}>← Wróć do planu</button>
      </div>
    )
  }

  const isDeviceExercise = exercise.module === 'mechanical' || exercise.module === 'froggy_mouth'

  const finishAndAward = (pts, extended, gameTabClosed = false, overtimeSec = 0) => {
    const updatedPlan = plan.map(e => e.id === exercise.id
      ? { ...e, status: 'completed',
          ...(extended       ? { extendedTraining: true, overtimeSeconds: overtimeSec } : {}),
          ...(gameTabClosed  ? { completedViaGameTab: true } : {}) }
      : e
    )
    setPlan(updatedPlan)
    const dayStats  = calcDayStats(updatedPlan)
    const bonus     = dayStats.pct === 100 ? 50 : 0
    const newPoints = user.points + pts + bonus
    const earned    = [...(user.badges || [])]
    const totalDone = updatedPlan.filter(e => e.status === 'completed').length
    const add = (id) => { if (!earned.includes(id)) earned.push(id) }
    if (totalDone >= 1) add('first_training')
    if (totalDone >= 3) add('three_trainings')
    if (totalDone >= 7) add('seven_trainings')
    if (dayStats.pct === 100) add('full_day')
    setUser(prev => ({ ...prev, points: newPoints, badges: earned }))
    setEarnedPts(pts + bonus)
    playApplause()
    setFinished(true)
  }

  const handleHalfPoints = () => setUser(prev => ({ ...prev, points: prev.points + 5 }))
  const handleComplete = (extended, gameTabClosed, overtimeSec = 0) => finishAndAward(isDeviceExercise ? 20 : 5, extended, gameTabClosed, overtimeSec)

  const cancel = () => {
    // Zatrzymaj głos PRZED blokującym dialogiem potwierdzenia — eliminuje wyścig,
    // w którym syntezator mógłby "wystrzelić" kolejne zdarzenie tuż po odblokowaniu.
    try { window.speechSynthesis?.cancel() } catch (e) {}
    if (!window.confirm(`Czy na pewno chcesz anulować "${exercise.name}"? Tej operacji nie można cofnąć.`)) return
    setPlan(prev => prev.map(e => e.id === exercise.id ? { ...e, status: 'cancelled' } : e))
    setScreen('today')
  }

  const renderTimer = () => {
    switch (exercise.module) {
      case 'tongue_position': return <TongueTimer   exercise={exercise} onHalfPoints={handleHalfPoints} onComplete={handleComplete} />
      case 'sz_lip':          return <SzLipTimer    exercise={exercise} onComplete={handleComplete} />
      case 'speech_rhythm':   return <RhythmTimer   exercise={exercise} onComplete={handleComplete} />
      default:                return <DeviceTimer   exercise={exercise} onComplete={handleComplete} gameWindow={gameWindow} />
    }
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => setScreen('today')}>
        ← Wróć
      </button>

      <p className="section-title">🎙 {exercise.name}</p>
      <p className="section-sub" style={{ marginBottom: 12 }}>
        Moduł: {exercise.module} · {exercise.duration} min · +{exercise.points} pkt
      </p>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 5 }}>INSTRUKCJA</div>
        <p style={{ fontSize: 14, lineHeight: 1.65 }}>{buildInstruction(exercise)}</p>
      </div>

      {finished ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🎉</div>
          <div style={{ fontWeight: 900, fontSize: 20, color: 'var(--green)' }}>Świetna robota!</div>
          <div style={{ color: 'var(--muted)', marginTop: 4, fontSize: 14 }}>+{earnedPts} pkt zdobyte</div>
          <button className="btn btn-primary btn-full mt-12" onClick={() => setScreen('today')}>
            Wróć do planu
          </button>
        </div>
      ) : (
        <>
          {renderTimer()}
          <button className="btn btn-full mt-8"
            style={{ background: '#FEF2F2', color: 'var(--red)', fontWeight: 800 }}
            onClick={cancel}>
            ✕ Anuluj ćwiczenie
          </button>
        </>
      )}
    </div>
  )
}
