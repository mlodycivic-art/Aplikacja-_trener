// Okno starannej mowy — umówiony czas (np. 15 minut), w którym ćwiczący mówi najstaranniej, jak umie:
// przy odrabianiu lekcji, w rozmowie, przy czytaniu na głos. Telefon lub tablet leży na stole
// (do ok. 2 m) albo słucha przez mikrofon przypinany.
//
// Co aplikacja robi w tym czasie:
//   – wyłapuje słowa z własnej bazy (Mikrofon → Słowa) i sprawdza w nich głoskę: dobrze / do poprawy,
//   – liczy proporcję głosek szumiących wśród wszystkich szumów i porównuje z osobistym wzorcem,
//   – co kilka minut i na koniec mówi krótkie podsumowanie (najpierw to, co dobre),
//   – NIE przerywa, nie pika i nie poprawia w trakcie.
// Czego nie robi: nie rozpoznaje mowy, nie nagrywa dźwięku, nie wie, kto mówi (liczy każdy głos przy mikrofonie).
//
// Tryb testowy (localStorage stc_debug_sim = '1'): bez mikrofonu; klawisz G = słowo dobrze, B = do poprawy.

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter, analyseFrames } from './games/useSibilantMeter'
import { featuresFromFrames, spotAndJudge, hissCounts, shareOf } from '../data/wordSpotter'
import { loadActiveModels, getBaseline, getUsableThreshold, summarizeBase } from '../data/wordBase'
import { speak, summaryText } from '../data/voice'
import { addResult } from '../data/resultsStore'

const END_SILENCE_MS = 450     // pauza kończąca fragment mowy
const MAX_CHUNK_MS   = 6000    // dłuższą mowę tniemy na kawałki (słowo na granicy cięcia przepada)
const MIN_CHUNK_MS   = 250
const LOW_SHARE_FACTOR = 0.6   // proporcja szumiących poniżej 60% wzorca = sygnał „mało szumiących”
const MIN_HISS_FOR_SHARE = 12  // tyle ocenionych szumów, zanim cokolwiek powiemy o proporcji
export const CAREFUL_POINTS_BASE = 5
export const CAREFUL_POINTS_PER_GOOD = 2
export const CAREFUL_POINTS_MAX = 40

const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const emptyTally = () => ({ good: 0, bad: 0, unclear: 0, sz: 0, s: 0, words: {} })

