// Baza wzorców — kalibracja mikrofonu prowadzona przez logopedę.
//
// Przebieg: wybór pary słów → Karolek nagrywa wersję błędną i poprawną → logopeda odsłuchuje
// każde nagranie i je akceptuje albo odrzuca → z zaakceptowanych aplikacja wylicza próg.
// Nagrania zostają na tym urządzeniu, więc można do nich wrócić i zmienić decyzję.

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter } from './games/useSibilantMeter'
import {
  addPattern, removePattern, setPatternStatus, usePatterns, computeThreshold,
  saveAudio, usePlayPattern, MIN_APPROVED_PER_SIDE,
} from '../data/patternStore'

const TAKE_MAX_MS = 3000
const PRESET_PAIRS = [
  { wrong: 'socek', right: 'soczek' },
  { wrong: 'cemu',  right: 'czemu'  },
  { wrong: 'salik', right: 'szalik' },
  { wrong: 'capka', right: 'czapka' },
  { wrong: 'kasa',  right: 'kasza'  },
  { wrong: 'safa',  right: 'szafa'  },
]
const pairKey = (p) => `${p.wrong}|${p.right}`
const STATUS = {
  pending:  { label: 'Do oceny',      color: 'var(--muted)' },
  approved: { label: 'Zaakceptowane', color: 'var(--green)' },
  rejected: { label: 'Odrzucone',     color: 'var(--red)' },
}

