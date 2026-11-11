// Ćwiczenie "Mowa mieszana" — słowa z głoskami szumiącymi (sz, cz, ż, dż) przeplatane
// słowami z syczącymi (s, c, z, dz), w losowej kolejności.
//
// Po co: Karolek umie powiedzieć "soczek", gdy się pilnuje. Tu ćwiczy dwie rzeczy naraz:
//  1) wybór właściwej głoski bez podpowiedzi z poprzedniego słowa (kolejność losowa),
//  2) słyszenie samego siebie — po każdym nagraniu odsłuchuje je i SAM ocenia.
//
// Aplikacja na tym etapie NIE ocenia wymowy. Zapisuje ocenę dziecka i pomiar szumu głoski,
// żeby po kalibracji z logopedką można było ustawić progi na prawdziwych danych.

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter } from './games/useSibilantMeter'
import { MIX_WORD_BANK } from '../data/defaultData'
import { addResult } from '../data/resultsStore'
import { classifyValue } from '../data/patternStore'
import Icon from '../components/Icon'

const TAKE_MAX_MS = 2600

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 2/3 słów z głoską ćwiczoną, 1/3 kontrolnych; nigdy to samo słowo dwa razy z rzędu
function buildTrials(n) {
  const nTarget = Math.max(1, Math.round(n * 2 / 3))
  const targets  = shuffle(MIX_WORD_BANK.sz).slice(0, nTarget).map(w => ({ word: w, kind: 'sz' }))
  const controls = shuffle(MIX_WORD_BANK.s).slice(0, Math.max(0, n - nTarget)).map(w => ({ word: w, kind: 's' }))
  return shuffle([...targets, ...controls])
}

