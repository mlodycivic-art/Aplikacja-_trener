// „Wzorzec” — cel wymowy ustawiony NA SŁUCH, z głosu dziecka.
//
// 12 poprawnych słów (sz, cz, s, c × początek / środek / koniec). Dla każdego:
//   1. dziecko nagrywa słowo,
//   2. słowo gra w pętli, a głoska-szum jest zaznaczona na pasku,
//   3. jeśli brzmi czysto → „Brzmi dobrze” (zapisujemy wysokość szumu taką, jaka jest),
//      jeśli nie → dorosły kręci pokrętłem, aż zabrzmi czysto, i zapisuje.
// Z zapisanych słów powstają dwa zakresy (sz/cz oraz s/c). Można je włączyć jako próg dla gier.
//
// Pokrętło „Wysokość” przesuwa tylko zaznaczony szum (w dół: s → sz, w górę: sz → s), samogłoski zostają.
// Pokrętło „Długość” wydłuża szum, żeby łatwiej było usłyszeć różnicę; na wzorzec nie wpływa.
// Nagrania nie są zapisywane — zostaje tylko liczba (Hz) dla każdego słowa.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSibilantMeter } from './games/useSibilantMeter'
import { analyseBuffer, renderTuned, cogOf, cogTrack, envelopeOf } from './games/sibilantDsp'
import { REFERENCE_WORDS, getReference, saveReference, clearReference, referenceSummary, getQuickProfile } from '../data/patternStore'

const REC_MS = 2600
const RATIO_MIN = 0.45, RATIO_MAX = 1.8
const toRatio = (v) => Math.exp(Math.log(RATIO_MIN) + v * (Math.log(RATIO_MAX) - Math.log(RATIO_MIN)))
const toV = (r) => (Math.log(r) - Math.log(RATIO_MIN)) / (Math.log(RATIO_MAX) - Math.log(RATIO_MIN))

