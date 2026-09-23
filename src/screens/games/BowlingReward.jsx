import { useEffect, useState } from 'react'

// Mapowanie % dopasowania rytmu → liczba przewróconych kręgli.
// 90-100% = strike (10), spadek co ~10pkt = 2 kręgle mniej, praktyczny brak
// mowy (poniżej progu szumu tła) = kula w ogóle nie trafia (miss).
export function pinsForPct(pct) {
  if (pct >= 90) return 10
  if (pct >= 80) return 8
  if (pct >= 70) return 6
  if (pct >= 60) return 4
  if (pct >= 50) return 2
  if (pct >= 5)  return 1
  return 0
}

// 10 kręgli w trójkącie — najszerszy rząd (4) DALEKO od kuli (u góry toru),
// pojedynczy kręgiel (czubek trójkąta) NAJBLIŻEJ kuli (u dołu, tuż przy niej).
const PIN_POSITIONS = [
  { x: 96, y: 30 }, { x: 132, y: 30 }, { x: 168, y: 30 }, { x: 204, y: 30 }, // rząd 1 (daleko, 4 kręgle)
  { x: 114, y: 58 }, { x: 150, y: 58 }, { x: 186, y: 58 },                  // rząd 2 (3)
  { x: 132, y: 86 }, { x: 168, y: 86 },                                    // rząd 3 (2)
  { x: 150, y: 114 },                                                      // rząd 4 (blisko kuli, czubek)
]
// Kolejność padania: od czubka (najbliżej kuli) w głąb trójkąta na zewnątrz.
const FALL_ORDER = [9, 7, 8, 5, 4, 6, 1, 2, 0, 3]

function Pin({ x, y, fallen }) {
  const pivotY = y + 16
  return (
    <g style={{ transition: 'transform 0.4s ease, opacity 0.4s ease' }}
       transform={fallen ? `rotate(80 ${x} ${pivotY})` : 'rotate(0)'}
       opacity={fallen ? 0.25 : 1}>
      <ellipse cx={x} cy={y + 17} rx="8" ry="3" fill="#00000022" />
      <circle cx={x} cy={y} r="9" fill="#fff" stroke="#C4B5FD" strokeWidth="2" />
      <circle cx={x} cy={y} r="3.5" fill="#A78BFA" />
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
    const t1 = setTimeout(() => setPhase('impact'), 1100)
    const t2 = setTimeout(() => setPhase('result'), 1700)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const rolling = phase === 'rolling'
  let ballX, ballY
  if (isMiss) {
    ballX = rolling ? 150 : (missSide === 'left' ? 78 : 222)
    ballY = rolling ? 250 : 12
  } else {
    ballX = 150
    ballY = rolling ? 250 : 130
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <style>{`
        .stc-ball, .stc-ball-shadow { transition: cx 1.05s cubic-bezier(.35,.6,.4,1), cy 1.05s cubic-bezier(.35,.6,.4,1); }
      `}</style>

      <svg viewBox="0 0 300 270" width="100%" height="240" style={{ maxWidth: 240 }}>
        <defs>
          <linearGradient id="stc-lane" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="#D9A066" />
            <stop offset="10%" stopColor="#E8B67C" />
            <stop offset="22%" stopColor="#D9A066" />
            <stop offset="38%" stopColor="#E8B67C" />
            <stop offset="50%" stopColor="#D9A066" />
            <stop offset="62%" stopColor="#E8B67C" />
            <stop offset="78%" stopColor="#D9A066" />
            <stop offset="90%" stopColor="#E8B67C" />
            <stop offset="100%" stopColor="#D9A066" />
          </linearGradient>
        </defs>

        {/* tor / parkiet */}
        <rect x="70" y="0" width="160" height="250" fill="url(#stc-lane)" stroke="#B9834A" strokeWidth="2" />
        {/* poprzeczne linie deski parkietu */}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={i} x1="70" x2="230" y1={i * 32 + 10} y2={i * 32 + 10} stroke="#B9834A" strokeWidth="1" opacity="0.35" />
        ))}
        {/* rynny po bokach */}
        <rect x="52" y="0" width="18" height="250" fill="#9CA3AF" />
        <rect x="230" y="0" width="18" height="250" fill="#9CA3AF" />

        {/* strzałki kierunkowe na torze */}
        {[0, 1, 2].map(i => (
          <polygon key={i}
            points={`150,${175 - i * 22} 142,${190 - i * 22} 158,${190 - i * 22}`}
            fill="#DC2626" opacity="0.5" />
        ))}

        {/* kręgle */}
        {PIN_POSITIONS.map((p, i) => (
          <Pin key={i} x={p.x} y={p.y} fallen={phase !== 'rolling' && fallenSet.has(i)} />
        ))}

        {/* cień kuli */}
        <ellipse className="stc-ball-shadow" cx={ballX} cy={ballY + 12} rx="14" ry="4" fill="#00000030" />
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
