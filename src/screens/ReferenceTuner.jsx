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
import { analyseBuffer, renderTuned, cogOf } from './games/sibilantDsp'
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
    return { ...r, baseHz: base, nowHz: Math.round(base * (before > 0 ? after / before : 1)) }
  }, [take, seg, segIdx, ratio, stretch, original])

  const stopSound = () => { try { audio.current.src?.stop() } catch (e) {} audio.current.src = null }
  const play = () => {
    if (!tuned) return
    stopSound()
    const ctx = audio.current.ctx || (audio.current.ctx = new (window.AudioContext || window.webkitAudioContext)())
    try { ctx.resume() } catch (e) {}
    const gapN = Math.round(0.45 * take.sr)                       // przerwa między powtórzeniami
    const buf = ctx.createBuffer(1, tuned.samples.length + gapN, take.sr)
    buf.getChannelData(0).set(tuned.samples)
    const src = ctx.createBufferSource()
    src.buffer = buf; src.loop = true; src.connect(ctx.destination); src.start()
    audio.current.src = src
  }
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
          setStage('tune'); setPlaying(true)
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

        {/* pasek nagrania: kolorowe pole = głoska, którą stroi pokrętło (kliknij inne pole, żeby je wybrać) */}
        <div style={{ position: 'relative', height: 64, margin: '10px 0 4px', background: 'var(--soft)', borderRadius: 10, overflow: 'hidden' }}>
          {take.segments.map((s, i) => (
            <div key={i} onClick={() => setSegIdx(i)} data-seg={i} title="Stroimy tę głoskę"
              style={{ position: 'absolute', top: 0, bottom: 0, left: `${((s.start - take.trim.start) / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%`,
                background: i === segIdx ? 'rgba(99,102,241,.35)' : 'rgba(148,163,184,.3)', borderLeft: '2px solid var(--primary)', borderRight: '2px solid var(--primary)', cursor: 'pointer' }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 1, padding: '0 2px', pointerEvents: 'none' }}>
            {take.envelope.map((v, i) => { const m = Math.max(...take.envelope) || 1; return <div key={i} style={{ flex: 1, height: `${Math.max(3, (v / m) * 100)}%`, background: 'var(--text)', opacity: 0.55, borderRadius: 1 }} /> })}
          </div>
        </div>
        <div className="text-muted" style={{ fontSize: 12, textAlign: 'center' }}>
          Kolorowe pole to głoska „{item.sound}”. Pokrętło zmienia tylko ją.{take.segments.length > 1 ? ' W słowie są dwa szumy: kliknij ten właściwy.' : ''}
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <button className={`btn ${playing ? 'btn-outline' : 'btn-primary'}`} style={{ flex: 1 }} onClick={() => setPlaying(p => !p)} data-play>{playing ? '⏸ Zatrzymaj' : '▶ Odtwarzaj w pętli'}</button>
          <button className={`btn ${original ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setOriginal(o => !o)} data-original>{original ? 'Gra: oryginał' : 'Gra: strojone'}</button>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', opacity: original ? 0.45 : 1 }}>
          <Knob name="pitch" label="Wysokość głoski" value={pitch} onChange={(v) => { setOriginal(false); setPitch(v) }}
            readout={<span data-now-hz={tuned?.nowHz}>{tuned ? `teraz ok. ${tuned.nowHz} Hz` : ''}</span>} />
          <Knob name="len" label="Długość głoski" value={len} onChange={(v) => { setOriginal(false); setLen(v) }} color="var(--orange)"
            readout={`× ${stretch.toFixed(1)}`} />
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
