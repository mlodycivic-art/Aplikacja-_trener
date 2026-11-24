// Miarka otwarcia buzi na żywo: podgląd z kamery, dwie kropki (podstawa nosa, broda), linia między nimi
// i odczyt w procentach własnej skali (+ przybliżone milimetry).
//
//   <JawGauge />               — sam podgląd (np. przy ćwiczeniu „Winda”); na razie niczego nie zalicza
//   <JawGauge calibrate />     — to samo + dwa kroki kalibracji: buzia zamknięta, buzia szeroko otwarta
//
// Obraz z kamery nigdzie nie jest wysyłany ani zapisywany; zapisują się tylko dwie liczby zakresu.

import { useEffect, useRef, useState } from 'react'
import { useFaceEngine } from './useFaceEngine'
import { measureJaw, getJawRange, saveJawRangePartial, clearJawRange, jawRangeOk, jawPercent, jawTilted } from '../../data/jawGauge'

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
const pctl = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null }

export default function JawGauge({ calibrate = false, target = null }) {
  const face = useFaceEngine()
  const canvasRef = useRef(null)
  const [on, setOn] = useState(false)
  const [state, setState] = useState('off')          // off | loading | on | error
  const [read, setRead] = useState(null)             // { pct, mm, ratio, tilted, visible }
  const [range, setRange] = useState(getJawRange())
  const [cap, setCap] = useState(null)               // { kind: 'closed'|'open', until, samples: [] }
  const [msg, setMsg] = useState('')
  const rangeRef = useRef(range); rangeRef.current = range
  const capRef = useRef(null); capRef.current = cap
  const smooth = useRef(null)

  useEffect(() => () => face.stop(), [face])

  const toggle = async () => {
    if (on) { face.stop(); setOn(false); setState('off'); setRead(null); return }
    setOn(true); setState('loading'); setMsg('')
    const ok = await face.start()
    setState(ok ? 'on' : 'error')
    if (!ok) { setOn(false); setMsg(face.getError() || 'Nie udało się włączyć kamery.') }
  }

  // rysowanie podglądu i pomiar
  useEffect(() => {
    if (state !== 'on') return
    let raf = 0, last = 0
    const draw = (ts) => {
      raf = requestAnimationFrame(draw)
      const cv = canvasRef.current, video = face.getVideo()
      if (!cv || !video || !video.videoWidth) return
      const W = video.videoWidth, H = video.videoHeight
      if (cv.width !== W) { cv.width = W; cv.height = H }
      const ctx = cv.getContext('2d')
      // lustro, żeby ruch w lewo był w lewo
      ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, W, H); ctx.restore()
      const m = measureJaw(face.getPoints(), { width: W, height: H })
      if (m) {
        const R = rangeRef.current
        const tilted = jawTilted(m, R)
        smooth.current = smooth.current == null ? m.ratio : smooth.current + (m.ratio - smooth.current) * 0.35
        const pct = jawPercent({ ...m, ratio: smooth.current }, R)
        const nx = W - m.nose[0], cx = W - m.chin[0]
        const col = tilted ? '#F59E0B' : '#22C55E'
        ctx.lineWidth = Math.max(3, W / 160); ctx.strokeStyle = col; ctx.fillStyle = col
        ctx.beginPath(); ctx.moveTo(nx, m.nose[1]); ctx.lineTo(cx, m.chin[1]); ctx.stroke()
        for (const [x, y] of [[nx, m.nose[1]], [cx, m.chin[1]]]) {
          ctx.beginPath(); ctx.arc(x, y, Math.max(6, W / 70), 0, Math.PI * 2); ctx.fill()
          ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, W / 160)
        }
        const c = capRef.current
        if (c && !tilted) c.samples.push({ ratio: m.ratio, mm: m.mm, tilt: m.tilt })
        if (ts - last > 120) { last = ts; setRead({ pct, mm: m.mm, ratio: smooth.current, tilted, visible: true }) }
      } else if (ts - last > 250) { last = ts; smooth.current = null; setRead({ visible: false }) }
      // koniec zbierania próbek kalibracji
      const c = capRef.current
      if (c && performance.now() >= c.until) finishCapture(c)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, face])

  const capture = (kind) => { setMsg(''); setCap({ kind, until: performance.now() + 2500, samples: [] }) }

  const finishCapture = (c) => {
    setCap(null)
    if (c.samples.length < 12) { setMsg('Za mało pomiarów (twarz niewidoczna albo głowa pochylona). Spróbuj jeszcze raz.'); return }
    const ratios = c.samples.map(s => s.ratio), mms = c.samples.map(s => s.mm).filter(v => v)
    const prev = getJawRange() || {}
    let next
    if (c.kind === 'closed') next = { ...prev, closed: median(ratios), mmClosed: median(mms), tilt: median(c.samples.map(s => s.tilt)) }
    else next = { ...prev, open: pctl(ratios, 0.85), mmOpen: pctl(mms, 0.85) }      // prawie największe otwarcie z tych 2,5 s
    const saved = Number.isFinite(next.closed) && Number.isFinite(next.open)
    saveJawRangePartial(next)
    setRange(next)
    if (saved && !jawRangeOk(next)) setMsg('Otwarta buzia prawie nie różni się od zamkniętej. Powtórz „szeroko otwarta”: naprawdę szeroko.')
    else setMsg(c.kind === 'closed' ? 'Zapisane: buzia zamknięta.' : 'Zapisane: buzia szeroko otwarta.')
  }

  const ok = jawRangeOk(range)
  const pct = read?.pct
  const mmSpan = ok && range.mmOpen && range.mmClosed ? Math.round(range.mmOpen - range.mmClosed) : null
  const haveClosed = Number.isFinite(range?.closed), haveOpen = Number.isFinite(range?.open)

  return (
    <div className="card" style={{ marginTop: 12 }} data-jaw-gauge>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{calibrate ? 'Otwarcie buzi (miarka nos–broda)' : 'Miarka otwarcia buzi'}</div>
          <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
            {calibrate ? 'Kamera mierzy odległość od nosa do brody. Z dwóch pomiarów powstaje własna skala 0–100%.'
              : 'Podgląd z kamery. Na razie tylko pokazuje wynik, niczego nie zalicza.'}
          </div>
        </div>
        <button className={`btn btn-sm ${on ? 'btn-outline' : 'btn-primary'}`} onClick={toggle} data-jaw-toggle>{on ? 'Wyłącz kamerę' : 'Włącz kamerę'}</button>
      </div>

      {state === 'loading' && <div className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>Włączam kamerę…</div>}
      {on && state === 'on' && (
        <div style={{ marginTop: 10 }}>
          <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto', borderRadius: 12, background: '#000' }} />
          <div style={{ textAlign: 'center', marginTop: 8 }} data-jaw-read>
            {!read?.visible ? <span style={{ fontWeight: 800, color: 'var(--orange)' }}>Nie widzę twarzy. Usiądź na wprost kamery.</span>
              : read.tilted ? <span style={{ fontWeight: 800, color: 'var(--orange)' }}>Głowa pochylona. Trzymaj ją prosto, tak jak przy kalibracji.</span>
              : pct != null ? (
                <>
                  <span style={{ fontSize: 30, fontWeight: 800, color: target && pct < target ? 'var(--orange)' : 'var(--green)' }} data-jaw-pct={Math.round(pct)}>{Math.round(pct)}%</span>
                  {read.mm && range.mmClosed ? <span className="text-muted" style={{ fontSize: 13 }}> · ok. {Math.max(0, Math.round(read.mm - range.mmClosed))} mm</span> : null}
                  <div style={{ position: 'relative', height: 14, borderRadius: 7, background: 'var(--soft)', overflow: 'hidden', border: '1px solid var(--border)', marginTop: 4 }}>
                    {target ? <div style={{ position: 'absolute', left: `${target}%`, top: 0, bottom: 0, width: 2, background: 'var(--text)' }} /> : null}
                    <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: target && pct < target ? 'var(--orange)' : 'var(--green)', transition: 'width .1s linear' }} />
                  </div>
                </>
              ) : <span className="text-muted" style={{ fontSize: 13 }}>Pomiar działa (nos–broda = {read.ratio?.toFixed(2)} rozstawu oczu). Żeby zobaczyć procenty, zrób kalibrację otwarcia buzi w zakładce Kalibracja.</span>}
          </div>

          {calibrate && (
            <>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-outline" style={{ flex: 1, minWidth: 140 }} disabled={!!cap} onClick={() => capture('closed')} data-jaw-cap="closed">
                  {cap?.kind === 'closed' ? 'Mierzę… buzia zamknięta' : `1. Buzia zamknięta${haveClosed ? ' ✓' : ''}`}
                </button>
                <button className="btn btn-outline" style={{ flex: 1, minWidth: 140 }} disabled={!!cap} onClick={() => capture('open')} data-jaw-cap="open">
                  {cap?.kind === 'open' ? 'Mierzę… szeroko otwarta' : `2. Buzia szeroko otwarta${haveOpen ? ' ✓' : ''}`}
                </button>
              </div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                Kliknij i przez 2,5 sekundy trzymaj buzię w tej pozycji. Głowa prosto, twarz na wprost kamery.
                „Szeroko otwarta” = tak szeroko, jak jest wygodnie, bez bólu.
              </div>
            </>
          )}
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13 }} data-jaw-msg>{msg}</div>}
      {calibrate && (haveClosed || haveOpen) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div className="text-muted" style={{ fontSize: 12, flex: 1 }} data-jaw-saved>
            {ok ? `Zapisany zakres: nos–broda od ${range.closed.toFixed(2)} do ${range.open.toFixed(2)} rozstawu oczu${mmSpan != null ? ` (ok. ${mmSpan} mm różnicy)` : ''}.`
              : 'Zakres niepełny: potrzebne oba pomiary.'}
          </div>
          <button className="btn btn-sm" style={{ background: '#FEF2F2', color: 'var(--red)' }} onClick={() => { clearJawRange(); setRange(null); setMsg('Zakres skasowany.') }}>Skasuj</button>
        </div>
      )}
    </div>
  )
}
