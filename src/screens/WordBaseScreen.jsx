// Mikrofon → Słowa: baza własnych słów do okna starannej mowy.
//
// Cztery kroki, każdy osobno i w dowolnej chwili do powtórzenia:
//   1. LISTA      — które słowa monitorujemy (lista startowa + własne).
//   2. NAGRANIE   — każde słowo trzy razy, starannie. Aplikacja zapamiętuje kształt słowa, nie dźwięk.
//   3. TEST       — to samo słowo w środku zdania, trzy zdania na słowo. Z testu wychodzi trafność
//                   i dostrojony próg; słowa, których aplikacja nie wyłapuje pewnie, są wyłączane.
//   4. WZORZEC PROPORCJI — sześć starannie przeczytanych zdań: ile jest głosek szumiących wśród
//                   wszystkich szumów. Okno starannej mowy porównuje z tym swoją proporcję.
//
// Wszystko dotyczy tej osoby i tego urządzenia. Dźwięk nie jest zapisywany.

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter, analyseFrames } from './games/useSibilantMeter'
import { createUtteranceReader } from './games/utterance'
import {
  featuresFromFrames, intraDistance, tuneFromTest, judgeWord, hissCounts, trimToSpeech,
} from '../data/wordSpotter'
import {
  useWordBase, GROUPS, CARRIERS, BASELINE_SENTENCES, TAKES_PER_WORD, addWord, removeWord, setWordEnabled,
  wordState, STATE_LABEL, modeOf, canStem, setWordMode, applyMode, TEST_FORMS, stemOf, loadAllModels, storeModels, recalibrateUntested, saveBaseline, getUsableThreshold, saveWords, DEFAULT_WORDS,
} from '../data/wordBase'

const MIN_WORD_MS = 180, MAX_WORD_MS = 2500
const STATE_COLOR = { none: 'var(--muted)', weak: 'var(--red)', untested: 'var(--yellow)', ok: 'var(--green)' }
const pct = (x) => `${Math.round(x * 100)}%`

