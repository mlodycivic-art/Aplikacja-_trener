// Ekran testowy "Test SZ" — sprawdza, czy mikrofon TEGO urządzenia odróżnia
// u Karolka "soczek" od "socek" (sz/cz ↔ s/c).
//
// To narzędzie pomiarowe dla dorosłego, nie ćwiczenie dla dziecka.
// Nagrania i wyniki żyją tylko do zamknięcia karty (trwały zapis wzorców = etap 2).

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter, pairVerdict, BAND_LO_HZ } from './games/useSibilantMeter'
import PatternBaseScreen from './PatternBaseScreen'
import QuickMicCalibration from './QuickMicCalibration'
import WordBaseScreen from './WordBaseScreen'

const SCALE_MIN = 2500   // dół wykresu (strona "SZ")
const SCALE_MAX = 8500   // góra wykresu (strona "S")
const TAKE_MAX_MS = 3000 // nagranie jednej próby kończy się samo po 3 s
const COLOR_S  = '#EA580C'
const COLOR_SZ = '#2563EB'

const PRESET_PAIRS = [
  { wrong: 'socek', right: 'soczek' },
  { wrong: 'cemu',  right: 'czemu'  },
  { wrong: 'salik', right: 'szalik' },
  { wrong: 'kasa',  right: 'kasza'  },
  { wrong: 'capka', right: 'czapka' },
]

const pairKey = (p) => `${p.wrong}|${p.right}`
const fmtHz = (v) => (v == null ? 'brak szumu' : `${v} Hz`)

