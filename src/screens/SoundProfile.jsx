// Profil głoski + ćwiczenie „Celuj w głoskę” (biofeedback: dziecko widzi na żywo, gdzie leży jego głoska).
//
//   Pomiar    — długie „sz” albo „s” przez ok. 3 s → położenie, stabilność, trafność; zapis z datą.
//   Ćwiczenie — kilka prób po 3,5 s. Kropki na żywo, zielony pas celu, punkty za czas w pasie
//               i premie za utrzymanie 1, 2 i 3 sekundy. Opcjonalnie co druga próba „w ciemno” (bez wykresu).
//   Osoby     — dziecko oraz osoby wzorcowe (rówieśnik, rodzic, logopeda). Z pomiaru osoby wzorcowej
//               można jednym kliknięciem zrobić cel.
//   Postępy   — wykres kolejnych pomiarów na tle pasa celu.
//
// Wszystko zostaje na urządzeniu. Zapisują się liczby, nie nagrania.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSibilantMeter } from './games/useSibilantMeter'
import { SOUNDS, HZ_MIN, HZ_MAX, getProfile, saveProfile, computeStats, zoneFor, addMeasure, measuresOf } from '../data/soundProfile'

const NEED_FRAMES = 150          // pomiar: ok. 2,5–3 s czystego szumu
const MIN_LVL = 10               // szum liczymy tylko, gdy jest wyraźnie ponad tłem
const TRIAL_MS = 3500, TRIALS = 6
const childName = () => { try { return JSON.parse(localStorage.getItem('stc_user') || '{}').name || 'Dziecko' } catch (e) { return 'Dziecko' } }
const yOf = (hz, h) => h - Math.max(0, Math.min(1, (hz - HZ_MIN) / (HZ_MAX - HZ_MIN))) * h

