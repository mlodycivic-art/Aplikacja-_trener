import { useEffect, useState } from 'react'

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
  { x: 96, y: 30 }, { x: 132, y: 30 }, { x: 168, y: 30 }, { x: 204, y: 30 },
  { x: 114, y: 58 }, { x: 150, y: 58 }, { x: 186, y: 58 },
  { x: 132, y: 86 }, { x: 168, y: 86 },
  { x: 150, y: 114 },
]
const FALL_ORDER = [9, 7, 8, 5, 4, 6, 1, 2, 0, 3]

// Deski parkietu — różne odcienie i szerokości, żeby nie wyglądało na regularny wzór.
const PLANK_SHADES = ['#C98B4F', '#D9A066', '#E8B67C', '#CE9358', '#DFAE72', '#C68849']
function makePlanks(laneHeight) {
  const planks = []
  const rowH = 15
  let y = 0
  let row = 0
  while (y < laneHeight) {
    const offset = (row % 2) * 20
    let x = 70 - offset
    let col = 0
    while (x < 230) {
      const w = 26 + ((row + col) % 3) * 6
      const shade = PLANK_SHADES[(row * 3 + col) % PLANK_SHADES.length]
      planks.push({ x: Math.max(70, x), y, w: Math.min(w, 230 - Math.max(70, x)), h: rowH, shade })
      x += w
      col++
    }
    y += rowH
    row++
  }
  return planks
}

function Pin({ x, y, fallen }) {
  const pivotY = y + 16
  return (
    <g style={{ transition: 'transform 0.4s ease, opacity 0.4s ease' }}
       transform={fallen ? `rotate(80 ${x} ${pivotY})` : 'rotate(0)'}
       opacity={fallen ? 0.22 : 1}>
      <ellipse cx={x} cy={y + 17} rx="8" ry="3" fill="#00000030" />
      <circle cx={x} cy={y} r="9" fill="#fff" stroke="#C4B5FD" strokeWidth="2" />
      <circle cx={x} cy={y} r="3.5" fill="#A78BFA" />
      <circle cx={x - 2.5} cy={y - 3} r="1.6" fill="#fff" opacity="0.9" />
    </g>
  )
}

export default function BowlingReward({ pct, onDone }) {
  const [phase, setPhase] = useState('rolling') // rolling | impact | result
  const [missSide] = useState(() => (Math.random() < 0.5 ? 'left' : 'right'))
  const pins = pinsForPct(pct)
  const isMiss = pins === 0
  const fallenSet = new Set(FALL_ORDER.slice(0, pins))

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('impact'), 1200)
    const t2 = setTimeout(() => setPhase('result'), 1750)
    const t3 = setTimeout(() => onDone(), 3200) // auto-przejście dalej, bez pytania
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  // Tor ma stały rozmiar (bez zmiany rozmiaru w trakcie rzutu — poprzednia wersja z tym się psuła)
  const laneH = 250
  const viewH = 270

  let ballX, ballY
  if (phase === 'rolling') {
    ballX = 150; ballY = 240
  } else if (isMiss) {
    ballX = missSide === 'left' ? 66 : 234
    ballY = 140
  } else {
    ballX = 150
    ballY = 140
  }

  const planks = makePlanks(laneH)

  return (
    <div style={{ textAlign: 'center' }}>
      <style>{`
        .stc-ball, .stc-ball-shadow {
          transition: cx 1.15s cubic-bezier(.6,.02,.85,.35), cy 1.15s cubic-bezier(.6,.02,.85,.35);
        }
      `}</style>

      <svg viewBox={`0 0 300 ${viewH}`} width="100%" height="240" style={{ maxWidth: 220, transition: 'height 0.3s' }}>
        <rect x="70" y="0" width="160" height={laneH} fill="#D9A066" stroke="#A9713C" strokeWidth="2" />
        {planks.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.shade}
            stroke="#00000014" strokeWidth="0.6" />
        ))}
        {/* połysk wzdłuż toru */}
        <rect x="80" y="0" width="18" height={laneH} fill="#fff" opacity="0.08" />

        {/* rynny po bokach */}
        <rect x="52" y="0" width="18" height={laneH} fill="#9CA3AF" />
        <rect x="230" y="0" width="18" height={laneH} fill="#9CA3AF" />

        {/* strzałki kierunkowe */}
        {[0, 1, 2].map(i => (
          <polygon key={i}
            points={`150,${175 - i * 22} 142,${190 - i * 22} 158,${190 - i * 22}`}
            fill="#DC2626" opacity="0.5" />
        ))}

        {PIN_POSITIONS.map((p, i) => (
          <Pin key={i} x={p.x} y={p.y} fallen={phase === 'result' && fallenSet.has(i)} />
        ))}

        <ellipse className="stc-ball-shadow" cx={ballX} cy={ballY + 13} rx="14" ry="4" fill="#00000035" />
        <circle className="stc-ball" cx={ballX} cy={ballY} r="15" fill="#7C2D12" />
        <circle className="stc-ball" cx={ballX - 5} cy={ballY - 6} r="4.5" fill="#FCA5A5" opacity="0.7" />
      </svg>

      {phase === 'result' && (
        <div style={{ marginTop: 8 }}>
          {isMiss ? (
            <p style={{ fontWeight: 800, fontSize: 18, color: 'var(--muted)' }}>Kula w rynnie — spróbuj jeszcze raz!</p>
          ) : pins === 10 ? (
            <p style={{ fontWeight: 800, fontSize: 20, color: 'var(--primary)' }}>🎉 STRIKE! Wszystkie kręgle!</p>
          ) : (
            <p style={{ fontWeight: 800, fontSize: 18 }}>Przewrócono {pins}/10 kręgli</p>
          )}
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Dopasowanie rytmu: {Math.round(pct)}%</p>
        </div>
      )}
    </div>
  )
}
