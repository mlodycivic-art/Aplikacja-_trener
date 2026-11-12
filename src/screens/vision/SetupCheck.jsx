// Ekran "Kontrola stanowiska" — pokazywany przed kalibracją i przed każdą grą z kamerą.
// Kilka lampek (twarz, odległość, głowa, wysokość telefonu, światło, stabilność). Gdy wszystkie są
// zielone przez chwilę, wywołuje onReady(warunki). Przy czerwonej mówi, co poprawić.
//
// Tu — i tylko tu — ćwiczący widzi mały podgląd z kamery, bo bez niego nie da się ustawić kadru.
// W samych grach obrazu twarzy nie ma.

import { useEffect, useRef, useState } from 'react'
import { measureFace, measureLight, jitterOf, evaluateSetup, summarizeConditions, getSetupMode, TOLERANCES } from '../../data/setupCheck'
import { isSimMode } from './useMouthControl'

const HOLD_OK_MS = 1200        // tyle wszystkie lampki muszą być zielone
const LW = 64, LH = 48         // rozdzielczość pomiaru światła

// face: silnik kamery (useFaceEngine) już uruchomiony; mode: 'strict' | 'normal' | 'relaxed';
// reference: warunki z kalibracji (albo null); onSkip: tylko gdy dorosły dopuścił pominięcie.
export default function SetupCheck({ face, mode = getSetupMode(), reference = null, onReady, onSkip = null, title = 'Ustaw się do ćwiczenia' }) {
  const [checks, setChecks] = useState([])
  const [okFor, setOkFor] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [sensorAsked, setSensorAsked] = useState(false)
  const previewRef = useRef(null)
  const st = useRef({ hist: [], samples: [], lights: [], okSince: 0, device: null, done: false, light: null, lightAt: 0 })
  const lightCanvas = useRef(null)
  const sim = useRef(isSimMode()).current

  // czujnik położenia urządzenia (telefon/tablet); na komputerze po prostu nie przyjdzie żadne zdarzenie
  useEffect(() => {
    const onOrient = (e) => { if (typeof e.beta === 'number') st.current.device = { beta: e.beta, gamma: e.gamma } }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [])

  useEffect(() => {
    if (mode === 'off' || sim) { onReady(null); return }
    if (!lightCanvas.current) { const c = document.createElement('canvas'); c.width = LW; c.height = LH; lightCanvas.current = c }
    const id = setInterval(() => {
      const s = st.current
      if (s.done) return
      const now = performance.now()
      const video = face.getVideo()
      const pv = previewRef.current
      if (pv && video && video.videoWidth) {
        const g = pv.getContext('2d')
        g.save(); g.scale(-1, 1); g.drawImage(video, -pv.width, 0, pv.width, pv.height); g.restore()
      }
      const points = face.getPoints()
      const m = points && face.msSinceFace() < 800 ? measureFace(points, face.getCanvasSize()) : null
      if (m) {
        s.hist.push({ nx: m.nx, ny: m.ny, t: now })
        while (s.hist.length && now - s.hist[0].t > 1000) s.hist.shift()
        if (now - s.lightAt > 300 && video && video.videoWidth) {       // światło liczymy rzadziej — to kosztuje
          s.lightAt = now
          const g = lightCanvas.current.getContext('2d', { willReadFrequently: true })
          g.drawImage(video, 0, 0, LW, LH)
          s.light = measureLight(g, LW, LH, m.box)
        }
      } else s.hist = []
      const list = evaluateSetup(m, s.light, s.device, jitterOf(s.hist), mode, reference)
      setChecks(list)
      const allOk = list.length > 1 && list.every(c => c.ok)
      if (allOk) {
        if (!s.okSince) { s.okSince = now; s.samples = []; s.lights = [] }
        s.samples.push(m); if (s.light) s.lights.push(s.light)
        setOkFor(Math.min(1, (now - s.okSince) / HOLD_OK_MS))
        if (now - s.okSince >= HOLD_OK_MS) { s.done = true; onReady(summarizeConditions(s.samples, s.lights)) }
      } else { s.okSince = 0; setOkFor(0) }
    }, 90)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face, mode, sim])

  // iPhone / iPad: czujnik położenia wymaga zgody udzielonej po stuknięciu w przycisk
  const needsSensorPermission = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'
  const askSensor = async () => { setSensorAsked(true); try { await DeviceOrientationEvent.requestPermission() } catch (e) {} }

  if (mode === 'off' || sim) return null
  const firstBad = checks.find(c => !c.ok)

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(v => !v)}>{showHelp ? 'Ukryj' : 'Jak usiąść?'}</button>
      </div>
      {showHelp && <SetupDiagram />}

      <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <canvas ref={previewRef} width={150} height={200} style={{ width: 108, height: 144, borderRadius: 12, background: 'var(--soft)', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: '14% 18%', border: `3px dashed ${firstBad ? 'var(--orange)' : 'var(--green)'}`, borderRadius: '50%', pointerEvents: 'none' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {checks.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, flexShrink: 0, background: c.ok ? 'var(--green)' : 'var(--red)',
                boxShadow: c.ok ? '0 0 8px var(--green)' : 'none' }} />
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{c.label}</span>
              {c.value && <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{c.value}</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ minHeight: 44, marginTop: 10, fontWeight: 800, fontSize: 16, color: firstBad ? 'var(--orange)' : 'var(--green)' }}>
        {firstBad ? firstBad.hint : 'Dobrze. Zostań tak przez chwilę…'}
      </div>
      <div className="progress-wrap dark"><div className="progress-fill" style={{ width: `${okFor * 100}%`, background: 'var(--green)', transition: 'width .1s linear' }} /></div>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
        Kontrola: {TOLERANCES[mode]?.label || mode}{reference ? ' · porównuję z warunkami z kalibracji' : ''}. Podgląd widać tylko na tym ekranie.
      </div>
      {needsSensorPermission && !sensorAsked && (
        <button className="btn btn-outline btn-full mt-8" onClick={askSensor}>Włącz czujnik położenia telefonu</button>
      )}
      {onSkip && <button className="btn btn-ghost btn-full mt-8" onClick={onSkip}>Pomiń kontrolę (wynik będzie oznaczony)</button>}
    </div>
  )
}