function WordList({ words, models, onRecordOne }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const add = () => {
    const r = addWord(draft)
    if (r.ok) { setDraft(''); setError('') } else setError(r.error)
  }
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>1. Lista słów</div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Zaznaczone słowa aplikacja wyłapuje w oknie starannej mowy. Dopisz słowa z życia ćwiczącego: imiona, ulubione gry, jedzenie.
        Przy słowie jest przełącznik: „rdzeń” łapie też odmiany („szkoła”, „szkoły”, „szkole”), „całe” tylko dokładnie tę formę.
        Wyszarzona końcówka to część, której aplikacja nie porównuje. Zmiana przełącznika kasuje wynik testu tego słowa.
      </p>
      {GROUPS.map(g => {
        const list = words.filter(w => w.group === g.id)
        if (!list.length) return null
        return (
          <div key={g.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>GŁOSKA {g.label.toUpperCase()}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {list.map(w => {
                const st = wordState(models[w.word])
                return (
                  <span key={w.word} data-word={w.word} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10,
                    background: 'var(--soft)', opacity: w.enabled ? 1 : 0.55, fontSize: 14, fontWeight: 700 }}>
                    <input type="checkbox" checked={!!w.enabled} onChange={e => setWordEnabled(w.word, e.target.checked)} aria-label={`Monitoruj ${w.word}`} />
                    {modeOf(w) === 'stem' ? <span>{stemOf(w.word).text}<span style={{ opacity: .45 }}>{w.word.slice(stemOf(w.word).text.length)}</span></span> : w.word}
                    {canStem(w.word) && (
                      <button className="btn btn-ghost btn-sm" style={{ padding: '0 5px', minHeight: 0, fontSize: 11, color: modeOf(w) === 'stem' ? 'var(--primary)' : 'var(--muted)' }}
                        title={modeOf(w) === 'stem' ? 'Rdzeń: łapie też odmiany. Kliknij, żeby dopasowywać całe słowo.' : 'Całe słowo. Kliknij, żeby łapać też odmiany (rdzeń).'}
                        data-mode={modeOf(w)} onClick={() => setWordMode(w.word, modeOf(w) === 'stem' ? 'whole' : 'stem')}>
                        {modeOf(w) === 'stem' ? 'rdzeń' : 'całe'}
                      </button>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATE_COLOR[st] }}>
                      {STATE_LABEL[st]}{models[w.word]?.test ? ` ${models[w.word].test.hits}/${models[w.word].test.trials}` : ''}
                    </span>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', minHeight: 0 }} title="Nagraj to słowo od nowa" onClick={() => onRecordOne(w.word)}>●</button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', minHeight: 0 }} title="Usuń z listy"
                      onClick={() => { if (window.confirm(`Usunąć „${w.word}” z listy razem z nagraniami?`)) removeWord(w.word) }}>✕</button>
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input className="form-input" style={{ marginBottom: 0 }} placeholder="Dopisz słowo, np. Szymon" value={draft}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
        <button className="btn btn-primary" onClick={add}>Dodaj</button>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{error}</div>}
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
        onClick={() => { if (window.confirm('Przywrócić listę startową? Własne słowa znikną z listy (nagrania zostają).')) saveWords(DEFAULT_WORDS) }}>
        Przywróć listę startową
      </button>
    </div>
  )
}

export default function WordBaseScreen() {
  const { words, models, baseline } = useWordBase()
  const meter = useSibilantMeter()
  const [flow, setFlow]   = useState(null)        // null | 'record' | 'test' | 'baseline'
  const [mic, setMic]     = useState('off')       // off | starting | on | error
  const [step, setStep]   = useState({ idx: 0, take: 0 })
  const [flash, setFlash] = useState('')
  const [report, setReport] = useState(null)
  const d = useRef({ queue: [], reader: null, takes: [], rejects: 0, trials: [], fresh: {}, sz: 0, s: 0, timer: null, busy: false })

  const threshold = getUsableThreshold()
  const enabled = words.filter(w => w.enabled)
  const recorded = enabled.filter(w => wordState(models[w.word]) !== 'none')
  const counts = { ok: 0, untested: 0, weak: 0, none: 0 }
  enabled.forEach(w => { counts[wordState(models[w.word])]++ })

  const stopAll = () => {
    clearInterval(d.current.timer); d.current.timer = null
    meter.stop(); setMic('off'); setFlow(null); setFlash('')
  }
  useEffect(() => () => { clearInterval(d.current.timer); meter.stop() }, [meter])

  const begin = async (kind, queue) => {
    if (!queue.length) return
    setReport(null); setFlash(''); setMic('starting'); setFlow(kind)
    Object.assign(d.current, { queue, takes: [], rejects: 0, trials: [], fresh: {}, sz: 0, s: 0, busy: false })
    setStep({ idx: 0, take: 0 })
    const ok = await meter.start()
    if (!ok) { setMic('error'); return }
    // czekamy na koniec pomiaru tła (cisza!)
    const wait = setInterval(() => {
      if (meter.getInfo().state !== 'on') return
      clearInterval(wait)
      d.current.reader = createUtteranceReader(meter)
      setMic('on')
      d.current.timer = setInterval(() => tickRef.current(), 80)
    }, 60)
  }

  // ── Zakończenia przepływów ─────────────────────────────────────────────────
  const finishRecord = () => {
    const all = loadAllModels()
    const fresh = d.current.fresh
    for (const [w, m] of Object.entries(fresh)) {                   // nowe nagranie zastępuje stare razem z wynikiem testu
      const entry = words.find(x => x.word === w)
      all[w] = applyMode(m, w, entry ? modeOf(entry) : 'whole')
    }
    if (Object.keys(fresh).length) { recalibrateUntested(all); storeModels(all) }
    setReport({ kind: 'record', n: Object.keys(fresh).length })
    stopAll()
  }
  const finishTest = () => {
    const all = loadAllModels()
    const trials = d.current.trials
    if (trials.length) {
      const tested = new Set(trials.map(t => t.word))
      const subset = {}
      // stroimy tylko słowa, które były w teście; pozostałe wzorce służą jako tło ("próby ujemne" są ze zdań)
      for (const w of tested) if (all[w]) subset[w] = all[w]
      tuneFromTest(subset, trials)
      storeModels(all)
      const rows = [...tested].filter(w => subset[w]).map(w => ({ word: w, ...subset[w].test }))
      const hits = rows.reduce((s, r) => s + r.hits, 0), total = rows.reduce((s, r) => s + r.trials, 0)
      setReport({ kind: 'test', rows, hits, total })
    }
    stopAll()
  }
  const finishBaseline = () => {
    const b = saveBaseline(d.current.sz, d.current.s)
    setReport({ kind: 'baseline', ok: !!b, share: b?.share, n: d.current.sz + d.current.s })
    stopAll()
  }

  const next = () => {
    const D = d.current
    D.takes = []; D.rejects = 0
    setFlash('')
    const idx = stepRef.current.idx + 1
    if (idx >= D.queue.length) {
      if (flowRef.current === 'record') finishRecord(); else if (flowRef.current === 'test') finishTest(); else finishBaseline()
      return
    }
    const ns = { idx, take: 0 }
    stepRef.current = ns
    setStep(ns)
  }

  // ── Obsługa jednej wypowiedzi ──────────────────────────────────────────────
  const tick = () => {
    const D = d.current
    if (!D.reader || D.busy) return
    const u = D.reader.poll()
    if (!u) return
    const item = D.queue[stepRef.current.idx]
    if (!item) return
    const durMs = u[u.length - 1].t
    const segs = analyseFrames(u)
    if (flowRef.current === 'record') {
      if (durMs < MIN_WORD_MS) return
      if (durMs > MAX_WORD_MS) { setFlash('Za długo. Powiedz samo słowo.'); return }
      const tr = trimToSpeech(u)
      const f = featuresFromFrames(tr)
      if (!f) return
      // nagranie wzorca ma być STARANNE: jeśli miernik słyszy „s” zamiast „sz”, prosimy o powtórkę (najwyżej 2 razy)
      if (threshold && D.rejects < 2 && judgeWord(segs, item, 0, durMs, threshold).verdict === 'fail') {
        D.rejects++
        setFlash('Zabrzmiało jak „s”. Jeszcze raz, powoli i starannie.')
        return
      }
      D.takes.push(f.feat)
      if (D.takes.length >= TAKES_PER_WORD) {
        D.fresh[item] = { takes: D.takes, intra: intraDistance(D.takes), date: new Date().toISOString() }
        next()
      } else { setFlash(''); setStep(prev => ({ ...prev, take: D.takes.length })) }
    } else if (flowRef.current === 'test') {
      if (durMs < 600) { setFlash('Przeczytaj całe zdanie.'); return }
      const f = featuresFromFrames(u)
      if (!f) return
      D.trials.push({ word: item.word, feat: f.feat })
      next()
    } else if (flowRef.current === 'baseline') {
      if (durMs < 800) { setFlash('Przeczytaj całe zdanie.'); return }
      const c = hissCounts(segs, threshold)
      D.sz += c.sz; D.s += c.s
      next()
    }
  }
  const tickRef = useRef(tick); tickRef.current = tick
  const flowRef = useRef(flow); flowRef.current = flow
  const stepRef = useRef(step); stepRef.current = step

  // ── Kolejki ────────────────────────────────────────────────────────────────
  const startRecord = (onlyMissing) => begin('record', enabled.filter(w => !onlyMissing || wordState(models[w.word]) === 'none').map(w => w.word))
  const startTest = () => {
    const q = []
    // to samo słowo nigdy dwa razy z rzędu; w trybie „rdzeń” ostatnie zdanie jest z odmianą słowa
    CARRIERS.forEach((c, k) => recorded.forEach(w => {
      const form = k === CARRIERS.length - 1 && modeOf(w) === 'stem' && TEST_FORMS[w.word]
      q.push({ word: w.word, shown: form || w.word, text: c })
    }))
    begin('test', q)
  }
  const startBaseline = () => begin('baseline', BASELINE_SENTENCES)

  // ── Widok przepływu ────────────────────────────────────────────────────────
  if (flow) {
    const D = d.current
    const item = D.queue[step.idx]
    const total = D.queue.length
    const title = flow === 'record' ? 'Nagrywanie wzorców' : flow === 'test' ? 'Test trafności' : 'Wzorzec proporcji'
    const finish = flow === 'record' ? finishRecord : flow === 'test' ? finishTest : finishBaseline
    return (
      <div className="card" data-flow={flow}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          <div className="text-muted" style={{ fontSize: 13 }} data-progress>{Math.min(step.idx + 1, total)} / {total}</div>
        </div>
        {mic === 'starting' && <p style={{ marginTop: 16, fontWeight: 700 }}>Cisza przez chwilę: mierzę tło…</p>}
        {mic === 'error' && <p style={{ marginTop: 16, color: 'var(--red)', fontWeight: 700 }}>Mikrofon jest niedostępny. Sprawdź uprawnienia przeglądarki.</p>}
        {mic === 'on' && item && (
          <div style={{ textAlign: 'center', padding: '22px 0 10px' }}>
            {flow === 'record' && (<>
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 6 }}>Powiedz starannie samo słowo</div>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: .5 }} data-item>{item}</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
                {Array.from({ length: TAKES_PER_WORD }, (_, i) => (
                  <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: i < step.take ? 'var(--green)' : 'var(--soft)', border: '2px solid var(--border)' }} />
                ))}
              </div>
            </>)}
            {flow === 'test' && (<>
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>Przeczytaj całe zdanie, zwyczajnie, jak w rozmowie</div>
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.4 }} data-item>
                {item.text.split('{w}')[0]}<span style={{ color: 'var(--primary)', fontWeight: 800 }}>{item.shown || item.word}</span>{item.text.split('{w}')[1]}
              </div>
            </>)}
            {flow === 'baseline' && (<>
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>Przeczytaj starannie całe zdanie</div>
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.4 }} data-item>{item}</div>
            </>)}
            <div style={{ minHeight: 22, marginTop: 14, color: 'var(--yellow)', fontWeight: 700, fontSize: 14 }}>{flash}</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {mic === 'on' && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={next}>Pomiń</button>}
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={mic === 'on' ? finish : stopAll}>Zakończ i zapisz</button>
        </div>
      </div>
    )
  }

  // ── Widok główny ───────────────────────────────────────────────────────────
  return (
    <div>
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Baza słów do okna starannej mowy</div>
        <p style={{ fontSize: 14, lineHeight: 1.55 }}>
          Włączonych słów: <b>{enabled.length}</b>. Pewne: <b style={{ color: 'var(--green)' }}>{counts.ok}</b>,
          bez testu: <b>{counts.untested}</b>, niepewne: <b style={{ color: counts.weak ? 'var(--red)' : undefined }}>{counts.weak}</b>,
          bez nagrań: <b>{counts.none}</b>.
        </p>
        {!threshold && (
          <p style={{ fontSize: 13, color: 'var(--yellow)', fontWeight: 700, marginTop: 6 }}>
            Najpierw zrób kalibrację mikrofonu (zakładka Kalibracja). Bez niej aplikacja znajdzie słowa, ale nie oceni głosek.
          </p>
        )}
      </div>

      {report?.kind === 'record' && (
        <div className="card" style={{ marginBottom: 10, borderLeft: '4px solid var(--green)' }} data-report="record">
          Zapisano wzorce: <b>{report.n}</b>. Teraz zrób test trafności (krok 3), żeby sprawdzić, które słowa aplikacja wyłapuje w zdaniu.
        </div>
      )}
      {report?.kind === 'test' && (
        <div className="card" style={{ marginBottom: 10, borderLeft: '4px solid var(--primary)' }} data-report="test">
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Wynik testu: {report.hits} z {report.total} zdań ({report.total ? pct(report.hits / report.total) : '—'})</div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            {report.rows.map(r => (
              <span key={r.word} style={{ display: 'inline-block', marginRight: 12, color: r.hits >= Math.min(2, r.trials) ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                {r.word} {r.hits}/{r.trials}
              </span>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Słowa z wynikiem poniżej 2 trafień są oznaczone jako niepewne i nie liczą się w oknie starannej mowy.
            Można je nagrać od nowa (kropka przy słowie) i powtórzyć test.
          </p>
        </div>
      )}
      {report?.kind === 'baseline' && (
        <div className="card" style={{ marginBottom: 10, borderLeft: `4px solid ${report.ok ? 'var(--green)' : 'var(--yellow)'}` }} data-report="baseline">
          {report.ok
            ? <>Wzorzec zapisany: głoski szumiące to <b>{pct(report.share)}</b> ocenionych szumów ({report.n} głosek).</>
            : <>Za mało ocenionych głosek ({report.n}). Przeczytajcie zdania jeszcze raz, bliżej mikrofonu.</>}
        </div>
      )}

      <WordList words={words} models={models} onRecordOne={(w) => begin('record', [w])} />

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>2. Nagranie wzorców</div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Każde słowo {TAKES_PER_WORD} razy, starannie, w ciszy, z tej samej odległości co w oknie starannej mowy. Około 10 sekund na słowo.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!counts.none} onClick={() => startRecord(true)} data-act="record-missing">Nagraj brakujące ({counts.none})</button>
          <button className="btn btn-ghost" disabled={!enabled.length} onClick={() => { if (window.confirm('Nagrać wszystkie włączone słowa od nowa?')) startRecord(false) }}>Nagraj wszystkie od nowa</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>3. Test trafności</div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Każde nagrane słowo w trzech zdaniach ({recorded.length * CARRIERS.length} zdań, około {Math.max(1, Math.round(recorded.length * CARRIERS.length * 5 / 60))} min).
          Test dostraja wyłapywanie do mowy w zdaniu i pokazuje, które słowa działają.
        </p>
        <button className="btn btn-primary" disabled={recorded.length < 2} onClick={startTest} data-act="test">Zacznij test</button>
        {recorded.length < 2 && <span className="text-muted" style={{ fontSize: 12, marginLeft: 10 }}>Potrzebne co najmniej 2 nagrane słowa.</span>}
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>4. Wzorzec proporcji</div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Sześć starannie przeczytanych zdań. Aplikacja zapamięta, jaka część szumów to głoski szumiące, i będzie z tym porównywać okno starannej mowy.
          {baseline ? ` Obecny wzorzec: ${pct(baseline.share)} (${new Date(baseline.date).toLocaleDateString('pl-PL')}).` : ' Wzorca jeszcze nie ma.'}
        </p>
        <button className="btn btn-primary" disabled={!threshold} onClick={startBaseline} data-act="baseline">Nagraj wzorzec</button>
      </div>
    </div>
  )
}