function QuickTest() {
  const meter = useSibilantMeter()
  const [micState, setMicState] = useState('off')       // off | calibrating | on | error
  const [pairs, setPairs]       = useState(PRESET_PAIRS)
  const [activeKey, setActiveKey] = useState(pairKey(PRESET_PAIRS[0]))
  const [takes, setTakes]       = useState({})           // { [pairKey]: { wrong: [take], right: [take] } }
  const [recording, setRecording] = useState(null)       // 'wrong' | 'right' | null
  const [customWrong, setCustomWrong] = useState('')
  const [customRight, setCustomRight] = useState('')
  const [copied, setCopied]     = useState('')

  const canvasRef  = useRef(null)
  const readoutRef = useRef(null)
  const drawRafRef = useRef(null)
  const takeTimerRef = useRef(null)
  const recordingRef = useRef(null)
  recordingRef.current = recording

  const activePair = pairs.find(p => pairKey(p) === activeKey) || pairs[0]
  const activeTakes = takes[activeKey] || { wrong: [], right: [] }

  // ── Wykres na żywo (rysowany bezpośrednio na canvas, bez re-renderów Reacta) ──
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      const info = meter.getInfo()
      if (info.state !== micStateRef.current) setMicState(info.state)
      if (canvas) {
        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth, h = canvas.clientHeight
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr; canvas.height = h * dpr
        }
        const g = canvas.getContext('2d')
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, w, h)

        // tło: strefa S u góry, strefa SZ na dole
        g.fillStyle = '#F8FAFC'; g.fillRect(0, 0, w, h)
        g.fillStyle = 'rgba(234, 88, 12, .10)'; g.fillRect(0, 0, w, h * 0.38)
        g.fillStyle = 'rgba(37, 99, 235, .10)'; g.fillRect(0, h * 0.62, w, h * 0.38)
        g.font = '800 13px Manrope, sans-serif'
        g.fillStyle = COLOR_S;  g.fillText('S / C  (wysoko)', 8, 16)
        g.fillStyle = COLOR_SZ; g.fillText('SZ / CZ  (nisko)', 8, h - 8)

        const frames = meter.getFrames()
        const now = performance.now()
        const span = 3000
        let last = null
        for (const f of frames) {
          if (!f.hiss) continue
          const x = w - ((now - f.t) / span) * w
          const norm = Math.max(0, Math.min(1, (f.cog - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)))
          const y = h - norm * h
          g.fillStyle = norm > 0.5 ? COLOR_S : COLOR_SZ
          g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill()
          last = f
        }
        if (readoutRef.current) {
          const fresh = last && now - last.t < 250
          readoutRef.current.textContent = fresh ? `${Math.round(last.cog)} Hz` : '—'
          readoutRef.current.style.color = fresh
            ? ((last.cog - SCALE_MIN) / (SCALE_MAX - SCALE_MIN) > 0.5 ? COLOR_S : COLOR_SZ)
            : '#94A3B8'
        }
      }
      drawRafRef.current = requestAnimationFrame(draw)
    }
    drawRafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(drawRafRef.current)
  }, [meter])

  const micStateRef = useRef(micState)
  micStateRef.current = micState

  // Zamknięcie mikrofonu przy wyjściu z ekranu
  useEffect(() => () => { clearTimeout(takeTimerRef.current); meter.stop() }, [meter])

  const handleMicToggle = async () => {
    if (micState === 'off' || micState === 'error') {
      setMicState('calibrating')
      const ok = await meter.start()
      if (!ok) setMicState('error')
    } else {
      clearTimeout(takeTimerRef.current)
      setRecording(null)
      meter.stop()
      setMicState('off')
    }
  }

  // ── Nagrywanie jednej próby ─────────────────────────────────────────────────
  const finishTake = async (side, key) => {
    clearTimeout(takeTimerRef.current)
    const take = await meter.stopTake()
    setRecording(null)
    if (!take) return
    setTakes(prev => {
      const cur = prev[key] || { wrong: [], right: [] }
      return { ...prev, [key]: { ...cur, [side]: [...cur[side], { ...take, id: Date.now() }] } }
    })
  }

  const handleRecord = (side) => {
    if (recording === side) { finishTake(side, activeKey); return }
    if (recording || micState !== 'on') return
    if (!meter.startTake()) return
    setRecording(side)
    const key = activeKey
    takeTimerRef.current = setTimeout(() => {
      if (recordingRef.current === side) finishTake(side, key)
    }, TAKE_MAX_MS)
  }

  const removeTake = (side, id) => {
    setTakes(prev => {
      const cur = prev[activeKey] || { wrong: [], right: [] }
      const gone = cur[side].find(t => t.id === id)
      if (gone?.url) { try { URL.revokeObjectURL(gone.url) } catch (e) {} }
      return { ...prev, [activeKey]: { ...cur, [side]: cur[side].filter(t => t.id !== id) } }
    })
  }

  const playTake = (url) => { if (url) { try { new Audio(url).play() } catch (e) {} } }

  const addCustomPair = () => {
    const wrong = customWrong.trim().toLowerCase()
    const right = customRight.trim().toLowerCase()
    if (!wrong || !right) return
    const p = { wrong, right }
    if (!pairs.some(x => pairKey(x) === pairKey(p))) setPairs(prev => [...prev, p])
    setActiveKey(pairKey(p))
    setCustomWrong(''); setCustomRight('')
  }

  // ── Eksport wyników do wklejenia w rozmowie ─────────────────────────────────
  const buildReport = () => {
    const info = meter.getInfo()
    const lines = []
    lines.push('TEST SZ — wyniki')
    lines.push(`Data: ${new Date().toLocaleString('pl-PL')}`)
    lines.push(`Urządzenie: ${navigator.userAgent}`)
    lines.push(`Próbkowanie: ${info.sampleRate || '?'} Hz · tło: ${info.noiseDb ?? '?'} dB · pasmo od ${BAND_LO_HZ} Hz`)
    lines.push('')
    for (const p of pairs) {
      const t = takes[pairKey(p)]
      if (!t || (!t.wrong.length && !t.right.length)) continue
      const v = pairVerdict(t.wrong.map(x => x.value), t.right.map(x => x.value))
      lines.push(`PARA: ${p.wrong} (błędnie) / ${p.right} (poprawnie)`)
      for (const side of ['wrong', 'right']) {
        t[side].forEach((x, i) => {
          const segs = x.segments.map(s => `${s.cog}Hz/${s.durationMs}ms@${s.startMs}`).join(', ') || 'brak'
          lines.push(`  ${side === 'wrong' ? p.wrong : p.right} #${i + 1}: ${fmtHz(x.value)}  [odcinki: ${segs}]`)
        })
      }
      lines.push(`  OCENA: ${v.label}${v.diff != null ? ` · różnica średnich ${v.diff} Hz · odstęp ${v.gap} Hz` : ''}`)
      lines.push('')
    }
    return lines.join('\n')
  }

  const handleCopy = async () => {
    const text = buildReport()
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Skopiowano — wklej w rozmowie z Claude.')
    } catch (e) {
      setCopied(text) // awaryjnie pokazujemy tekst do ręcznego zaznaczenia
    }
  }

  const verdict = pairVerdict(activeTakes.wrong.map(t => t.value), activeTakes.right.map(t => t.value))
  const verdictColor = { good: '#16A34A', mid: '#D97706', bad: '#DC2626', none: '#64748B' }[verdict.level]
  const anyTakes = Object.values(takes).some(t => t.wrong.length || t.right.length)
  const micOn = micState === 'on'

  const TakeColumn = ({ side, word, color }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>
        {side === 'wrong' ? 'Błędnie' : 'Poprawnie'}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginBottom: 8 }}>{word}</div>
      <button
        className={`btn btn-full ${recording === side ? 'btn-red' : 'btn-primary'}`}
        disabled={!micOn || (recording && recording !== side)}
        style={{ opacity: !micOn || (recording && recording !== side) ? .45 : 1 }}
        onClick={() => handleRecord(side)}>
        {recording === side ? '■ Stop — mów teraz' : '● Nagraj'}
      </button>
      <div style={{ marginTop: 8 }}>
        {activeTakes[side].length === 0 && (
          <div className="text-muted" style={{ fontSize: 13 }}>Brak nagrań</div>
        )}
        {activeTakes[side].map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: '#94A3B8', width: 18 }}>{i + 1}.</span>
            <span style={{ flex: 1, fontWeight: 800, fontSize: 15, color: t.value == null ? '#DC2626' : 'var(--text)' }}>
              {fmtHz(t.value)}
            </span>
            {t.url && <button className="btn btn-ghost btn-sm" onClick={() => playTake(t.url)} aria-label="Odsłuchaj">▶</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => removeTake(side, t.id)} aria-label="Usuń">✕</button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>

      {/* ── Mikrofon + wykres na żywo ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button className={`btn ${micState === 'off' || micState === 'error' ? 'btn-primary' : 'btn-outline'}`} onClick={handleMicToggle}>
            {micState === 'off' || micState === 'error' ? 'Włącz mikrofon' : 'Wyłącz mikrofon'}
          </button>
          {micOn && <button className="btn btn-ghost btn-sm" onClick={() => meter.recalibrate()}>Zmierz tło ponownie</button>}
          <span ref={readoutRef} style={{ marginLeft: 'auto', fontWeight: 900, fontSize: 22, color: '#94A3B8' }}>—</span>
        </div>

        {micState === 'calibrating' && (
          <div style={{ fontWeight: 800, color: '#D97706', marginBottom: 8 }}>Cisza przez sekundę — mierzę tło pokoju…</div>
        )}
        {micState === 'error' && (
          <div style={{ fontWeight: 800, color: '#DC2626', marginBottom: 8 }}>
            Nie udało się otworzyć mikrofonu. Sprawdź zgodę przeglądarki na mikrofon.
          </div>
        )}

        <canvas ref={canvasRef} style={{ width: '100%', height: 170, borderRadius: 10, border: '1px solid var(--border)', display: 'block' }} />
        <div className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
          Powiedz długie „sssss”, potem „szszsz”. Kropki powinny pojawić się raz u góry, raz na dole.
          Cichy pokój, usta ok. 20–30 cm od mikrofonu, zawsze w podobnej odległości.
        </div>
      </div>

      {/* ── Wybór pary ── */}
      <div className="card">
        <span className="form-label">Para słów</span>
        <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 12 }}>
          {pairs.map(p => (
            <button key={pairKey(p)}
              className={`btn btn-sm ${pairKey(p) === activeKey ? 'btn-primary' : 'btn-ghost'}`}
              disabled={!!recording}
              onClick={() => setActiveKey(pairKey(p))}>
              {p.wrong} / {p.right}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="form-input mb-0" style={{ marginBottom: 0 }} placeholder="błędnie, np. safa"
            value={customWrong} onChange={e => setCustomWrong(e.target.value)} />
          <input className="form-input mb-0" style={{ marginBottom: 0 }} placeholder="poprawnie, np. szafa"
            value={customRight} onChange={e => setCustomRight(e.target.value)} />
          <button className="btn btn-outline btn-sm" onClick={addCustomPair}>Dodaj</button>
        </div>
      </div>

      {/* ── Nagrania pary ── */}
      <div className="card">
        {!micOn && <div className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>Włącz mikrofon, żeby nagrywać.</div>}
        <div style={{ display: 'flex', gap: 14 }}>
          <TakeColumn side="wrong" word={activePair.wrong} color={COLOR_S} />
          <TakeColumn side="right" word={activePair.right} color={COLOR_SZ} />
        </div>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>
          Nagraj każdą wersję 3 razy. Jedno słowo na nagranie; kończy się samo po 3 sekundach.
          Wersję błędną nagrywamy tylko tutaj, do pomiaru.
        </div>

        <div className="divider" />
        <div style={{ fontWeight: 900, fontSize: 17, color: verdictColor }}>{verdict.label}</div>
        {verdict.diff != null && (
          <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Różnica średnich: {verdict.diff} Hz · odstęp między najbliższymi nagraniami: {verdict.gap} Hz
          </div>
        )}
      </div>

      {/* ── Eksport ── */}
      <div className="card">
        <button className="btn btn-primary btn-full" disabled={!anyTakes} style={{ opacity: anyTakes ? 1 : .45 }} onClick={handleCopy}>
          Kopiuj wyniki
        </button>
        {copied && (
          copied.startsWith('Skopiowano')
            ? <div style={{ marginTop: 8, fontWeight: 800, color: '#16A34A' }}>{copied}</div>
            : <textarea className="form-input" style={{ marginTop: 8, height: 160, fontSize: 12 }} readOnly value={copied} />
        )}
        <div className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
          Wynik mówi tylko, czy dźwięki da się rozdzielić na tym urządzeniu. Nie ocenia poprawności wymowy —
          progi ustawimy później z nagrań zatwierdzonych przez logopedkę.
        </div>
      </div>
    </div>
  )
}

// Ekran ma trzy części (naraz działa jedna, bo wszystkie używają mikrofonu):
//  - Kalibracja: 1 minuta, długie "ssss" i "szszsz" → próg dla gier,
//  - Szybki test: podgląd pomiaru na żywo i porównanie par słów (nic nie zapisuje),
//  - Baza wzorców: trwałe nagrania słów oceniane przez logopedę → dokładniejszy próg.
// Główna ścieżka to kalibracja krok po kroku. Reszta to narzędzia dodatkowe, schowane pod „Zaawansowane”.
const ADVANCED = [
  { id: 'test', label: 'Podgląd na żywo', saves: 'Nic się nie zapisuje',
    what: 'Wykres pokazuje na bieżąco, jak mikrofon słyszy głoski: kropki u góry to „s”, na dole „sz”.',
    how: ['Kliknij „Włącz mikrofon”.', 'Powiedz długie „ssss”, potem „szszsz” i patrz, czy kropki zmieniają stronę.', 'Niżej możesz nagrać parę słów (np. socek / soczek) i porównać. To tylko sprawdzenie, wynik znika po wyjściu.'] },
  { id: 'base', label: 'Baza wzorców', saves: 'Zapisuje nagrania i dokładniejszy próg',
    what: 'Nagrania par słów (błędnie / poprawnie), które dorosły albo logopeda ocenia. Daje dokładniejszy próg niż kalibracja i ma przed nią pierwszeństwo.',
    how: ['Wybierz parę słów, np. socek / soczek.', 'Nagraj po kilka razy wersję błędną i poprawną.', 'Przy każdym nagraniu zaznacz, czy zabrzmiało tak, jak miało. Próg policzy się sam.'] },
  { id: 'words', label: 'Własne słowa', saves: 'Zapisuje listę słów i ich wzorce',
    what: 'Słowa, które aplikacja ma wyłapywać w „oknie starannej mowy” (np. szkoła, soczek).',
    how: ['Dopisz słowo do listy i kliknij „Dodaj”.', 'Kliknij „Nagraj brakujące”: aplikacja pokazuje słowa po kolei, a dziecko je mówi.', 'Na końcu „Zacznij test”, żeby sprawdzić, czy aplikacja je rozpoznaje.'] },
]

export default function SibilantTestScreen() {
  const [open, setOpen] = useState(false)
  const [tool, setTool] = useState(null)
  const cur = ADVANCED.find(t => t.id === tool)
  if (cur) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setTool(null)} data-back>← Wróć do kalibracji</button>
        <h2 className="section-title" style={{ marginTop: 8 }}>{cur.label}</h2>
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{cur.what}</div>
          <ol style={{ margin: '8px 0 0 18px', fontSize: 13, lineHeight: 1.6 }}>{cur.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginTop: 8 }}>{cur.saves}</div>
        </div>
        {tool === 'test' ? <QuickTest /> : tool === 'words' ? <WordBaseScreen /> : <PatternBaseScreen />}
      </div>
    )
  }
  return (
    <div>
      <h2 className="section-title">Mikrofon: głoski SZ</h2>
      <p className="section-sub">Żeby gry oceniały głoski, wystarczy przejść kroki poniżej. Reszta jest dodatkiem.</p>
      <QuickMicCalibration />
      <button className="btn btn-ghost btn-full" style={{ marginTop: 12 }} onClick={() => setOpen(o => !o)} data-advanced>
        {open ? 'Zaawansowane ▲' : 'Zaawansowane ▼'}
      </button>
      {open && ADVANCED.map(t => (
        <div key={t.id} className="card" style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{t.label}</div>
            <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{t.what}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginTop: 3 }}>{t.saves}</div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setTool(t.id)} data-tool={t.id}>Otwórz</button>
        </div>
      ))}
    </div>
  )
}