export default function SoundProfile() {
  const meter = useSibilantMeter()
  const [profile, setProfile] = useState(getProfile())
  const [sound, setSound] = useState('sz')
  const [personId, setPersonId] = useState('child')
  const [mode, setMode] = useState('home')          // home | wait | measure | result | game | gameEnd
  const [progress, setProgress] = useState(0)
  const [flash, setFlash] = useState('')
  const [last, setLast] = useState(null)            // ostatni wynik pomiaru
  const [newName, setNewName] = useState('')
  const [blindAlt, setBlindAlt] = useState(false)
  const [trial, setTrial] = useState({ n: 0, state: 'idle', pts: 0, total: 0, hold: 0, inMs: 0, blind: false, results: [] })
  const canvasRef = useRef(null)
  const d = useRef({ cogs: [], lastT: 0, goal: 'measure', quietSince: 0, tr: null })
  const modeRef = useRef(mode); modeRef.current = mode
  const trialRef = useRef(trial); trialRef.current = trial
  // pętla pomiaru żyje dłużej niż jedno odświeżenie ekranu, więc bieżący wybór (osoba, głoska) czyta stąd
  const live = useRef({}); live.current = { personId, sound }

  const snd = SOUNDS.find(s => s.id === sound)
  const zone = useMemo(() => zoneFor(sound, profile), [sound, profile])
  const zoneRef = useRef(zone); zoneRef.current = zone
  const people = [{ id: 'child', name: childName(), ref: false }, ...profile.people]
  const person = people.find(p => p.id === personId) || people[0]

  useEffect(() => () => meter.stop(), [meter])

  // ── Pętla: rysunek na żywo + zbieranie pomiaru / liczenie punktów ─────────
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const m = modeRef.current, D = d.current, now = performance.now()
      if (m === 'wait') { const st = meter.getInfo().state; if (st === 'on') begin(); else if (st === 'error') { meter.stop(); setFlash('Mikrofon nie oddaje dźwięku.'); setMode('home') } return }
      if (m !== 'measure' && m !== 'game') return
      const frames = meter.getFrames(), Z = zoneRef.current
      const fresh = frames.filter(f => f.t > D.lastT)
      if (fresh.length) D.lastT = fresh[fresh.length - 1].t
      const hiss = fresh.filter(f => f.hiss && (f.lvl || 0) >= MIN_LVL)

      if (m === 'measure') {
        for (const f of hiss) D.cogs.push(f.cog)
        if (hiss.length) { D.quietSince = now; setFlash('') } else if (now - D.quietSince > 2500) setFlash('Czekam na głoskę. Mów głośno, w stronę ekranu.')
        setProgress(Math.min(1, D.cogs.length / NEED_FRAMES))
        if (D.cogs.length >= NEED_FRAMES) finishMeasure()
      } else {
        const T = D.tr
        if (T && T.state === 'run') {
          if (!T.t0 && hiss.length) T.t0 = hiss[0].t                      // próba rusza z pierwszym szumem
          if (T.t0) {
            for (const f of fresh) {
              if (f.t < T.t0) continue
              const dt = Math.min(60, f.t - (T.prev || f.t)); T.prev = f.t
              const ok = f.hiss && (f.lvl || 0) >= MIN_LVL && f.cog >= Z.lo && f.cog <= Z.hi
              if (f.hiss && (f.lvl || 0) >= MIN_LVL) T.cogs.push(f.cog)
              // utrzymanie: krótka przerwa (do 0,15 s) go nie zrywa, dłuższa albo wyjście z pasa — tak
              if (ok) { T.inMs += dt; T.streak += dt; T.miss = 0; T.best = Math.max(T.best, T.streak) } else { T.miss = (T.miss || 0) + dt; if (T.miss > 150) T.streak = 0 }
            }
            // punkty: 1 za każde 0,1 s w pasie + premie za utrzymanie 1 / 2 / 3 s
            const bonus = (T.best >= 3000 ? 35 : T.best >= 2000 ? 15 : T.best >= 1000 ? 5 : 0)
            T.pts = Math.floor(T.inMs / 100) + bonus
            const left = TRIAL_MS - (now - T.t0)
            setProgress(Math.max(0, Math.min(1, 1 - left / TRIAL_MS)))
            setTrial(t => ({ ...t, pts: T.pts, hold: T.best, inMs: T.inMs }))
            if (left <= 0) endTrial()
          } else if (now - T.armed > 6000) { setFlash('Nie słyszę głoski. Zacznij mówić: ' + SOUNDS.find(s => s.id === T.sound).say); T.armed = now }
        }
      }
      draw(frames, now)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter])

  const draw = (frames, now) => {
    const cv = canvasRef.current; if (!cv) return
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h)
    const Z = zoneRef.current, blind = modeRef.current === 'game' && trialRef.current.blind && trialRef.current.state === 'run'
    g.fillStyle = '#F1F5F9'; g.fillRect(0, 0, w, h)
    // pas celu
    const y1 = yOf(Math.min(Z.hi, HZ_MAX), h), y2 = yOf(Math.max(Z.lo, HZ_MIN), h)
    g.fillStyle = 'rgba(34,197,94,.22)'; g.fillRect(0, y1, w, y2 - y1)
    g.strokeStyle = '#16A34A'; g.lineWidth = 2; g.setLineDash([6, 5]); g.strokeRect(1, y1, w - 2, y2 - y1); g.setLineDash([])
    g.fillStyle = '#15803D'; g.font = '700 12px sans-serif'; g.fillText('CEL', 8, Math.min(h - 6, y1 + 16))
    g.fillStyle = '#64748B'; g.font = '11px sans-serif'
    for (const hz of [3000, 5000, 7000, 9000]) { const y = yOf(hz, h); g.fillRect(0, y, w, 1); g.fillText(`${hz / 1000} kHz`, w - 44, y - 3) }
    if (blind) { g.fillStyle = '#0F172A'; g.font = '800 16px sans-serif'; g.textAlign = 'center'; g.fillText('Próba w ciemno: słuchaj siebie', w / 2, h / 2); g.textAlign = 'left'; return }
    const span = 4000
    for (const f of frames) {
      if (!f.hiss || (f.lvl || 0) < MIN_LVL) continue
      const x = w - ((now - f.t) / span) * w; if (x < 0) continue
      const ok = f.cog >= Z.lo && f.cog <= Z.hi
      g.fillStyle = ok ? '#16A34A' : '#EA580C'
      g.beginPath(); g.arc(x, yOf(f.cog, h), 3.5, 0, Math.PI * 2); g.fill()
    }
  }

  const begin = () => {
    const D = d.current, now = performance.now()
    D.lastT = now; D.quietSince = now; D.cogs = []
    setFlash(''); setProgress(0)
    if (D.goal === 'measure') setMode('measure')
    else { setTrial({ n: 0, state: 'idle', pts: 0, total: 0, hold: 0, inMs: 0, blind: false, results: [] }); setMode('game') }
  }
  const start = async (goal) => {
    d.current.goal = goal; setFlash(''); setLast(null); setMode('wait')
    const ok = await meter.start()
    if (!ok) { setFlash('Brak dostępu do mikrofonu.'); setMode('home') }
  }
  const goHome = () => { meter.stop(); d.current.tr = null; setMode('home') }

  const finishMeasure = () => {
    const st = computeStats(d.current.cogs, zoneRef.current)
    meter.stop()
    if (!st) { setFlash('Za mało pomiaru. Spróbuj jeszcze raz.'); setMode('home'); return }
    setProfile(addMeasure({ personId: live.current.personId, sound: live.current.sound, ...st, zone: { lo: zoneRef.current.lo, hi: zoneRef.current.hi }, mode: 'measure' }))
    setLast(st); setMode('result')
  }

  const startTrial = () => {
    const t = trialRef.current, n = t.n + 1
    const blind = blindAlt && n % 2 === 0
    d.current.tr = { state: 'run', sound, armed: performance.now(), t0: 0, prev: 0, inMs: 0, streak: 0, best: 0, pts: 0, cogs: [] }
    d.current.lastT = performance.now()
    setFlash(''); setProgress(0)
    setTrial({ ...t, n, state: 'run', pts: 0, hold: 0, inMs: 0, blind })
  }
  const endTrial = () => {
    const T = d.current.tr; if (!T || T.state !== 'run') return
    T.state = 'done'
    const t = trialRef.current
    const res = { pts: T.pts, hold: T.best, hit: Math.round((T.inMs / TRIAL_MS) * 100), blind: t.blind }
    const results = [...t.results, res], total = t.total + T.pts
    d.current.cogs.push(...T.cogs)
    if (t.n >= TRIALS) {
      const st = computeStats(d.current.cogs, zoneRef.current)
      meter.stop()
      if (st) setProfile(addMeasure({ personId: live.current.personId, sound: live.current.sound, ...st, zone: { lo: zoneRef.current.lo, hi: zoneRef.current.hi }, mode: 'game', points: total }))
      setLast(st); setTrial({ ...t, state: 'done', total, results }); setMode('gameEnd')
    } else setTrial({ ...t, state: 'between', total, results, pts: T.pts, hold: T.best })
  }

  const addPerson = () => {
    const name = newName.trim(); if (!name) return
    const p = { ...profile, people: [...profile.people, { id: 'p' + Date.now(), name, ref: true }] }
    saveProfile(p); setProfile(p); setNewName(''); setPersonId(p.people[p.people.length - 1].id)
  }
  const setTargetFrom = (m, who) => {
    const half = Math.max(350, Math.round(m.spread / 2) + 200)
    const p = { ...profile, targets: { ...profile.targets, [m.sound]: { lo: Math.max(HZ_MIN, m.hz - half), hi: m.hz + half, label: `z pomiaru: ${who}` } } }
    saveProfile(p); setProfile(p)
  }
  const clearTarget = () => { const t = { ...profile.targets }; delete t[sound]; const p = { ...profile, targets: t }; saveProfile(p); setProfile(p) }

  const mine = measuresOf(profile, personId, sound)
  const prev = mine.length > 1 ? mine[mine.length - 2] : null
  const Stat = ({ title, value, sub, good }) => (
    <div style={{ flex: 1, minWidth: 92, padding: '8px 10px', borderRadius: 10, background: 'var(--soft)', textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)' }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: good == null ? 'var(--text)' : good ? 'var(--green)' : 'var(--orange)' }}>{value}</div>
      <div className="text-muted" style={{ fontSize: 11 }}>{sub}</div>
    </div>
  )
  const stats = (st, cmp) => st && (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-stats>
      <Stat title="POŁOŻENIE" value={`${st.hz} Hz`} sub={cmp ? `poprzednio ${cmp.hz}` : `cel ${zone.lo}–${Math.min(zone.hi, HZ_MAX)}`} good={st.hz >= zone.lo && st.hz <= zone.hi} />
      <Stat title="STABILNOŚĆ" value={`± ${Math.round(st.spread / 2)} Hz`} sub={cmp ? `poprzednio ± ${Math.round(cmp.spread / 2)}` : 'mniej = równiej'} />
      <Stat title="TRAFNOŚĆ" value={st.hit == null ? '—' : `${st.hit}%`} sub={cmp && cmp.hit != null ? `poprzednio ${cmp.hit}%` : 'czasu w pasie celu'} good={st.hit == null ? null : st.hit >= 70} />
    </div>
  )
  const chart = <canvas ref={canvasRef} style={{ width: '100%', height: 190, borderRadius: 10, display: 'block' }} data-live-chart />
  const stopBtn = <button className="btn btn-ghost btn-full mt-12" onClick={goHome}>Przerwij</button>

  if (mode === 'wait') return <div className="card" style={{ textAlign: 'center', fontWeight: 800, fontSize: 18 }}>Cisza przez chwilę. Słucham pokoju…</div>

  if (mode === 'measure') return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="form-label">Pomiar · {person.name} · powiedz długo</div>
      <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 2, color: 'var(--primary)' }}>{snd.say}</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '2px 0 8px' }}>{snd.hint} Można brać oddech.</p>
      {chart}
      <div className="progress-wrap dark" style={{ height: 12, marginTop: 8 }}><div className="progress-fill colored" style={{ width: `${progress * 100}%`, transition: 'width .1s linear' }} /></div>
      <div style={{ minHeight: 20, marginTop: 6, fontWeight: 700, fontSize: 13, color: 'var(--orange)' }}>{flash}</div>
      {stopBtn}
    </div>
  )

  if (mode === 'game') return (
    <div className="card" style={{ textAlign: 'center' }} data-game={trial.state}>
      <div className="form-label">Celuj w {snd.label} · próba {Math.max(1, trial.n)} z {TRIALS} · razem {trial.total + (trial.state === 'run' ? trial.pts : 0)} pkt</div>
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 2, color: 'var(--primary)' }}>{snd.say}</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '2px 0 8px' }}>Trzymaj kropki w zielonym pasie. Jeśli uciekają {sound === 'sz' ? 'w górę: język wyżej, usta w dzióbek' : 'w dół: język niżej, uśmiech'}.</p>
      {chart}
      <div className="progress-wrap dark" style={{ height: 10, marginTop: 8 }}><div className="progress-fill colored" style={{ width: `${progress * 100}%`, transition: 'width .1s linear' }} /></div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 8, minHeight: 22 }} data-trial-info>
        {trial.state === 'run' ? `${trial.pts} pkt · najdłużej w pasie ${(trial.hold / 1000).toFixed(1)} s`
          : trial.state === 'between' ? `Próba ${trial.n}: ${trial.pts} pkt, najdłużej w pasie ${(trial.hold / 1000).toFixed(1)} s`
          : 'Kliknij „Start próby” i mów długo.'}
      </div>
      <div style={{ minHeight: 18, fontWeight: 700, fontSize: 13, color: 'var(--orange)' }}>{flash}</div>
      {trial.state !== 'run' && <button className="btn btn-primary btn-full" onClick={startTrial} data-trial-start>{trial.n === 0 ? 'Start próby' : 'Następna próba'}</button>}
      {stopBtn}
    </div>
  )

  if (mode === 'result' || mode === 'gameEnd') return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }} data-result-title>
        {mode === 'gameEnd' ? `Koniec: ${trial.total} pkt` : `Pomiar zapisany: ${person.name}, ${snd.label}`}
      </div>
      {mode === 'gameEnd' && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {trial.results.map((r, i) => <span key={i} className={`chip ${r.hit >= 50 ? 'chip-completed' : 'chip-skipped'}`}>{i + 1}{r.blind ? ' (w ciemno)' : ''}: {r.pts} pkt</span>)}
        </div>
      )}
      {stats(last, prev)}
      {person.ref && last && <button className="btn btn-outline btn-full mt-12" onClick={() => setTargetFrom({ ...last, sound }, person.name)} data-set-target>Ustaw cel dla {snd.label} z tego pomiaru</button>}
      <button className="btn btn-primary btn-full mt-12" onClick={() => setMode('home')}>Wróć</button>
    </div>
  )

  // ── Ekran główny ──────────────────────────────────────────────────────────
  const refPeople = profile.people.map(p => ({ p, m: measuresOf(profile, p.id, sound).slice(-1)[0] })).filter(x => x.m)
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {SOUNDS.map(s => <button key={s.id} className={`btn btn-sm ${sound === s.id ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setSound(s.id)} data-sound={s.id}>Głoska {s.label}</button>)}
      </div>
      <div className="form-label">Kto mówi</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {people.map(p => <button key={p.id} className={`btn btn-sm ${personId === p.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPersonId(p.id)} data-person={p.id}>{p.name}{p.ref ? ' (wzorzec)' : ''}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="Dodaj osobę wzorcową, np. Tata, Ola, logopeda" value={newName} onChange={e => setNewName(e.target.value)} data-new-person />
        <button className="btn btn-outline btn-sm" onClick={addPerson} data-add-person>Dodaj</button>
      </div>

      {flash && <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--orange)', marginBottom: 8 }}>{flash}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-outline" style={{ flex: 1, minWidth: 140 }} onClick={() => start('measure')} data-start="measure">Pomiar (1 min)</button>
        <button className="btn btn-primary" style={{ flex: 1, minWidth: 140 }} onClick={() => start('game')} data-start="game">Ćwiczenie: celuj w {snd.label}</button>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 13 }}>
        <input type="checkbox" checked={blindAlt} onChange={e => setBlindAlt(e.target.checked)} data-blind /> Co druga próba „w ciemno” (bez wykresu, wynik po fakcie)
      </label>

      <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, borderLeft: '4px solid var(--green)', background: 'var(--soft)', fontSize: 13, lineHeight: 1.5 }} data-zone>
        <b>Cel dla {snd.label}:</b> {zone.lo}–{Math.min(zone.hi, HZ_MAX)}{zone.hi > HZ_MAX ? '+' : ''} Hz <span className="text-muted">({zone.label})</span>
        {zone.src === 'target' && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={clearTarget}>Usuń cel</button>}
      </div>
      {refPeople.map(({ p, m }) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13 }}>
          <div style={{ flex: 1 }}>{p.name}: {m.hz} Hz, ± {Math.round(m.spread / 2)} Hz</div>
          <button className="btn btn-outline btn-sm" onClick={() => setTargetFrom(m, p.name)}>Ustaw jako cel</button>
        </div>
      ))}

      <div style={{ marginTop: 14 }}>
        <div className="form-label">Postępy · {person.name} · {snd.label} ({mine.length} pomiarów)</div>
        {mine.length ? <>{stats(mine[mine.length - 1], prev)}<ProgressChart list={mine.slice(-20)} zone={zone} /></>
          : <div className="text-muted" style={{ fontSize: 13 }}>Jeszcze nie ma pomiarów. Zacznij od „Pomiar”.</div>}
      </div>
    </div>
  )
}