// Okrągłe pokrętło: przeciągnij w górę/w dół (albo w bok) lub użyj suwaka pod spodem
function Knob({ value, onChange, label, readout, color = 'var(--primary)', name }) {
  const drag = useRef(null)
  const angle = -135 + value * 270
  const onDown = (e) => { drag.current = { y: e.clientY, x: e.clientX, v: value }; e.currentTarget.setPointerCapture?.(e.pointerId) }
  const onMove = (e) => {
    if (!drag.current) return
    const d = (drag.current.y - e.clientY) + (e.clientX - drag.current.x)
    onChange(Math.max(0, Math.min(1, drag.current.v + d / 220)))
  }
  const onUp = () => { drag.current = null }
  return (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 130 }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>{label}</div>
      <svg viewBox="0 0 100 100" width="104" height="104" style={{ touchAction: 'none', cursor: 'grab', display: 'block', margin: '4px auto' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <path d="M 21.7 78.3 A 40 40 0 1 1 78.3 78.3" fill="none" stroke="var(--border)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="50" cy="50" r="30" fill="var(--soft)" stroke={color} strokeWidth="3" />
        <g transform={`rotate(${angle} 50 50)`}><rect x="48" y="23" width="4" height="17" rx="2" fill={color} /></g>
      </svg>
      <input type="range" min="0" max="1" step="0.005" value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%' }} data-knob={name} />
      <div style={{ fontSize: 13, fontWeight: 700, minHeight: 20 }}>{readout}</div>
    </div>
  )
}

export default function ReferenceTuner() {
  const meter = useMeterOnce()
  const [ref, setRef] = useState(getReference())
  const [stage, setStage] = useState('list')        // list | wait | rec | busy | tune
  const [item, setItem] = useState(null)            // słowo z REFERENCE_WORDS
  const [msg, setMsg] = useState('')
  const [progress, setProgress] = useState(0)
  const [take, setTake] = useState(null)            // { samples, sr, trim, segments, envelope, liveCogs }
  const [segIdx, setSegIdx] = useState(0)
  const [pitch, setPitch] = useState(toV(1))
  const [len, setLen] = useState(0)                 // 0..1 → ×1..×3
  const [playing, setPlaying] = useState(false)
  const [original, setOriginal] = useState(false)
  const audio = useRef({ ctx: null, src: null })
  const timer = useRef(null)

  const summary = useMemo(() => referenceSummary(ref), [ref])
  const quick = getQuickProfile()
  const ratio = toRatio(pitch), stretch = 1 + len * 2
  const seg = take?.segments[segIdx] || null

  // Strojone nagranie + odczyt: ile Hz ma teraz szum (ta sama miara przed i po, przeliczona na skalę mikrofonu)
  const tuned = useMemo(() => {
    if (!take || !seg) return null
    const r = renderTuned(take.samples, take.sr, take.trim, seg, original ? 1 : ratio, original ? 1 : stretch)
    const before = cogOf(take.samples, take.sr, seg.start, seg.end)
    const after = cogOf(r.samples, take.sr, r.segStart, r.segEnd)
    const base = take.liveCogs[segIdx] || Math.round(before)
    const k = before > 0 ? base / before : 1          // przeliczenie na skalę pomiaru „na żywo” (tę z gier)
    return {
      ...r, baseHz: base, nowHz: Math.round(after * k), k,
      envNow: envelopeOf(r.samples, take.sr), trackNow: cogTrack(r.samples, take.sr, r.segStart, r.segEnd).map(d => ({ t: d.t + r.segStart / take.sr, hz: d.hz * k })),
      lenNowMs: Math.round(((r.segEnd - r.segStart) / take.sr) * 1000), durNow: r.samples.length / take.sr,
    }
  }, [take, seg, segIdx, ratio, stretch, original])

  // Oryginał (do porównania na wykresach): obwiednia słowa i przebieg wysokości wybranej głoski
  const orig = useMemo(() => {
    if (!take || !seg) return null
    const before = cogOf(take.samples, take.sr, seg.start, seg.end)
    const base = take.liveCogs[segIdx] || Math.round(before)
    const k = before > 0 ? base / before : 1
    const t0 = (seg.start - take.trim.start) / take.sr
    return {
      env: envelopeOf(take.samples, take.sr, take.trim.start, take.trim.end),
      track: cogTrack(take.samples, take.sr, seg.start, seg.end).map(d => ({ t: d.t + t0, hz: d.hz * k })),
      segT0: t0, segT1: (seg.end - take.trim.start) / take.sr, lenMs: Math.round(((seg.end - seg.start) / take.sr) * 1000),
      dur: (take.trim.end - take.trim.start) / take.sr,
    }
  }, [take, seg, segIdx])

  const [head, setHead] = useState(null)             // pozycja odtwarzania (s od początku słowa) albo null
  const [blocked, setBlocked] = useState(false)      // przeglądarka nie puściła dźwięku
  const stopSound = () => { try { audio.current.src?.stop() } catch (e) {} audio.current.src = null }
  // Safari puszcza dźwięk tylko wtedy, gdy odtwarzanie zostało „odblokowane” PODCZAS kliknięcia.
  // Dlatego wołamy to bezpośrednio w obsłudze każdego przycisku i pokrętła.
  const unlockAudio = () => {
    const ctx = audio.current.ctx || (audio.current.ctx = new (window.AudioContext || window.webkitAudioContext)())
    try { if (ctx.state !== 'running') ctx.resume() } catch (e) {}
    try { const b = ctx.createBuffer(1, 1, ctx.sampleRate); const n = ctx.createBufferSource(); n.buffer = b; n.connect(ctx.destination); n.start() } catch (e) {}
    return ctx
  }
  const play = () => {
    if (!tuned) return
    stopSound()
    const ctx = unlockAudio()
    const gapN = Math.round(0.45 * take.sr)                       // przerwa między powtórzeniami
    const buf = ctx.createBuffer(1, tuned.samples.length + gapN, take.sr)
    buf.getChannelData(0).set(tuned.samples)
    const src = ctx.createBufferSource()
    src.buffer = buf; src.loop = true; src.connect(ctx.destination); src.start()
    audio.current.src = src
    audio.current.t0 = ctx.currentTime; audio.current.loop = buf.duration
  }
  // znacznik odtwarzania na wykresach + wykrycie, że przeglądarka wstrzymała dźwięk
  useEffect(() => {
    if (!playing) { setHead(null); setBlocked(false); return }
    let raf = 0, started = performance.now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const A = audio.current
      if (!A.ctx || !A.src || !A.loop) return
      const el = A.ctx.currentTime - A.t0
      setHead(el >= 0 ? el % A.loop : null)
      setBlocked(A.ctx.state !== 'running' && performance.now() - started > 800)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
  // po każdej zmianie pokrętła pętla gra od razu nową wersję
  useEffect(() => {
    if (!playing) { stopSound(); return }
    const id = setTimeout(play, 120)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, tuned])

  useEffect(() => () => { stopSound(); clearInterval(timer.current); meter.stop(); try { audio.current.ctx?.close() } catch (e) {} }, [meter])

  const backToList = () => { setPlaying(false); stopSound(); clearInterval(timer.current); meter.stop(); setTake(null); setStage('list') }

  const record = async (it) => {
    unlockAudio()
    setItem(it); setMsg(''); setPlaying(false); setTake(null); setProgress(0); setStage('wait')
    const ok = await meter.start()
    if (!ok) { setMsg('Brak dostępu do mikrofonu.'); setStage('list'); return }
    const t0 = performance.now()
    clearInterval(timer.current)
    timer.current = setInterval(async () => {
      const st = meter.getInfo().state
      if (st === 'error' || (st !== 'on' && performance.now() - t0 > 6000)) { clearInterval(timer.current); meter.stop(); setMsg('Mikrofon nie oddaje dźwięku. Spróbuj ponownie.'); setStage('list'); return }
      if (st !== 'on') return
      clearInterval(timer.current)
      meter.startTake()
      setStage('rec')
      const r0 = performance.now()
      timer.current = setInterval(async () => {
        const p = (performance.now() - r0) / REC_MS
        setProgress(Math.min(1, p))
        if (p < 1) return
        clearInterval(timer.current)
        setStage('busy')
        const res = await meter.stopTake()
        meter.stop()
        try {
          if (!res?.blob) throw new Error('brak nagrania')
          const ctx = audio.current.ctx || (audio.current.ctx = new (window.AudioContext || window.webkitAudioContext)())
          const ab = await res.blob.arrayBuffer()
          const decoded = await new Promise((ok2, bad) => { const pr = ctx.decodeAudioData(ab, ok2, bad); if (pr && pr.then) pr.then(ok2, bad) })
          const samples = Float32Array.from(decoded.getChannelData(0))
          const A = analyseBuffer(samples, decoded.sampleRate)
          if (!A.segments.length) { setMsg(`Nie znalazłem w nagraniu głoski „${it.sound}”. Nagrajcie jeszcze raz: głośniej i wyraźniej.`); setStage('list'); return }
          // wartości z pomiaru „na żywo” (ta sama skala co w grach) — dopasowane po kolejności, gdy liczba odcinków się zgadza
          const live = (res.segments || []).map(s => s.cog)
          const liveCogs = live.length === A.segments.length ? live : A.segments.map(() => null)
          // domyślnie stroimy odcinek z właściwego miejsca słowa: początek → pierwszy, koniec → ostatni, środek → najdłuższy
          let pick = 0
          if (it.pos === 'koniec') pick = A.segments.length - 1
          else if (it.pos === 'środek') pick = A.segments.reduce((b, s, i) => (s.end - s.start > A.segments[b].end - A.segments[b].start ? i : b), 0)
          setSegIdx(pick); setPitch(toV(1)); setLen(0); setOriginal(false)
          setTake({ samples, sr: decoded.sampleRate, ...A, liveCogs })
          setStage('tune'); setPlaying(false)     // odtwarzanie włącza kliknięcie (inaczej Safari nie puści dźwięku)
        } catch (e) {
          setMsg('Nie udało się odczytać nagrania. Spróbuj jeszcze raz.'); setStage('list')
        }
      }, 50)
    }, 80)
  }

  const save = (tunedByKnob) => {
    if (!tuned || !item) return
    const next = { ...ref, words: { ...ref.words, [item.word]: {
      baseHz: tuned.baseHz, targetHz: tunedByKnob ? tuned.nowHz : tuned.baseHz, ratio: tunedByKnob ? Number(ratio.toFixed(3)) : 1, tuned: !!tunedByKnob, date: new Date().toISOString(),
    } } }
    saveReference(next); setRef(getReference())
    setMsg(`„${item.word}” zapisane: ${tunedByKnob ? tuned.nowHz : tuned.baseHz} Hz.`)
    backToList()
  }

  // ── Strojenie ─────────────────────────────────────────────────────────────
  if (stage === 'tune' && take && item) {
    const total = take.trim.end - take.trim.start
    const changed = Math.abs(ratio - 1) >= 0.02
    return (
      <div className="card">
        <div className="form-label">Wzorzec · {item.sound} · {item.pos} słowa</div>
        <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--primary)', textAlign: 'center' }} data-ref-word>{item.word}</div>

        <TunerCharts take={take} orig={orig} tuned={tuned} segIdx={segIdx} onPick={setSegIdx} head={head} quick={quick} sound={item.sound} />

        <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <button className={`btn ${playing ? 'btn-outline' : 'btn-primary'}`} style={{ flex: 1 }} onClick={() => { unlockAudio(); setPlaying(p => !p) }} data-play>{playing ? '⏸ Zatrzymaj' : '▶ Odtwarzaj w pętli'}</button>
          <button className={`btn ${original ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => { unlockAudio(); setOriginal(o => !o) }} data-original>{original ? 'Gra: oryginał' : 'Gra: strojone'}</button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, minHeight: 20, marginBottom: 6, color: blocked ? 'var(--red)' : playing ? 'var(--green)' : 'var(--muted)' }} data-play-state>
          {blocked ? 'Przeglądarka wstrzymała dźwięk. Kliknij „Zatrzymaj”, a potem „Odtwarzaj w pętli”. Sprawdź też głośność komputera.'
            : playing ? `● Gra w pętli: ${original ? 'oryginał' : 'wersja strojona'}` : 'Kliknij „Odtwarzaj w pętli”, żeby usłyszeć nagranie.'}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', opacity: original ? 0.45 : 1 }}>
          <Knob name="pitch" label="Wysokość głoski" value={pitch} onChange={(v) => { unlockAudio(); setOriginal(false); setPitch(v) }}
            readout={<span data-now-hz={tuned?.nowHz}>{tuned ? `${tuned.baseHz} → ${tuned.nowHz} Hz` : ''}</span>} />
          <Knob name="len" label="Długość głoski" value={len} onChange={(v) => { unlockAudio(); setOriginal(false); setLen(v) }} color="var(--orange)"
            readout={<span data-now-len={tuned?.lenNowMs}>{orig && tuned ? `${orig.lenMs} → ${tuned.lenNowMs} ms` : ''}</span>} />
        </div>
        <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
          W lewo: niżej, w stronę „sz/cz”. W prawo: wyżej, w stronę „s/c”. Nagranie przed strojeniem: ok. {tuned?.baseHz} Hz.
          {quick?.quality === 'good' ? ` Z kalibracji: „sz” ≈ ${quick.szHz} Hz, „s” ≈ ${quick.sHz} Hz.` : ''}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => { setPitch(toV(1)); setLen(0) }}>Wyzeruj pokrętła</button>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-green" style={{ flex: 1, minWidth: 150 }} onClick={() => save(false)} data-save-own>Brzmi dobrze bez strojenia</button>
          <button className="btn btn-primary" style={{ flex: 1, minWidth: 150 }} disabled={!changed} onClick={() => save(true)} data-save-tuned>Zapisz strojone jako wzorzec</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => record(item)}>Nagraj jeszcze raz</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={backToList}>Wróć do listy</button>
        </div>
      </div>
    )
  }

  if (stage === 'wait' || stage === 'rec' || stage === 'busy') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="form-label">Wzorzec · nagranie</div>
        <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--primary)' }}>{item?.word}</div>
        <div style={{ fontSize: 16, fontWeight: 800, margin: '8px 0', color: stage === 'rec' ? 'var(--red)' : 'var(--muted)' }} data-rec-state={stage}>
          {stage === 'wait' ? 'Cisza przez chwilę. Słucham pokoju…' : stage === 'rec' ? '● Nagrywam. Powiedz słowo raz, wyraźnie.' : 'Przetwarzam nagranie…'}
        </div>
        <div className="progress-wrap dark" style={{ height: 10 }}><div className="progress-fill" style={{ width: `${progress * 100}%`, background: 'var(--red)', transition: 'width .05s linear' }} /></div>
        <button className="btn btn-ghost btn-full mt-12" onClick={backToList}>Przerwij</button>
      </div>
    )
  }

  // ── Lista słów ────────────────────────────────────────────────────────────
  const range = (r) => (r ? (r.min === r.max ? `${r.min} Hz` : `${r.min}–${r.max} Hz`) : 'brak')
  return (
    <div className="card">
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 10px' }}>
        Przy każdym słowie: <b>Nagraj</b> → słowo gra w pętli → jeśli brzmi czysto, kliknij „Brzmi dobrze”; jeśli nie,
        ustaw pokrętłem czyste brzmienie i zapisz. Można przerwać, każde słowo zapisuje się osobno.
      </p>
      {msg && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--active-bg)', fontWeight: 700, fontSize: 14, marginBottom: 10 }} data-ref-msg>{msg}</div>}

      {['sz', 'cz', 's', 'c'].map(sound => (
        <div key={sound} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>„{sound}”</div>
          {REFERENCE_WORDS.filter(w => w.sound === sound).map(w => {
            const r = ref.words[w.word]
            return (
              <div key={w.word} data-ref-row={w.word} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700 }}>{w.word}</span> <span className="text-muted" style={{ fontSize: 12 }}>· {w.pos}</span>
                  <div style={{ fontSize: 12, color: r ? (r.tuned ? 'var(--orange)' : 'var(--green)') : 'var(--muted)' }}>
                    {r ? (r.tuned ? `strojone: ${r.baseHz} → ${r.targetHz} Hz` : `brzmi dobrze: ${r.targetHz} Hz`) : 'jeszcze nie nagrane'}
                  </div>
                </div>
                <button className={`btn btn-sm ${r ? 'btn-outline' : 'btn-primary'}`} onClick={() => record(w)} data-rec={w.word}>{r ? 'Powtórz' : 'Nagraj'}</button>
              </div>
            )
          })}
        </div>
      ))}

      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--soft)', fontSize: 13, lineHeight: 1.6 }} data-ref-summary>
        <div style={{ fontWeight: 800 }}>Wzorzec: {summary.done} z {summary.total} słów</div>
        <div>„sz / cz”: {range(summary.sz)} · „s / c”: {range(summary.s)}</div>
        {summary.hz != null && <div>Próg pośrodku: {summary.hz} Hz, odstęp {summary.gap} Hz{summary.quality === 'narrow' ? ' (za mały, wzorzec niepewny)' : summary.quality === 'few' ? ' (potrzeba min. 2 słów z każdej grupy)' : ''}.</div>}
        <div className="text-muted" style={{ fontSize: 12 }}>
          Pomarańczowe słowa wymagały strojenia: tam głoska dziecka odbiega od czystego brzmienia.
        </div>
      </div>

      {summary.quality === 'good' && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 14, fontWeight: 700 }}>
          <input type="checkbox" checked={!!ref.active} data-ref-active onChange={e => { const n = { ...ref, active: e.target.checked }; saveReference(n); setRef(getReference()) }} />
          Używaj tego wzorca jako progu w grach (zamiast progu z kalibracji)
        </label>
      )}
      {summary.done > 0 && (
        <button className="btn btn-sm" style={{ marginTop: 10, background: '#FEF2F2', color: 'var(--red)' }} onClick={() => {
          if (!window.confirm('Skasować cały wzorzec na tym urządzeniu?')) return
          clearReference(); setRef(getReference()); setMsg('Wzorzec skasowany.')
        }}>Skasuj wzorzec</button>
      )}
    </div>
  )
}

// jeden miernik na cały ekran
function useMeterOnce() { return useSibilantMeter() }

// Dwa wykresy ze wspólną osią czasu:
//   1. GŁOŚNOŚĆ słowa w czasie (szary = oryginał, kolor = wersja strojona). Pola pokazują, gdzie jest głoska.
//   2. WYSOKOŚĆ SZUMU głoski w czasie: każda kropka to ok. 5 ms (szare = oryginał, kolorowe = po strojeniu).
// Pionowa kreska to miejsce, które właśnie gra.
function TunerCharts({ take, orig, tuned, segIdx, onPick, head, quick, sound }) {
  if (!orig || !tuned) return null
  const W = 600, H1 = 90, H2 = 150, PADL = 44
  const T = Math.max(orig.dur, tuned.durNow, 0.2)
  const x = (t) => PADL + (t / T) * (W - PADL - 6)
  const maxEnv = Math.max(...orig.env, ...tuned.envNow, 1e-6)
  const area = (env, dur) => {
    if (!env.length) return ''
    const pts = env.map((v, i) => [x((i / env.length) * dur), (v / maxEnv) * (H1 / 2 - 4)])
    return 'M' + pts.map(p => `${p[0].toFixed(1)} ${(H1 / 2 - p[1]).toFixed(1)}`).join(' L') + ' L' + pts.reverse().map(p => `${p[0].toFixed(1)} ${(H1 / 2 + p[1]).toFixed(1)}`).join(' L') + ' Z'
  }
  const F0 = 2000, F1 = 11000
  const y = (hz) => 8 + (1 - (Math.max(F0, Math.min(F1, hz)) - F0) / (F1 - F0)) * (H2 - 16)
  const nowT0 = tuned.segStart / take.sr, nowT1 = tuned.segEnd / take.sr
  const changed = Math.abs(tuned.nowHz - tuned.baseHz) > 30 || Math.abs(tuned.lenNowMs - orig.lenMs) > 8
  const headX = head != null && head <= T ? x(head) : null
  const lines = quick?.quality === 'good' ? [['„s” z kalibracji', quick.sHz, '#EA580C'], ['„sz” z kalibracji', quick.szHz, '#2563EB']] : []
  return (
    <div style={{ margin: '10px 0 4px' }} data-tuner-charts>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)' }}>GŁOŚNOŚĆ SŁOWA W CZASIE</div>
      <svg viewBox={`0 0 ${W} ${H1}`} width="100%" style={{ display: 'block', background: 'var(--soft)', borderRadius: 10 }}>
        {take.segments.map((sg, i) => {
          const a = x((sg.start - take.trim.start) / take.sr), b = x((sg.end - take.trim.start) / take.sr)
          return <rect key={i} x={a} y="2" width={Math.max(3, b - a)} height={H1 - 4} rx="3" onClick={() => onPick(i)} data-seg={i} style={{ cursor: 'pointer' }}
            fill={i === segIdx ? 'rgba(148,163,184,.28)' : 'rgba(148,163,184,.12)'} stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="5 4" />
        })}
        {changed && <rect x={x(nowT0)} y="2" width={Math.max(3, x(nowT1) - x(nowT0))} height={H1 - 4} rx="3" fill="rgba(99,102,241,.22)" stroke="#6366F1" strokeWidth="2" pointerEvents="none" />}
        <path d={area(orig.env, orig.dur)} fill="#64748B" opacity="0.38" pointerEvents="none" />
        {changed && <path d={area(tuned.envNow, tuned.durNow)} fill="#6366F1" opacity="0.5" pointerEvents="none" />}
        {headX != null && <line x1={headX} x2={headX} y1="0" y2={H1} stroke="#EF4444" strokeWidth="2.5" />}
      </svg>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginTop: 8 }}>WYSOKOŚĆ SZUMU GŁOSKI „{sound}” W CZASIE (każda kropka = ok. 5 ms)</div>
      <svg viewBox={`0 0 ${W} ${H2}`} width="100%" style={{ display: 'block', background: 'var(--soft)', borderRadius: 10 }}>
        {[3000, 5000, 7000, 9000].map(hz => (
          <g key={hz}><line x1={PADL} x2={W - 6} y1={y(hz)} y2={y(hz)} stroke="var(--border)" strokeWidth="1" /><text x={PADL - 6} y={y(hz) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{hz / 1000} kHz</text></g>
        ))}
        {lines.map(([label, hz, col]) => (
          <g key={label}><line x1={PADL} x2={W - 6} y1={y(hz)} y2={y(hz)} stroke={col} strokeWidth="1.5" strokeDasharray="6 5" opacity="0.8" /><text x={W - 10} y={y(hz) - 4} textAnchor="end" fontSize="11" fontWeight="700" fill={col}>{label}</text></g>
        ))}
        {orig.track.map((d, i) => <circle key={'o' + i} cx={x(d.t)} cy={y(d.hz)} r="3.2" fill="#64748B" opacity={changed ? 0.4 : 0.85} />)}
        {changed && tuned.trackNow.map((d, i) => <circle key={'n' + i} cx={x(d.t)} cy={y(d.hz)} r="3.2" fill="#6366F1" />)}
        {/* średnie: linia przerywana = oryginał, ciągła = po strojeniu */}
        <line x1={x(orig.segT0)} x2={x(orig.segT1)} y1={y(tuned.baseHz)} y2={y(tuned.baseHz)} stroke="#475569" strokeWidth="2" strokeDasharray="4 3" />
        {changed && <line x1={x(nowT0)} x2={x(nowT1)} y1={y(tuned.nowHz)} y2={y(tuned.nowHz)} stroke="#4338CA" strokeWidth="2.5" />}
        {headX != null && <line x1={headX} x2={headX} y1="0" y2={H2} stroke="#EF4444" strokeWidth="2.5" />}
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, marginTop: 4 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: '#64748B', opacity: 0.6, marginRight: 4 }} />oryginał: {tuned.baseHz} Hz, {orig.lenMs} ms</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: '#6366F1', marginRight: 4 }} />po strojeniu: {tuned.nowHz} Hz, {tuned.lenNowMs} ms</span>
      </div>
      <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
        Liczba w Hz to średnia z kropek w zaznaczonym polu. {take.segments.length > 1 ? 'W słowie są dwa szumy: kliknij pole z właściwą głoską. ' : ''}Czerwona kreska pokazuje, co teraz gra.
      </div>
    </div>
  )
}
