import { useEffect, useRef, useState } from 'react'
import { playGameSound } from '../../components/useAlarm'
import { addResult } from '../../data/resultsStore'

// Mapowanie % dopasowania rytmu → liczba przewróconych kręgli.
export function pinsForPct(pct) {
  if (pct >= 90) return 10
  if (pct >= 80) return 8
  if (pct >= 70) return 6
  if (pct >= 60) return 4
  if (pct >= 50) return 2
  if (pct >= 5)  return 1
  return 0
}

// Trójkąt kręgli — szeroki rząd (4) daleko od kuli (u góry), pojedynczy (czubek) blisko kuli.
const PIN_POSITIONS = [
  { x: 96, y: 34 }, { x: 132, y: 34 }, { x: 168, y: 34 }, { x: 204, y: 34 },
  { x: 114, y: 62 }, { x: 150, y: 62 }, { x: 186, y: 62 },
  { x: 132, y: 90 }, { x: 168, y: 90 },
  { x: 150, y: 118 },
]
// Kolejność upadania: od czubka (najbliżej kuli) do tylnego rzędu
const FALL_ORDER = [9, 7, 8, 5, 4, 6, 1, 2, 0, 3]

const LANE_H = 270
const VIEW_H = 290
const ROLL_MS   = 1150
const IMPACT_MS = 1150
const RESULT_MS = 1600
const DONE_MS   = 3300

// Deski toru — stały, spokojny wzór (liczony raz)
const PLANK_SHADES = ['#B9783F', '#C98B4F', '#D29A5E', '#BF8145']
const PLANKS = Array.from({ length: 8 }, (_, i) => ({ x: 70 + i * 20, shade: PLANK_SHADES[i % PLANK_SHADES.length] }))

function Pin({ x, y, fallen, order }) {
  // Każdy kręgiel pada w swoją stronę i z małym opóźnieniem — fala od czubka do tyłu
  const dir   = x < 150 ? -1 : x > 150 ? 1 : (order % 2 ? 1 : -1)
  const angle = dir * (70 + (order * 13) % 35)
  const dx    = dir * (6 + (order * 7) % 12)
  const dy    = -(8 + (order * 5) % 10)
  return (
    <g style={{
      transformBox: 'fill-box', transformOrigin: '50% 80%',
      transition: `transform .45s cubic-bezier(.2,.8,.3,1) ${order * 45}ms, opacity .45s ease ${order * 45}ms`,
      transform: fallen ? `translate(${dx}px, ${dy}px) rotate(${angle}deg)` : 'none',
      opacity: fallen ? 0.28 : 1,
    }}>
      <ellipse cx={x} cy={y + 12} rx="9" ry="3.5" fill="#00000033" />
      <circle cx={x} cy={y} r="10" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
      <circle cx={x} cy={y} r="6.2" fill="none" stroke="#DC2626" strokeWidth="2.4" />
      <circle cx={x - 3} cy={y - 3.5} r="1.8" fill="#fff" />
    </g>
  )
}

