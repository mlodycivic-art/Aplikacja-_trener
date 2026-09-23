import { useEffect, useState } from 'react'

// Mapowanie % dopasowania rytmu → liczba przewróconych kręgli.
// Zasada ustalona wcześniej: 90-100% = strike (10), spadek co ~10pkt = 2 kręgle mniej,
// całkowity brak mowy = kula w ogóle nie trafia w kręgle (miss).
function pinsForPct(pct) {
  if (pct >= 90) return 10
  if (pct >= 80) return 8
  if (pct >= 70) return 6
  if (pct >= 60) return 4
  if (pct >= 50) return 2
  if (pct > 0)   return 1
  return 0
}

// 10 kręgli w klasycznym trójkącie (rząd 1,2,3,4 od tyłu do przodu).
// Kolejność "które padają pierwsze" — od środka/przodu na zewnątrz, jak przy dobrym rzucie.
const PIN_POSITIONS = [
  { x: 150, y: 40 },                                   // rząd 1 (tył)
  { x: 135, y: 65 }, { x: 165, y: 65 },                 // rząd 2
  { x: 120, y: 90 }, { x: 150, y: 90 }, { x: 180, y: 90 }, // rząd 3
  { x: 105, y: 115 }, { x: 135, y: 115 }, { x: 165, y: 115 }, { x: 195, y: 115 }, // rząd 4 (przód)
]
// Kolejność padania: najpierw przednie/środkowe, na końcu boczne z tyłu
const FALL_ORDER = [9, 6, 3, 0, 8, 7, 4, 1, 5, 2].reverse()

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

  const ballX = isMiss ? 235 : 150
  const ballY = phase === 'rolling' ? 260 : (isMiss ? 100 : 130)

  return (
    <div style={{ textAlign: 'center' }}>
      <style>{`
        @keyframes ballRoll { from { transform: translateY(0); } to { transform: translateY(0); } }
        .pin { transition: opacity 0.25s ease, transform 0.35s ease; transform-origin: center bottom; }
        .pin.fallen { opacity: 0.15; transform: rotate(75deg) translateY(6px); }
        .ball { transition: cx 1.0s cubic-bezier(.3,.6,.4,1), cy 1.0s cubic-bezier(.3,.6,.4,1); }
      `}</style>

      <svg viewBox="0 0 300 300" width="100%" height="260" style={{ maxWidth: 280 }}>
        {/* tor */}
        <rect x="70" y="0" width="160" height="280" fill="var(--surface-2, #F3F4F6)" stroke="var(--border, #E5E7EB)" strokeWidth="2" />
        {/* rynny po bokach */}
        <rect x="55" y="0" width="15" height="280" fill="#D1D5DB" />
        <rect x="230" y="0" width="15" height="280" fill="#D1D5DB" />

        {/* kręgle */}
        {PIN_POSITIONS.map((p, i) => (
          <g key={i} className={`pin ${phase !== 'rolling' && fallenSet.has(i) ? 'fallen' : ''}`}>
            <rect x={p.x - 5} y={p.y} width="10" height="20" rx="4" fill="#fff" stroke="#DC2626" strokeWidth="2" />
          </g>
        ))}

        {/* kula */}
        <circle className="ball" cx={ballX} cy={ballY} r="14" fill="#1E3A8A" />
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