function ThresholdCard({ patterns }) {
  const t = computeThreshold(patterns)
  const need = (n) => Math.max(0, MIN_APPROVED_PER_SIDE - n)
  let title, text, color
  if (t.quality === 'good') {
    title = `Próg: ${t.hz} Hz`; color = 'var(--green)'
    text = `Wyraźny odstęp ${t.gap} Hz między nagraniami poprawnymi i błędnymi. Próg jest zapisany dla tego urządzenia.`
  } else if (t.quality === 'narrow') {
    title = `Próg: ${t.hz} Hz (niepewny)`; color = 'var(--yellow)'
    text = `Odstęp to tylko ${t.gap} Hz. Dograjcie więcej nagrań albo odrzućcie niewyraźne — z takim progiem aplikacja jeszcze nie ocenia.`
  } else if (t.quality === 'overlap') {
    title = 'Progu nie da się wyznaczyć'; color = 'var(--red)'
    text = 'Zaakceptowane nagrania poprawne i błędne nakładają się w pomiarze. Sprawdźcie decyzje albo warunki nagrania (cisza, odległość od mikrofonu).'
  } else {
    title = 'Za mało zaakceptowanych nagrań'; color = '#64748B'
    text = `Potrzeba jeszcze: poprawnych ${need(t.nRight)}, błędnych ${need(t.nWrong)} (minimum ${MIN_APPROVED_PER_SIDE} z każdej strony, z różnych słów).`
  }
  return (
    <div className="card" style={{ borderLeft: `5px solid ${color}` }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
      <div className="text-muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{text}</div>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
        Zaakceptowane: {t.nRight} poprawnych · {t.nWrong} błędnych
      </div>
    </div>
  )
}

export default function PatternBaseScreen() {
  const meter    = useSibilantMeter()
  const patterns = usePatterns()
  const play     = usePlayPattern()
  const [micState, setMicState]   = useState('off')
  const [pairs, setPairs]         = useState(() => {
    // pary z zapisanych nagrań + gotowe
    const saved = [...new Set(patterns.map(p => p.pair))].map(k => { const [wrong, right] = k.split('|'); return { wrong, right } })
    const all = [...PRESET_PAIRS]
    saved.forEach(p => { if (!all.some(x => pairKey(x) === pairKey(p))) all.push(p) })
    return all
  })
  const [activeKey, setActiveKey] = useState(pairKey(PRESET_PAIRS[0]))
  const [recording, setRecording] = useState(null)
  const [customWrong, setCustomWrong] = useState('')
  const [customRight, setCustomRight] = useState('')
  const [note, setNote] = useState('')

  const timerRef = useRef(null)
  const recordingRef = useRef(null)
  recordingRef.current = recording

  useEffect(() => {
    const id = setInterval(() => { const s = meter.getInfo().state; setMicState(prev => (prev === s ? prev : s)) }, 200)
    return () => clearInterval(id)
  }, [meter])
  useEffect(() => () => { clearTimeout(timerRef.current); meter.stop() }, [meter])

  const activePair = pairs.find(p => pairKey(p) === activeKey) || pairs[0]
  const micOn = micState === 'on'

  const toggleMic = async () => {
    if (micState === 'off' || micState === 'error') { setMicState('calibrating'); await meter.start() }
    else { clearTimeout(timerRef.current); setRecording(null); meter.stop() }
  }

  const finishTake = async (side, pair) => {
    clearTimeout(timerRef.current)
    const take = await meter.stopTake()
    setRecording(null)
    if (!take) return
    const entry = addPattern({
      pair: pairKey(pair), word: side === 'wrong' ? pair.wrong : pair.right, side,
      value: take.value, segments: take.segments,
    })
    const stored = await saveAudio(entry.id, take.blob)
    setNote(take.value == null
      ? 'W tym nagraniu nie wykryto szumu głoski — nagrajcie ponownie, bliżej mikrofonu.'
      : stored ? '' : 'Pomiar zapisany, ale dźwięku nie udało się zachować do odsłuchu.')
  }

  const record = (side) => {
    if (recording === side) { finishTake(side, activePair); return }
    if (recording || !micOn) return
    if (!meter.startTake()) return
    setRecording(side)
    const pair = activePair
    timerRef.current = setTimeout(() => { if (recordingRef.current === side) finishTake(side, pair) }, TAKE_MAX_MS)
  }

  const addPair = () => {
    const wrong = customWrong.trim().toLowerCase(), right = customRight.trim().toLowerCase()
    if (!wrong || !right) return
    const p = { wrong, right }
    if (!pairs.some(x => pairKey(x) === pairKey(p))) setPairs(prev => [...prev, p])
    setActiveKey(pairKey(p)); setCustomWrong(''); setCustomRight('')
  }

  const Column = ({ side, word }) => {
    const list = patterns.filter(p => p.pair === activeKey && p.side === side)
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="form-label" style={{ marginBottom: 2 }}>{side === 'wrong' ? 'Błędnie' : 'Poprawnie'}</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: side === 'wrong' ? 'var(--orange)' : 'var(--blue)' }}>{word}</div>
        <button className={`btn btn-full ${recording === side ? 'btn-red' : 'btn-primary'}`}
          disabled={!micOn || (recording && recording !== side)} onClick={() => record(side)}>
          {recording === side ? '■ Stop' : '● Nagraj'}
        </button>
        {list.length === 0 && <div className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>Brak nagrań</div>}
        {list.map((p, i) => (
          <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 800, flex: 1, whiteSpace: 'nowrap', fontSize: 15 }}>{i + 1}. {p.value == null ? 'brak szumu' : `${p.value} Hz`}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => play(p.id)} aria-label="Odsłuchaj">▶</button>
              <button className="btn btn-ghost btn-sm" onClick={() => removePattern(p.id)} aria-label="Usuń">✕</button>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: STATUS[p.status].color, margin: '4px 0 6px' }}>{STATUS[p.status].label}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`btn btn-sm ${p.status === 'approved' ? 'btn-green' : 'btn-ghost'}`} style={{ flex: 1, padding: '8px 4px' }}
                disabled={p.value == null} onClick={() => setPatternStatus(p.id, p.status === 'approved' ? 'pending' : 'approved')}>Akceptuj</button>
              <button className={`btn btn-sm ${p.status === 'rejected' ? 'btn-red' : 'btn-ghost'}`} style={{ flex: 1, padding: '8px 4px' }}
                onClick={() => setPatternStatus(p.id, p.status === 'rejected' ? 'pending' : 'rejected')}>Odrzuć</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <ThresholdCard patterns={patterns} />

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className={`btn ${micOn || micState === 'calibrating' ? 'btn-outline' : 'btn-primary'}`} onClick={toggleMic}>
            {micState === 'off' || micState === 'error' ? 'Włącz mikrofon' : 'Wyłącz mikrofon'}
          </button>
          {micState === 'calibrating' && <span style={{ fontWeight: 800, color: 'var(--orange)' }}>Cisza — mierzę tło…</span>}
          {micState === 'error' && <span style={{ fontWeight: 800, color: 'var(--red)' }}>Brak dostępu do mikrofonu</span>}
        </div>
        <p className="text-muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
          Cichy pokój, usta 20–30 cm od mikrofonu, zawsze to samo urządzenie. Jedno słowo na nagranie.
          „Akceptuj” przy wersji poprawnej znaczy: tak ma brzmieć. Przy wersji błędnej: to jest typowy błąd Karolka.
        </p>
      </div>

      <div className="card">
        <span className="form-label">Para słów</span>
        <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 12 }}>
          {pairs.map(p => {
            const n = patterns.filter(x => x.pair === pairKey(p)).length
            return (
              <button key={pairKey(p)} className={`btn btn-sm ${pairKey(p) === activeKey ? 'btn-primary' : 'btn-ghost'}`}
                disabled={!!recording} onClick={() => setActiveKey(pairKey(p))}>
                {p.wrong} / {p.right}{n > 0 ? ` · ${n}` : ''}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="form-input" style={{ marginBottom: 0 }} placeholder="błędnie" value={customWrong} onChange={e => setCustomWrong(e.target.value)} />
          <input className="form-input" style={{ marginBottom: 0 }} placeholder="poprawnie" value={customRight} onChange={e => setCustomRight(e.target.value)} />
          <button className="btn btn-outline btn-sm" onClick={addPair}>Dodaj</button>
        </div>
      </div>

      <div className="card">
        {!micOn && <div className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>Włącz mikrofon, żeby nagrywać. Odsłuch i ocena działają bez mikrofonu.</div>}
        <div style={{ display: 'flex', gap: 14 }}>
          <Column side="wrong" word={activePair.wrong} />
          <Column side="right" word={activePair.right} />
        </div>
        {note && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>{note}</div>}
        <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
          Wersję błędną nagrywamy tylko tutaj, kilka razy, do pomiaru.
        </div>
      </div>
    </div>
  )
}
