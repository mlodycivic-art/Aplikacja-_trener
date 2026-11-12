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
      <ellipse cx={x + 3} cy={y + 9} rx="11" ry="6" fill="#000" opacity=".38" filter="url(#bwSoft)" />
      <circle cx={x} cy={y} r="10.5" fill="url(#bwPin)" stroke="#94A3B8" strokeWidth=".8" />
      <circle cx={x} cy={y} r="6.2" fill="none" stroke="url(#bwRing)" strokeWidth="2.6" />
      <circle cx={x} cy={y} r="2.6" fill="url(#bwPin)" />
      <ellipse cx={x - 3.2} cy={y - 3.8} rx="2.6" ry="1.6" fill="#fff" opacity=".9" transform={`rotate(-35 ${x - 3.2} ${y - 3.8})`} />
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
        <defs>
          <linearGradient id="bwLane" x1="0" x2="1"><stop offset="0" stopColor="#A9662E" /><stop offset=".5" stopColor="#E0A566" /><stop offset="1" stopColor="#A9662E" /></linearGradient>
          <linearGradient id="bwGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity=".28" /><stop offset=".3" stopColor="#000" stopOpacity="0" /><stop offset=".62" stopColor="#fff" stopOpacity=".2" /><stop offset=".75" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></linearGradient>
          <linearGradient id="bwGutter" x1="0" x2="1"><stop offset="0" stopColor="#0F172A" /><stop offset=".5" stopColor="#475569" /><stop offset="1" stopColor="#0F172A" /></linearGradient>
          <radialGradient id="bwPin" cx=".35" cy=".3" r=".9"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".6" stopColor="#E2E8F0" /><stop offset="1" stopColor="#94A3B8" /></radialGradient>
          <linearGradient id="bwRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F87171" /><stop offset="1" stopColor="#991B1B" /></linearGradient>
          <radialGradient id="bwBall" cx=".34" cy=".28" r=".95"><stop offset="0" stopColor="#FCA5A5" /><stop offset=".3" stopColor="#DC2626" /><stop offset=".8" stopColor="#7F1D1D" /><stop offset="1" stopColor="#450A0A" /></radialGradient>
          <filter id="bwSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" /></filter>
        </defs>
        {/* tor: deski, światło od góry i pas połysku */}
        <rect x="70" y="0" width="160" height={LANE_H} fill="url(#bwLane)" />
        {PLANKS.map((p, i) => <rect key={i} x={p.x} y="0" width="20" height={LANE_H} fill={p.shade} opacity=".38" />)}
        {PLANKS.map((p, i) => <line key={`l${i}`} x1={p.x} y1="0" x2={p.x} y2={LANE_H} stroke="#00000022" strokeWidth="1" />)}
        <rect x="70" y="0" width="160" height={LANE_H} fill="url(#bwGloss)" />
        {/* rynny */}
        <rect x="52" y="0" width="18" height={LANE_H} fill="url(#bwGutter)" />
        <rect x="230" y="0" width="18" height={LANE_H} fill="url(#bwGutter)" />
        {/* znaczniki celowania */}
        {[-2, -1, 0, 1, 2].map(i => (
          <polygon key={i}
            points={`${150 + i * 26},${196 + Math.abs(i) * 10} ${145 + i * 26},${208 + Math.abs(i) * 10} ${155 + i * 26},${208 + Math.abs(i) * 10}`}
            fill="#B91C1C" opacity="0.8" />
        ))}

        {PIN_POSITIONS.map((p, i) => (
          <Pin key={i} x={p.x} y={p.y} order={FALL_ORDER.indexOf(i)}
            fallen={(phase === 'impact' || phase === 'result') && fallenSet.has(i)} />
        ))}

        {/* kula */}
        <g style={ballStyle}>
          <ellipse cx="154" cy="272" rx="16" ry="9" fill="#000" opacity=".45" filter="url(#bwSoft)" />
          <circle cx="150" cy="262" r="16" fill="url(#bwBall)" />
          <g style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: phase === 'rolling' ? 'stcBallSpin .5s linear infinite' : 'none' }}>
            <circle cx="150" cy="262" r="16" fill="none" />
            <circle cx="153" cy="256" r="2.2" fill="#2A0606" />
            <circle cx="158" cy="262" r="2.2" fill="#2A0606" />
            <circle cx="151" cy="265" r="2.2" fill="#2A0606" />
          </g>
          <ellipse cx="143.5" cy="254" rx="5.5" ry="3.2" fill="#fff" opacity=".65" transform="rotate(-35 143.5 254)" />
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