// Rysunek zalecanego stanowiska (widok z boku)
export function SetupDiagram() {
  return (
    <div style={{ marginTop: 10 }}>
      <svg viewBox="0 0 320 170" width="100%" style={{ maxWidth: 420, display: 'block', margin: '0 auto' }} aria-label="Zalecane stanowisko">
        <defs>
          <linearGradient id="sdDesk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D6A56A" /><stop offset="1" stopColor="#8B5E34" /></linearGradient>
          <radialGradient id="sdLamp" cx=".5" cy="0" r="1"><stop offset="0" stopColor="#FDE68A" stopOpacity=".9" /><stop offset="1" stopColor="#FDE68A" stopOpacity="0" /></radialGradient>
        </defs>
        <rect x="0" y="150" width="320" height="6" fill="var(--border)" />
        <path d="M250 18 L210 110 L300 110 Z" fill="url(#sdLamp)" />
        <rect x="150" y="96" width="150" height="9" rx="3" fill="url(#sdDesk)" /><rect x="286" y="105" width="7" height="45" fill="#8B5E34" /><rect x="158" y="105" width="7" height="45" fill="#8B5E34" />
        <rect x="222" y="60" width="6" height="36" fill="var(--muted)" /><rect x="208" y="92" width="34" height="5" rx="2" fill="var(--muted)" />
        <rect x="212" y="28" width="26" height="42" rx="4" fill="var(--ink)" stroke="var(--primary)" strokeWidth="2" /><circle cx="225" cy="33" r="1.8" fill="var(--primary)" />
        <circle cx="96" cy="46" r="17" fill="var(--soft)" stroke="var(--text)" strokeWidth="2.5" />
        <path d="M96 63 L96 112 L140 112 L140 150 M96 78 L128 92" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M76 70 L76 118 L132 118 M80 118 L80 150 M128 118 L128 150" fill="none" stroke="var(--muted)" strokeWidth="4" strokeLinecap="round" />
        <path d="M118 46 L206 46" stroke="var(--primary)" strokeWidth="2" strokeDasharray="5 4" />
        <text x="162" y="40" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--primary)">40–50 cm</text>
        <text x="258" y="14" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--muted)">światło z przodu</text>
      </svg>
      <div className="text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
        Krzesło przy biurku, stopy na podłodze, plecy podparte. Telefon lub tablet pionowo na statywie,
        kamera na wysokości twarzy, 40–50 cm od niej. Okno albo lampa przed twarzą, nigdy za plecami.
      </div>
    </div>
  )
}