// history: wyniki wcześniejszych rzutów w tej sesji (w % rytmu) — do tabliczki wyników
export default function BowlingReward({ pct, onDone, history = [] }) {
  const [phase, setPhase] = useState('ready') // ready | rolling | impact | result
  const [missSide] = useState(() => (Math.random() < 0.5 ? 'left' : 'right'))
  const loggedRef = useRef(false)
  const pins = pinsForPct(pct)
  const isMiss = pins === 0
  const isStrike = pins === 10
  const fallenSet = new Set(FALL_ORDER.slice(0, pins))

  useEffect(() => {
    const t0 = setTimeout(() => { setPhase('rolling'); playGameSound('roll') }, 60)
    const t1 = setTimeout(() => {
      setPhase('impact')
      playGameSound(isMiss ? 'gutter' : 'crash', pins / 10)
    }, 60 + IMPACT_MS)
    const t2 = setTimeout(() => setPhase('result'), 60 + RESULT_MS)
    const t3 = setTimeout(() => onDone(), 60 + DONE_MS) // auto-przejście dalej, bez pytania
    // Jeden zapis na rzut (w trybie deweloperskim React uruchamia efekt dwa razy)
    if (!loggedRef.current) { loggedRef.current = true; addResult('bowling_throw', { pct: Math.round(pct), pins }) }
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Kula: start na dole toru; przy pudle zjeżdża do rynny, przy trafieniu jedzie w czubek trójkąta
  const rolling = phase !== 'ready'
  const targetX = isMiss ? (missSide === 'left' ? 61 : 239) : 150
  const targetY = isMiss ? 60 : 128
  const ballStyle = {
    transition: `transform ${ROLL_MS}ms cubic-bezier(.45,.05,.75,.5)`,
    transform: rolling
      ? `translate(${targetX - 150}px, ${targetY - 262}px) scale(.82)`
      : 'translate(0px, 0px) scale(1)',
    transformBox: 'fill-box', transformOrigin: 'center',
    opacity: phase === 'result' && !isMiss ? 0 : 1,
  }

  const allThrows = [...history.map(p => pinsForPct(p))]
  const total = allThrows.reduce((s, v) => s + v, 0)

  return (
    <div style={{ textAlign: 'center' }}>
      <style>{`
        @keyframes stcBallSpin { to { transform: rotate(360deg) } }
        @keyframes stcShake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-3px) } 75% { transform: translateX(3px) } }
        @keyframes stcPop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
      `}</style>

      <svg viewBox={`0 0 300 ${VIEW_H}`} width="100%" height="270"
        style={{ maxWidth: 250, animation: phase === 'impact' && !isMiss ? 'stcShake .25s linear 2' : 'none' }}>
        {/* tor */}
        <rect x="70" y="0" width="160" height={LANE_H} fill="#C98B4F" />
        {PLANKS.map((p, i) => <rect key={i} x={p.x} y="0" width="20" height={LANE_H} fill={p.shade} />)}
        {PLANKS.map((p, i) => <line key={`l${i}`} x1={p.x} y1="0" x2={p.x} y2={LANE_H} stroke="#00000018" strokeWidth="1" />)}
        <rect x="70" y="0" width="160" height="150" fill="#00000010" />
        {/* rynny */}
        <rect x="52" y="0" width="18" height={LANE_H} fill="#334155" />
        <rect x="230" y="0" width="18" height={LANE_H} fill="#334155" />
        {/* znaczniki celowania */}
        {[-2, -1, 0, 1, 2].map(i => (
          <polygon key={i}
            points={`${150 + i * 26},${196 + Math.abs(i) * 10} ${145 + i * 26},${208 + Math.abs(i) * 10} ${155 + i * 26},${208 + Math.abs(i) * 10}`}
            fill="#7C2D12" opacity="0.55" />
        ))}

        {PIN_POSITIONS.map((p, i) => (
          <Pin key={i} x={p.x} y={p.y} order={FALL_ORDER.indexOf(i)}
            fallen={(phase === 'impact' || phase === 'result') && fallenSet.has(i)} />
        ))}

        {/* kula */}
        <g style={ballStyle}>
          <ellipse cx="150" cy="276" rx="15" ry="4.5" fill="#00000040" />
          <circle cx="150" cy="262" r="16" fill="#1E3A8A" />
          <circle cx="144" cy="255" r="5" fill="#93C5FD" opacity=".55" />
          <g style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: phase === 'rolling' ? 'stcBallSpin .5s linear infinite' : 'none' }}>
            <circle cx="150" cy="262" r="16" fill="none" />
            <circle cx="153" cy="256" r="2.1" fill="#0B1B4D" />
            <circle cx="158" cy="262" r="2.1" fill="#0B1B4D" />
            <circle cx="151" cy="265" r="2.1" fill="#0B1B4D" />
          </g>
        </g>
      </svg>

      <div style={{ minHeight: 58, marginTop: 6 }}>
        {phase === 'result' && (
          <div style={{ animation: 'stcPop .35s ease-out' }}>
            {isMiss ? (
              <p style={{ fontWeight: 800, fontSize: 18, color: 'var(--muted)' }}>Kula w rynnie. Następne zdanie wolniej i równo.</p>
            ) : isStrike ? (
              <p style={{ fontWeight: 800, fontSize: 26, color: 'var(--primary)', letterSpacing: 1 }}>STRIKE!</p>
            ) : (
              <p style={{ fontWeight: 800, fontSize: 20 }}>{pins} / 10 kręgli</p>
            )}
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Dopasowanie rytmu: {Math.round(pct)}%</p>
          </div>
        )}
      </div>

      {/* Tabliczka wyników sesji */}
      {allThrows.length > 0 && (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          {allThrows.map((v, i) => (
            <span key={i} style={{
              minWidth: 28, padding: '4px 0', borderRadius: 7, fontSize: 13, fontWeight: 800,
              fontFamily: "'Space Mono', monospace",
              background: v === 10 ? 'var(--primary)' : '#EEF0F3', color: v === 10 ? '#fff' : 'var(--text)',
              outline: i === allThrows.length - 1 ? '2px solid var(--primary)' : 'none',
            }}>{v === 10 ? 'X' : v}</span>
          ))}
          <span style={{ padding: '4px 10px', borderRadius: 7, fontSize: 13, fontWeight: 800, background: 'var(--ink)', color: '#fff' }}>
            {total}/{allThrows.length * 10}
          </span>
        </div>
      )}
    </div>
  )
}