export default function CarefulSpeechWindow({ exercise, onComplete }) {
  const p = exercise.params || {}
  const windowMs  = Math.max(0.1, p.windowMin ?? 15) * 60000
  const everyMs   = Math.max(0, p.summaryEveryMin ?? 5) * 60000
  const voiceOn   = p.voice !== false
  const meter = useSibilantMeter()
  const sim = useRef((() => { try { return localStorage.getItem('stc_debug_sim') === '1' } catch (e) { return false } })()).current

  const [status, setStatus] = useState('intro')   // intro | starting | running | done | error
  const [, setTick] = useState(0)
  const g = useRef(null)
  const timerRef = useRef(null)
  const wakeRef = useRef(null)

  const threshold = getUsableThreshold()
  const base = summarizeBase()
  const baseline = getBaseline()

  const say = async (text) => {
    const s = g.current
    if (!voiceOn || !s) return
    s.speaking = true
    await speak(text, { voiceName: p.voiceName })
    // po komunikacie odrzucamy to, co mikrofon usłyszał z głośnika
    s.chunk = null
    s.muteUntil = performance.now() + 500
    s.speaking = false
  }

  const lowShare = (t) => {
    const sh = shareOf(t.sz, t.s)
    return !!baseline && sh != null && t.sz + t.s >= MIN_HISS_FOR_SHARE && sh < baseline.share * LOW_SHARE_FACTOR
  }
  const topBad = (t) => {
    let best = null
    for (const [w, c] of Object.entries(t.words)) if (c.bad > 0 && (!best || c.bad > t.words[best].bad)) best = w
    return best
  }
  const summaryOf = (t, minutes, final) => summaryText({
    minutes, final, good: t.good, bad: t.bad, heard: t.good + t.bad + t.unclear,
    topBad: topBad(t), lowShare: lowShare(t), judged: !!g.current?.threshold || sim,
  })

  const record = (tally, hit) => {
    const key = hit.verdict === 'pass' ? 'good' : hit.verdict === 'fail' ? 'bad' : 'unclear'
    tally[key]++
    const w = tally.words[hit.word] || (tally.words[hit.word] = { good: 0, bad: 0, unclear: 0 })
    w[key]++
  }

  const processChunk = (frames) => {
    const s = g.current
    const t0 = frames[0].t
    const rel = frames.map(f => ({ ...f, t: f.t - t0 }))
    const segs = analyseFrames(rel)
    if (s.threshold) {
      const c = hissCounts(segs, s.threshold)
      for (const t of [s.total, s.part]) { t.sz += c.sz; t.s += c.s }
    }
    if (!s.hasModels) return
    const f = featuresFromFrames(rel)
    if (!f) return
    for (const hit of spotAndJudge(f.feat, segs, s.models, s.threshold)) { record(s.total, hit); record(s.part, hit) }
  }

  const finish = async (early) => {
    const s = g.current
    if (!s || s.done) return
    s.done = true
    clearInterval(timerRef.current)
    if (s.chunk && s.chunk.frames.length > 5) processChunk(s.chunk.frames)
    meter.stop()
    try { wakeRef.current?.release() } catch (e) {}
    const t = s.total
    const activeMs = Math.max(0, Date.now() - s.startedAt - s.pausedMs)
    const points = Math.min(CAREFUL_POINTS_MAX, CAREFUL_POINTS_BASE + t.good * CAREFUL_POINTS_PER_GOOD)
    s.points = points
    addResult('careful_window', {
      templateId: exercise.templateId || exercise.id, plannedMin: Math.round(windowMs / 6000) / 10, activeMin: Math.round(activeMs / 6000) / 10,
      early: !!early, good: t.good, bad: t.bad, unclear: t.unclear, sz: t.sz, s: t.s,
      share: shareOf(t.sz, t.s), baselineShare: baseline?.share ?? null, words: t.words,
      judged: !!s.threshold, monitored: Object.keys(s.models).length, speechSec: Math.round(s.speechMs / 1000), points,
    })
    setStatus('done')
    try { window.speechSynthesis?.cancel() } catch (e) {}
    if (voiceOn) speak(summaryOf(t, Math.round(activeMs / 60000), true), { voiceName: p.voiceName })
  }

  const loop = () => {
    const s = g.current
    if (!s || s.done) return
    const now = performance.now()
    // przeglądarka wstrzymała stronę (wygaszony ekran, inna karta): tego czasu nie liczymy
    if (s.lastLoop && now - s.lastLoop > 1500) { s.pausedMs += now - s.lastLoop; s.chunk = null }
    s.lastLoop = now
    if (!sim && !s.speaking && now > s.muteUntil) {
      for (const f of meter.getFrames()) {
        if (f.t <= s.lastT) continue
        s.lastT = f.t
        if (!s.chunk) { if (f.loud) s.chunk = { startT: f.t, lastLoudT: f.t, frames: [f] }; continue }
        s.chunk.frames.push(f)
        if (f.loud) s.chunk.lastLoudT = f.t
      }
      const c = s.chunk
      if (c && (now - c.lastLoudT > END_SILENCE_MS || c.lastLoudT - c.startT > MAX_CHUNK_MS)) {
        s.chunk = null
        const dur = c.lastLoudT - c.startT
        if (dur >= MIN_CHUNK_MS) {
          s.speechMs += dur
          processChunk(c.frames.filter(f => f.t <= c.lastLoudT + 60))
        }
      }
    } else if (!sim) { s.lastT = now }
    const elapsed = Date.now() - s.startedAt - s.pausedMs
    if (elapsed >= windowMs) { finish(false); return }
    if (everyMs > 0 && elapsed >= s.nextSummaryAt && windowMs - elapsed > 20000) {
      const minutes = Math.round(s.nextSummaryAt / 60000)
      s.nextSummaryAt += everyMs
      const part = s.part
      s.part = emptyTally()
      s.lastSummary = summaryOf(part, minutes, false)
      say(s.lastSummary)
    }
    setTick(n => (n + 1) % 1000000)
  }

  const start = async () => {
    setStatus('starting')
    const models = loadActiveModels()
    g.current = {
      models, hasModels: Object.keys(models).length > 0, threshold,
      total: emptyTally(), part: emptyTally(), chunk: null, lastT: performance.now(), lastLoop: 0,
      startedAt: 0, pausedMs: 0, nextSummaryAt: everyMs, speechMs: 0, speaking: false, muteUntil: 0, done: false, lastSummary: '',
    }
    if (!sim) {
      const ok = await meter.start()
      if (!ok) { setStatus('error'); return }
      await new Promise(resolve => { const w = setInterval(() => { if (meter.getInfo().state === 'on') { clearInterval(w); resolve() } }, 60) })
    }
    try { wakeRef.current = await navigator.wakeLock?.request('screen') } catch (e) {}
    const s = g.current
    s.startedAt = Date.now(); s.lastT = performance.now()
    setStatus('running')
    timerRef.current = setInterval(() => loopRef.current(), 200)
    if (voiceOn) say('Zaczynamy okno starannej mowy. Mów spokojnie i wyraźnie.')
  }
  const loopRef = useRef(loop); loopRef.current = loop

  // ekran nie może zgasnąć: po powrocie do karty prosimy o blokadę wygaszania jeszcze raz
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === 'visible' && g.current && !g.current.done && status === 'running') {
        try { wakeRef.current = await navigator.wakeLock?.request('screen') } catch (e) {}
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [status])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    if (g.current) g.current.done = true
    meter.stop()
    try { wakeRef.current?.release() } catch (e) {}
    try { window.speechSynthesis?.cancel() } catch (e) {}
  }, [meter])

  // tryb testowy: G = słowo dobrze, B = do poprawy
  useEffect(() => {
    if (!sim || status !== 'running') return
    const onKey = (e) => {
      const s = g.current
      if (!s) return
      const k = e.key.toLowerCase()
      if (k !== 'g' && k !== 'b') return
      const hit = { word: 'czemu', verdict: k === 'g' ? 'pass' : 'fail' }
      record(s.total, hit); record(s.part, hit)
      if (k === 'g') { s.total.sz++; s.part.sz++ } else { s.total.s++; s.part.s++ }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim, status])

  // ── Widoki ─────────────────────────────────────────────────────────────────
  if (status === 'intro' || status === 'starting' || status === 'error') {
    const ready = base.ok + base.untested
    return (
      <div className="card" data-careful="intro">
        <div style={{ fontSize: 34, fontWeight: 800, textAlign: 'center', margin: '6px 0 2px' }}>{fmt(windowMs)}</div>
        <div className="text-muted" style={{ textAlign: 'center', fontSize: 13, marginBottom: 14 }}>okno starannej mowy</div>
        <ul style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18, marginBottom: 12 }}>
          <li>Połóż telefon na stole, najdalej 2 metry od siebie, mikrofonem w swoją stronę.</li>
          <li>Rób to, co zwykle: lekcje, rozmowa, czytanie na głos. Mów najstaranniej, jak umiesz.</li>
          <li>Ekran zostaje włączony. {everyMs > 0 && voiceOn ? `Co ${p.summaryEveryMin ?? 5} min usłyszysz krótki wynik.` : 'Wynik zobaczysz na końcu.'}</li>
        </ul>
        <div style={{ fontSize: 13, lineHeight: 1.6, padding: '10px 12px', borderRadius: 12, background: 'var(--soft)', marginBottom: 12 }}>
          {ready > 0
            ? <>Słowa z listy gotowe do wyłapywania: <b>{ready}</b>{base.untested > 0 ? ` (w tym ${base.untested} bez testu trafności, wynik orientacyjny)` : ''}.</>
            : <>Baza słów nie jest jeszcze nagrana, więc okno policzy tylko proporcję głosek. Dorosły nagra ją w zakładce Mikrofon → Słowa.</>}
          {!threshold && <><br />Mikrofon nie jest skalibrowany: aplikacja policzy słowa, ale nie oceni głosek.</>}
        </div>
        {status === 'error' && <p style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 10 }}>Mikrofon jest niedostępny. Sprawdź uprawnienia przeglądarki.</p>}
        <button className="btn btn-primary btn-full" disabled={status === 'starting'} onClick={start} data-act="start">
          {status === 'starting' ? 'Cisza przez chwilę: mierzę tło…' : 'Zaczynam'}
        </button>
      </div>
    )
  }

  const s = g.current
  const t = s.total

  if (status === 'done') {
    const sh = shareOf(t.sz, t.s)
    const heard = t.good + t.bad + t.unclear
    const rows = Object.entries(t.words).sort((a, b) => (b[1].bad - a[1].bad) || (b[1].good - a[1].good))
    return (
      <div className="card" data-careful="done">
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Okno zakończone</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {[['Dobrze', t.good, 'var(--green)'], ['Do poprawy', t.bad, t.bad ? 'var(--yellow)' : 'var(--muted)'], ['Bez oceny', t.unclear, 'var(--muted)']].map(([label, n, color]) => (
            <div key={label} style={{ textAlign: 'center', padding: '12px 4px', borderRadius: 12, background: 'var(--soft)' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color }} data-count={label}>{n}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
            </div>
          ))}
        </div>
        {heard === 0 && <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>Nie padło żadne słowo z listy albo aplikacja ich nie wyłapała.</p>}
        {rows.length > 0 && (
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            {rows.map(([w, c]) => (
              <div key={w} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <b>{w}</b>
                <span><span style={{ color: 'var(--green)', fontWeight: 700 }}>{c.good} dobrze</span>{c.bad > 0 && <span style={{ color: 'var(--yellow)', fontWeight: 700 }}> · {c.bad} do poprawy</span>}{c.unclear > 0 && <span className="text-muted"> · {c.unclear} bez oceny</span>}</span>
              </div>
            ))}
          </div>
        )}
        {sh != null && t.sz + t.s >= MIN_HISS_FOR_SHARE && (
          <p style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
            Głoski szumiące: <b>{Math.round(sh * 100)}%</b> ocenionych szumów
            {baseline ? <> (wzorzec: {Math.round(baseline.share * 100)}%). {lowShare(t) ? 'Wyraźnie mniej niż we wzorcu: część „sz”, „cz” mogła zabrzmieć jak „s”, „c”.' : 'Podobnie jak we wzorcu.'}</> : '.'}
          </p>
        )}
        <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Mowy było około {Math.round(s.speechMs / 1000)} s. Wynik liczy każdy głos przy mikrofonie, także innych osób.
        </p>
        <button className="btn btn-primary btn-full" onClick={() => onComplete(false, false, 0)} data-act="done">Gotowe (+{s.points} pkt)</button>
      </div>
    )
  }

  const elapsed = Date.now() - s.startedAt - s.pausedMs
  return (
    <div className="card" data-careful="running" style={{ textAlign: 'center' }}>
      <div className="text-muted" style={{ fontSize: 13 }}>Mów starannie. Zostało</div>
      <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: 1, margin: '2px 0 6px' }} data-left>{fmt(windowMs - elapsed)}</div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--soft)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ height: '100%', width: `${Math.min(100, (elapsed / windowMs) * 100)}%`, background: 'var(--primary)', transition: 'width .3s linear' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', marginBottom: 14, fontSize: 13, fontWeight: 700, color: s.chunk ? 'var(--green)' : 'var(--muted)' }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: s.chunk ? 'var(--green)' : 'var(--border)', transition: 'background .2s' }} />
        {s.speaking ? 'Podsumowanie…' : s.chunk ? 'Słyszę mowę' : 'Cisza'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ padding: '10px 4px', borderRadius: 12, background: 'var(--soft)' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green)' }} data-live="good">{t.good}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>słowa dobrze</div>
        </div>
        <div style={{ padding: '10px 4px', borderRadius: 12, background: 'var(--soft)' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: t.bad ? 'var(--yellow)' : 'var(--muted)' }} data-live="bad">{t.bad}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>do poprawy</div>
        </div>
      </div>
      {s.lastSummary && <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }} data-summary>{s.lastSummary}</p>}
      {sim && <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>Tryb testowy: klawisz G = dobrze, B = do poprawy</div>}
      <button className="btn btn-ghost btn-full" onClick={() => finish(true)} data-act="finish">Zakończ teraz</button>
    </div>
  )
}