export default function MixSpeechExercise({ exercise, onComplete }) {
  const total = Math.max(4, Math.min(30, exercise.params?.trials ?? 12))
  const meter = useSibilantMeter()

  const [stage, setStage]   = useState('intro')   // intro | starting | word | recording | review | summary | error
  const [trials]            = useState(() => buildTrials(total))
  const [idx, setIdx]       = useState(0)
  const [take, setTake]     = useState(null)
  const [attempts, setAttempts] = useState(1)
  const [results, setResults]   = useState([])    // { word, kind, selfRating, attempts }

  const timerRef = useRef(null)
  const audioRef = useRef(null)
  const stageRef = useRef(stage)
  stageRef.current = stage

  useEffect(() => () => {
    clearTimeout(timerRef.current)
    try { audioRef.current?.pause() } catch (e) {}
    try { window.speechSynthesis?.cancel() } catch (e) {}
    meter.stop()
  }, [meter])

  const current = trials[idx]

  const begin = async () => {
    setStage('starting')
    const ok = await meter.start()
    if (!ok) { setStage('error'); return }
    // ~0.7 s pomiaru tła, potem pierwsze słowo
    timerRef.current = setTimeout(() => setStage('word'), 900)
  }

  const listen = () => {
    try {
      const u = new SpeechSynthesisUtterance(current.word)
      u.lang = 'pl-PL'
      u.rate = 0.7
      const voice = (window.speechSynthesis.getVoices() || []).find(v => v.lang.startsWith('pl'))
      if (voice) u.voice = voice
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch (e) {}
  }

  const play = (url) => {
    if (!url) return
    try {
      audioRef.current?.pause()
      const a = new Audio(url)
      audioRef.current = a
      a.play().catch(() => {})
    } catch (e) {}
  }

  const finishRecording = async () => {
    clearTimeout(timerRef.current)
    const t = await meter.stopTake()
    setTake(t)
    setStage('review')
    if (t?.url) play(t.url)   // od razu odsłuch — dziecko słyszy siebie przed oceną
  }

  const record = () => {
    try { window.speechSynthesis?.cancel() } catch (e) {}
    if (!meter.startTake()) return
    setStage('recording')
    timerRef.current = setTimeout(() => { if (stageRef.current === 'recording') finishRecording() }, TAKE_MAX_MS)
  }

  const retry = () => {
    setAttempts(a => a + 1)
    setTake(null)
    setStage('word')
  }

  const rate = (selfRating) => {
    // heard: co "usłyszał" pomiar ('sz' | 's' | null). Działa dopiero, gdy jest pewny próg z bazy wzorców.
    // Na razie tylko zapisujemy — porównanie z samooceną pokaże, czy pomiarowi można ufać.
    const entry = { word: current.word, kind: current.kind, selfRating, attempts, cog: take?.value ?? null, heard: classifyValue(take?.value ?? null) }
    addResult('mix_trial', { ...entry, templateId: exercise.templateId || exercise.id })
    const next = [...results, entry]
    setResults(next)
    setTake(null)
    setAttempts(1)
    if (idx + 1 >= trials.length) {
      meter.stop()
      setStage('summary')
    } else {
      setIdx(idx + 1)
      setStage('word')
    }
  }

  // ── Widoki ──────────────────────────────────────────────────────────────────
  if (stage === 'intro' || stage === 'starting' || stage === 'error') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 20 }}>{total} słów, każde inne</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '8px 0 14px', lineHeight: 1.55 }}>
          Zobacz słowo, nagraj je powoli i wyraźnie, posłuchaj siebie i oceń, czy wyszło.
          Raz będzie „sz”, raz „s” — pilnuj, które.
        </p>
        {stage === 'error' && (
          <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            Nie udało się otworzyć mikrofonu. Sprawdź zgodę przeglądarki.
          </div>
        )}
        <button className="btn btn-primary btn-full" disabled={stage === 'starting'} onClick={begin}>
          {stage === 'starting' ? 'Cisza — mierzę tło…' : 'Zaczynamy'}
        </button>
      </div>
    )
  }

  if (stage === 'summary') {
    const good  = results.filter(r => r.selfRating === 'good').length
    const fixed = results.filter(r => r.selfRating === 'good' && r.attempts > 1).length
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 40, color: 'var(--primary)' }}>
          {good}/{results.length}
        </div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>słów ocenionych jako dobre</div>
        {fixed > 0 && (
          <p className="text-muted" style={{ fontSize: 14, marginTop: 6 }}>
            {fixed} poprawione po odsłuchu — tak właśnie ćwiczy się słyszenie siebie.
          </p>
        )}
        <button className="btn btn-green btn-full mt-12" onClick={() => onComplete()}>Ukończ ćwiczenie</button>
      </div>
    )
  }

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 700 }}>Słowo {idx + 1} z {trials.length}</span>
        {attempts > 1 && <span className="chip chip-snoozed">próba {attempts}</span>}
      </div>
      <div className="progress-wrap dark" style={{ marginBottom: 18 }}>
        <div className="progress-fill colored" style={{ width: `${(idx / trials.length) * 100}%` }} />
      </div>

      <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -.5, margin: '10px 0 4px' }}>{current.word}</div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 18 }} onClick={listen}>Posłuchaj wzoru</button>

      {stage === 'word' && (
        <button className="btn btn-primary btn-full" style={{ padding: '16px 20px', fontSize: 17 }} onClick={record}>
          <Icon name="mic" size={20} /> Nagraj
        </button>
      )}

      {stage === 'recording' && (
        <button className="btn btn-red btn-full" style={{ padding: '16px 20px', fontSize: 17 }} onClick={finishRecording}>
          Mów teraz… (stuknij, gdy skończysz)
        </button>
      )}

      {stage === 'review' && (<>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 10 }}>Posłuchaj siebie. Jak wyszło?</div>
        {take?.url && (
          <button className="btn btn-outline btn-full" style={{ marginBottom: 10 }} onClick={() => play(take.url)}>
            <Icon name="play" size={16} /> Odtwórz jeszcze raz
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-green" style={{ flex: 1, padding: '14px 10px' }} onClick={() => rate('good')}>Dobrze</button>
          <button className="btn btn-ghost" style={{ flex: 1, padding: '14px 10px' }} onClick={retry}>Poprawiam</button>
          <button className="btn btn-ghost" style={{ flex: 1, padding: '14px 10px', color: 'var(--red)' }} onClick={() => rate('bad')}>Nie wyszło</button>
        </div>
      </>)}
    </div>
  )
}
