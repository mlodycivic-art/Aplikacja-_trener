import { useEffect, useState } from 'react'

// Mapowanie % dopasowania rytmu → liczba przewróconych kręgli.
// 90-100% = strike (10), spadek co ~10pkt = 2 kręgle mniej, praktyczny brak
// mowy (poniżej progu szumu tła) = kula w ogóle nie trafia (miss).
function pinsForPct(pct) {
  if (pct >= 90) return 10
  if (pct >= 80) return 8
  if (pct >= 70) return 6
  if (pct >= 60) return 4
  if (pct >= 50) return 2
  if (pct >= 5)  return 1
  return 0
}

// 10 kręgli w klasycznym trójkącie — pojedynczy z tyłu (daleko), rząd 4 z przodu (blisko kuli).
const PIN_POSITIONS = [
  { x: 150, y: 30 },                                              // rząd 1 (tył)
  { x: 132, y: 58 }, { x: 168, y: 58 },                           // rząd 2
  { x: 114, y: 86 }, { x: 150, y: 86 }, { x: 186, y: 86 },        // rząd 3
  { x: 96, y: 114 }, { x: 132, y: 114 }, { x: 168, y: 114 }, { x: 204, y: 114 }, // rząd 4 (przód)
]
// Kolejność padania: od przodu/środka na zewnątrz i do tyłu — naturalny rozjazd po trafieniu.
const FALL_ORDER = [8, 7, 4, 9, 6, 1, 5, 2, 3, 0]

function Pin({ x, y, fallen }) {
  // Obrót wykonywany bezpośrednio atrybutem SVG transform (nie CSS) —
  // pivot podany jawnie jako (x, y+podstawa), więc zawsze poprawny niezależnie
  // od transform-box/transform-origin quirks przeglądarki.
  const pivotY = y + 22
  return (
    <g
      style={{ transition: 'transform 0.4s ease, opacity 0.4s ease' }}
      transform={fallen ? `rotate(80 ${x} ${pivotY})` : 'rotate(0)'}
      opacity={fallen ? 0.35 : 1}
    >
      {/* korpus kręgla */}
      <path
        d={`M ${x - 5} ${y + 22}
            C ${x - 6} ${y + 10}, ${x - 3} ${y + 6}, ${x} ${y}
            C ${x + 3} ${y + 6}, ${x + 6} ${y + 10}, ${x + 5} ${y + 22}
            Z`}
        fill="#fff" stroke="#B91C1C" strokeWidth="1.5"
      />
      {/* czerwony pasek */}
      <rect x={x - 5} y={y + 10} width="10" height="3.5" fill="#DC2626" />
    </g>
  )
}

export default function BowlingReward({ pct, onDone }) {
  const [phase, setPhase] = useState('rolling') // rolling | impact | result
  const pins = pinsForPct(pct)
  const isMiss = pins === 0
  const fallenSet = new Set(FALL_ORDER.slice(0, pins))

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('impact'), 1100)
    const t2 = setTimeout(() => setPhase('result'), 1700)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const ballCenterX = 150
  const ballX = isMiss ? 210 : ballCenterX
  const ballY = phase === 'rolling' ? 250 : (isMiss ? 95 : 140)

  return (
    <div style={{ textAlign: 'center' }}>
      <style>{`
        .stc-ball { transition: cx 1.0s cubic-bezier(.3,.6,.4,1), cy 1.0s cubic-bezier(.3,.6,.4,1); }
      `}</style>

      <svg viewBox="0 0 300 270" width="100%" height="240" style={{ maxWidth: 240 }}>
        <defs>
          <linearGradient id="stc-lane" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="#D9A066" />
            <stop offset="12%" stopColor="#E8B67C" />
            <stop offset="25%" stopColor="#D9A066" />
            <stop offset="50%" stopColor="#E8B67C" />
            <stop offset="75%" stopColor="#D9A066" />
            <stop offset="88%" stopColor="#E8B67C" />
            <stop offset="100%" stopColor="#D9A066" />
          </linearGradient>
        </defs>

        {/* tor */}
        <rect x="70" y="0" width="160" height="250" fill="url(#stc-lane)" stroke="#B9834A" strokeWidth="2" />
        {/* rynny po bokach */}
        <rect x="52" y="0" width="18" height="250" fill="#9CA3AF" />
        <rect x="230" y="0" width="18" height="250" fill="#9CA3AF" />

        {/* strzałki kierunkowe na torze */}
        {[0, 1, 2].map(i => (
          <polygon key={i}
            points={`150,${170 - i * 22} 142,${185 - i * 22} 158,${185 - i * 22}`}
            fill="#DC2626" opacity="0.55" />
        ))}

        {/* kręgle */}
        {PIN_POSITIONS.map((p, i) => (
          <Pin key={i} x={p.x} y={p.y} fallen={phase !== 'rolling' && fallenSet.has(i)} />
        ))}

        {/* kula */}
        <circle className="stc-ball" cx={ballX} cy={ballY} r="15" fill="#7C2D12" />
        <circle className="stc-ball" cx={ballX - 5} cy={ballY - 5} r="4" fill="#FCA5A5" opacity="0.6" />
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
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onDone}>Dalej</button>
        </div>
      )}
    </div>
  )
}