// Kolejne pomiary: słupek = pas, w którym mieściło się 80% głoski, kropka = środek; zielone tło = cel.
// Pod spodem trafność w procentach.
function ProgressChart({ list, zone }) {
  const W = 600, H = 170, PAD = 44, H2 = 54
  const x = (i) => PAD + (list.length === 1 ? (W - PAD) / 2 : (i / (list.length - 1)) * (W - PAD - 24) + 12)
  const y = (hz) => yOf(hz, H - 10) + 5
  return (
    <div style={{ marginTop: 8 }} data-progress>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', background: 'var(--soft)', borderRadius: 10 }}>
        <rect x={PAD} y={y(Math.min(zone.hi, HZ_MAX))} width={W - PAD} height={Math.max(2, y(Math.max(zone.lo, HZ_MIN)) - y(Math.min(zone.hi, HZ_MAX)))} fill="rgba(34,197,94,.2)" />
        {[3000, 5000, 7000, 9000].map(hz => <g key={hz}><line x1={PAD} x2={W} y1={y(hz)} y2={y(hz)} stroke="var(--border)" /><text x={PAD - 6} y={y(hz) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{hz / 1000} kHz</text></g>)}
        {list.length > 1 && <polyline points={list.map((m, i) => `${x(i)},${y(m.hz)}`).join(' ')} fill="none" stroke="#6366F1" strokeWidth="2" />}
        {list.map((m, i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(m.hi)} y2={y(m.lo)} stroke="#6366F1" strokeWidth="7" strokeLinecap="round" opacity="0.3" />
            <circle cx={x(i)} cy={y(m.hz)} r="5" fill={m.mode === 'game' ? '#F59E0B' : '#6366F1'} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
      <svg viewBox={`0 0 ${W} ${H2}`} width="100%" style={{ display: 'block', marginTop: 4 }}>
        {list.map((m, i) => m.hit == null ? null : (
          <g key={i}><rect x={x(i) - 8} y={H2 - 16 - (m.hit / 100) * (H2 - 22)} width="16" height={(m.hit / 100) * (H2 - 22) + 1} rx="3" fill={m.hit >= 70 ? '#22C55E' : '#F59E0B'} />
            <text x={x(i)} y={H2 - 3} textAnchor="middle" fontSize="10" fill="var(--muted)">{new Date(m.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' })}</text></g>
        ))}
        <text x="0" y="12" fontSize="11" fontWeight="700" fill="var(--muted)">trafność</text>
      </svg>
      <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
        Kropka = położenie, jasny słupek = rozrzut (krótszy = stabilniej), zielone tło = cel. Fioletowe kropki to pomiary, żółte to ćwiczenia.
      </div>
    </div>
  )
}
