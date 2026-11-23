// Kalibracja mikrofonu — JEDNA ścieżka krok po kroku. Mówi dziecko, dorosły siedzi obok i klika.
//
//   Krok 1. Głośność          — sprawdzamy, czy mikrofon dobrze słyszy (robi się samo przed każdym krokiem).
//   Krok 2. Długie „s” i „sz” — z tego powstaje próg; po tym kroku gry już oceniają głoski.
//   Krok 3. Sylaby            — sa, sza, su, szu, ca, cza, cy, czy: próg dopasowany do krótkich głosek.
//   Krok 4. Słowa             — dziecko mówi słowo, DOROSŁY zaznacza, czy powiedziało dobrze, czy źle.
//                               Trafność = jak często aplikacja oceniła tak samo jak dorosły.
//
// Każdy krok zapisuje się od razu (razem z surowymi pomiarami), więc można przerwać i wrócić innego dnia.
// W kroku 4 powtarza się tylko słowa, przy których aplikacja i dorosły się nie zgodzili.
// Przy każdej próbie widać pasek głośności i komunikat, co poprawić (za cicho / nie słychać głoski).

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter, analyseFrames } from './games/useSibilantMeter'
import { createUtteranceReader } from './games/utterance'
import { computeQuickProfile, saveQuickProfile, getQuickProfile } from '../data/patternStore'
import { parseSibilants, judgeUtterance } from '../data/sibilants'

const NEED_FRAMES = 90        // ok. 1,5 s czystego szumu
const VOL_OK_DB = 12          // tyle dB ponad tło uznajemy za dobrą głośność
const VOL_NEED_MS = 900       // przez tyle czasu głos ma być wystarczająco głośny
const SUSTAIN = {
  s:  { say: 'ssssss',   hint: 'Zęby razem, uśmiech, język za dolnymi zębami. Syczymy jak wąż.' },
  sz: { say: 'szszszsz', hint: 'Dzióbek, język uniesiony do góry. Szumimy jak wiatr.' },
}
const SYLLABLES = [
  { say: 'sa', cls: 's' }, { say: 'sza', cls: 'sz' }, { say: 'su', cls: 's' }, { say: 'szu', cls: 'sz' },
  { say: 'ca', cls: 's' }, { say: 'cza', cls: 'sz' }, { say: 'cy', cls: 's' }, { say: 'czy', cls: 'sz' },
]
const TEST_WORDS = ['sok', 'szok', 'kasa', 'kasza', 'czapka', 'soczek']
const TARGET = 5              // cel: zgodność w 5 z 6 słów
const SYLLABLE_WEIGHT = 8     // jedna sylaba liczy się jak 8 ramek przeciągniętej głoski
const pct = (v) => `${Math.round(v * 100)}%`

// Pasek głośności: zielona strefa = dobrze słychać
function LevelBar({ db }) {
  const w = Math.max(0, Math.min(1, db / 30))
  const ok = db >= VOL_OK_DB
  return (
    <div style={{ margin: '10px 0 4px' }} data-level={Math.round(db)}>
      <div style={{ position: 'relative', height: 14, borderRadius: 7, background: 'var(--soft)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ position: 'absolute', left: `${(VOL_OK_DB / 30) * 100}%`, right: 0, top: 0, bottom: 0, background: 'rgba(34,197,94,.18)' }} />
        <div style={{ width: `${w * 100}%`, height: '100%', background: ok ? 'var(--green)' : 'var(--orange)', transition: 'width .08s linear' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
        <span>cicho</span><span>dobrze słychać</span>
      </div>
    </div>
  )
}

export default function QuickMicCalibration() {
  const meter = useSibilantMeter()
  // home | noise | vol | s | sz | syll | test | judge | result | error
  const [stage, setStage] = useState('home')
  const [progress, setProgress] = useState(0)
  const [idx, setIdx] = useState(0)
  const [flash, setFlash] = useState('')
  const [level, setLevel] = useState(0)
  const [fails, setFails] = useState(0)
  const [note, setNote] = useState('')            // komunikat na ekranie głównym po zakończonym kroku
  const [bad, setBad] = useState(null)            // nieudany pomiar kroku 2 (nie zapisany)
  const [saved, setSaved] = useState(getQuickProfile())
  const [queue, setQueue] = useState(TEST_WORDS)  // słowa do powiedzenia w kroku 4
  const [words, setWords] = useState({})          // { słowo: { sys, adult, agree } }
  const d = useRef({ s: [], sz: [], lastT: 0, reader: null, profile: null, goal: 'sustain', volMs: 0, quietSince: 0, peak: 0, pending: null, waitSince: 0 })
  const stageRef = useRef(stage); stageRef.current = stage
  const idxRef = useRef(idx); idxRef.current = idx
  const queueRef = useRef(queue); queueRef.current = queue

  useEffect(() => () => meter.stop(), [meter])

  const persist = (profile) => { saveQuickProfile(profile); setSaved(getQuickProfile()) }
  const goHome = (msg = '') => { meter.stop(); setNote(msg); setFlash(''); setStage('home') }

  // ── Pętla pomiaru ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const st = stageRef.current, D = d.current
      const now = performance.now()
      if (st === 'home' || st === 'result' || st === 'error' || st === 'judge') return
      if (st === 'noise') {
        if (meter.getInfo().state === 'on') { D.lastT = now; D.volMs = 0; D.waitSince = now; setStage('vol') }
        return
      }

      // głośność z ostatnich 250 ms (do paska) i z całej próby (do podpowiedzi)
      const frames = meter.getFrames()
      let lv = 0
      for (let k = frames.length - 1; k >= 0 && now - frames[k].t < 250; k--) lv = Math.max(lv, frames[k].lvl || 0)
      setLevel(lv)
      D.peak = Math.max(D.peak, lv)

      if (st === 'vol') {
        for (const f of frames) { if (f.t <= D.lastT) continue; const dt = Math.min(60, f.t - D.lastT); D.lastT = f.t; if ((f.lvl || 0) >= VOL_OK_DB) D.volMs += dt }
        setProgress(Math.min(1, D.volMs / VOL_NEED_MS))
        if (D.volMs >= VOL_NEED_MS) { beginGoal(); return }
        if (now - D.waitSince > 5000) setFlash(D.peak < 4 ? 'Nic nie słyszę. Sprawdź, czy mikrofon jest włączony, i powiedz głośno.' : 'Za cicho. Usiądź bliżej mikrofonu (20–30 cm) albo mów głośniej.')
        return
      }

      if (st === 's' || st === 'sz') {
        const bucket = D[st]
        let got = false
        for (const f of frames) { if (f.t <= D.lastT) continue; D.lastT = f.t; if (f.hiss) { bucket.push(f.cog); got = true } }
        setProgress(Math.min(1, bucket.length / NEED_FRAMES))
        if (got) { D.quietSince = now; setFlash('') }
        else if (now - D.quietSince > 2500) {
          setFlash(lv >= VOL_OK_DB ? 'Słyszę głos, ale nie sam szum głoski. Sycz bez głosu, długo.' : lv >= 4 ? 'Za cicho. Bliżej mikrofonu albo mocniej.' : 'Czekam na głoskę…')
        }
        if (bucket.length >= NEED_FRAMES) {
          if (st === 's') { setProgress(0); D.quietSince = now; setFlash(''); setStage('sz') }
          else {
            const p = computeQuickProfile(D.s, D.sz)
            if (p.quality !== 'good') { meter.stop(); setBad(p); setStage('result') }
            else {
              // nowy próg unieważnia stare sylaby i stary test słów
              persist({ ...p, raw: { s: D.s.slice(-400), sz: D.sz.slice(-400) }, syllDone: false, words: {}, accuracy: null })
              setWords({})
              goHome(`Krok 2 gotowy: próg ${p.hz} Hz zapisany. Gry już oceniają głoski.`)
            }
          }
        }
        return
      }

      if (st === 'syll' || st === 'test') {
        const utter = D.reader.poll()
        if (!utter) {
          if (!D.reader.isSpeaking() && now - D.waitSince > 6000 && !flashHold.current) {
            setFlash(D.peak >= 4 ? 'Ledwo słyszę. Powiedz głośniej albo bliżej mikrofonu.' : 'Czekam… powiedz to, co na ekranie.')
          }
          return
        }
        const peak = utter.reduce((m, f) => Math.max(m, f.lvl || 0), 0)
        const segments = analyseFrames(utter)
        D.waitSince = now; D.peak = 0
        const i = idxRef.current
        const miss = (msg) => { setFlash(msg); setFails(n => n + 1); holdFlash() }

        if (st === 'syll') {
          const item = SYLLABLES[i]
          if (!segments.length) {
            miss(peak < VOL_OK_DB ? 'Za cicho. Powtórz głośniej albo bliżej mikrofonu.' : `Słyszałem głos, ale nie głoskę „${item.say.replace(/[aeuy]$/, '')}”. Powtórz wyraźniej, przeciągnij początek.`)
            return
          }
          // sylaba ma jedną głoskę: bierzemy najdłuższy odcinek szumu
          const seg = [...segments].sort((a, b) => b.durationMs - a.durationMs)[0]
          for (let k = 0; k < SYLLABLE_WEIGHT; k++) D[item.cls].push(seg.cog)
          nextSyllable(i)
        } else {
          const word = queueRef.current[i]
          const v = judgeUtterance(segments, parseSibilants(word), D.profile, 'normal').verdict
          if (v === 'silent') {
            miss(peak < VOL_OK_DB ? 'Za cicho. Powtórz głośniej albo bliżej mikrofonu.' : 'Słyszałem głos, ale nie złapałem głoski. Powtórz wolniej i wyraźniej.')
            return
          }
          D.pending = { word, sys: v }
          setFlash('')
          setStage('judge')       // teraz ocenia dorosły
        }
      }
    }, 60)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter])

  // komunikat o nieudanej próbie zostaje na ekranie kilka sekund (nie zastępuje go „Czekam…”)
  const flashHold = useRef(false)
  const holdFlash = () => { flashHold.current = true; setTimeout(() => { flashHold.current = false }, 4000) }

  const nextSyllable = (i) => {
    const D = d.current
    setFlash(''); setFails(0)
    if (i + 1 < SYLLABLES.length) { setIdx(i + 1); return }
    const p = computeQuickProfile(D.s, D.sz)
    // gdy sylaby „zepsuły” odstęp, zostajemy przy progu z przeciągniętych głosek
    const base = p.quality === 'good' ? p : D.profile
    const cur = getQuickProfile() || {}
    persist({ ...cur, ...base, raw: { s: D.s.slice(-400), sz: D.sz.slice(-400) }, syllDone: true })
    goHome(p.quality === 'good' ? `Krok 3 gotowy: próg poprawiony na ${p.hz} Hz.` : 'Krok 3 gotowy. Próg został bez zmian (sylaby go nie poprawiły).')
  }

  const nextWord = (i, all) => {
    setFails(0); setFlash('')
    if (i + 1 < queueRef.current.length) { setIdx(i + 1); d.current.reader.reset(); d.current.waitSince = performance.now(); setStage('test'); return }
    const done = TEST_WORDS.filter(w => all[w])
    const agree = done.filter(w => all[w].agree).length
    const cur = getQuickProfile() || {}
    persist({ ...cur, words: all, accuracy: done.length === TEST_WORDS.length ? agree / done.length : null })
    meter.stop()
    setStage('result')
  }

  const judge = (adultGood) => {
    const { word, sys } = d.current.pending
    const agree = adultGood ? sys === 'pass' : sys === 'fail'
    const all = { ...words, [word]: { sys, adult: adultGood, agree } }
    setWords(all)
    nextWord(idxRef.current, all)
  }
  const sayAgain = () => { d.current.reader.reset(); d.current.waitSince = performance.now(); setStage('test') }
  const skipItem = () => {
    if (stageRef.current === 'syll') nextSyllable(idxRef.current)
    else nextWord(idxRef.current, words)
  }

  // Po sprawdzeniu głośności przechodzimy do wybranego kroku
  const beginGoal = () => {
    const D = d.current, now = performance.now()
    setFlash(''); setProgress(0); setIdx(0); setFails(0)
    D.lastT = now; D.quietSince = now; D.waitSince = now; D.peak = 0
    if (D.goal === 'sustain') { D.s = []; D.sz = []; setStage('s'); return }
    D.reader = createUtteranceReader(meter)
    setStage(D.goal === 'syll' ? 'syll' : 'test')
  }

  const start = async (goal, list) => {
    const cur = getQuickProfile()
    const D = d.current
    D.goal = goal; D.profile = cur; D.peak = 0
    if (goal !== 'sustain') { D.s = [...(cur?.raw?.s || [])]; D.sz = [...(cur?.raw?.sz || [])] }
    if (goal === 'test') { setQueue(list); setWords(list.length === TEST_WORDS.length ? {} : (cur?.words || {})) }
    setBad(null); setNote(''); setFlash(''); setProgress(0); setLevel(0)
    setStage('noise')
    const ok = await meter.start()
    if (!ok) setStage('error')
  }

  // ── Stan kroków ───────────────────────────────────────────────────────────
  const hasThreshold = !!saved && saved.quality === 'good'
  const savedWords = saved?.words || {}
  const doneWords = TEST_WORDS.filter(w => savedWords[w])
  const agreeCount = doneWords.filter(w => savedWords[w].agree).length
  const toRepeat = TEST_WORDS.filter(w => !savedWords[w] || !savedWords[w].agree)
  const wordsDone = doneWords.length === TEST_WORDS.length
  const wordsOk = wordsDone && agreeCount >= TARGET
  const canSyll = hasThreshold && Array.isArray(saved?.raw?.s)

  const Chip = ({ w, res, current }) => (
    <span className={`chip ${res ? (res.agree ? 'chip-completed' : 'chip-skipped') : ''}`}
      style={current ? { outline: '2px solid var(--primary)' } : undefined}>
      {w} {res ? (res.agree ? '✓' : '✕') : ''}
    </span>
  )

  // ── Ekran główny: lista kroków ────────────────────────────────────────────
  if (stage === 'home' || stage === 'error') {
    const steps = [
      { n: 1, title: 'Głośność', why: 'Sprawdza się sama na początku każdego kroku: czy mikrofon dobrze słyszy.', state: 'auto' },
      { n: 2, title: 'Długie „s” i „sz”', why: 'Ok. 20 sekund. Z tego powstaje próg i gry zaczynają oceniać głoski.',
        state: hasThreshold ? 'done' : 'todo', info: hasThreshold ? `próg ${saved.hz} Hz` : '', go: () => start('sustain'), locked: false },
      { n: 3, title: 'Sylaby', why: 'Osiem sylab (sa, sza, ca, cza…). Dopasowuje próg do krótkich głosek.',
        state: saved?.syllDone ? 'done' : 'todo', go: () => start('syll'), locked: !canSyll },
      { n: 4, title: 'Słowa', why: `Sześć słów. Dziecko mówi, dorosły zaznacza, czy powiedziało dobrze. Cel: zgodność w ${TARGET} z ${TEST_WORDS.length}.`,
        state: wordsOk ? 'done' : wordsDone || doneWords.length ? 'part' : 'todo', info: doneWords.length ? `${agreeCount} z ${TEST_WORDS.length}` : '',
        go: () => start('test', wordsDone || !doneWords.length ? TEST_WORDS : toRepeat), locked: !hasThreshold },
    ]
    const next = steps.find(s => s.state !== 'auto' && s.state !== 'done' && !s.locked)
    const summary = !hasThreshold ? { c: 'var(--muted)', t: 'Gry z mikrofonem jeszcze nie oceniają głosek. Zrób krok 2.' }
      : !doneWords.length && saved.accuracy != null && saved.accuracy < 0.7 ? { c: 'var(--yellow)', t: 'Gry działają w trybie treningowym, bo poprzedni test słów wypadł słabo. Zrób krok 4 jeszcze raz: teraz Ty oceniasz każde słowo.' }
      : wordsDone && !wordsOk ? { c: 'var(--yellow)', t: `Gry działają w trybie treningowym: w teście słów zgodność ${agreeCount} z ${TEST_WORDS.length} (cel ${TARGET}). Powtórz tylko słowa z ✕.` }
      : wordsOk ? { c: 'var(--green)', t: 'Kalibracja pełna. Gry oceniają głoski na tym urządzeniu.' }
      : { c: 'var(--green)', t: 'Próg jest zapisany i gry już oceniają głoski. Kroki 3 i 4 zwiększają dokładność.' }
    return (
      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 18 }}>Kalibracja mikrofonu krok po kroku</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 12px', lineHeight: 1.55 }}>
          Mówi dziecko, dorosły siedzi obok. Cichy pokój, usta 20–30 cm od mikrofonu, na urządzeniu, na którym będą gry.
          Każdy krok zapisuje się od razu, więc można przerwać i wrócić później.
        </p>
        {note && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--active-bg)', fontWeight: 700, fontSize: 14, marginBottom: 10 }} data-note>{note}</div>}
        {stage === 'error' && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 10 }}>Brak dostępu do mikrofonu. Zezwól na mikrofon w przeglądarce i spróbuj ponownie.</div>}

        {steps.map(s => (
          <div key={s.n} data-step={s.n} data-state={s.state} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)', opacity: s.locked ? 0.5 : 1 }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14,
              background: s.state === 'done' ? 'var(--green)' : s.state === 'part' ? 'var(--yellow)' : 'var(--soft)', color: s.state === 'done' || s.state === 'part' ? '#fff' : 'var(--muted)' }}>
              {s.state === 'done' ? '✓' : s.n}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{s.title}{s.info ? <span style={{ fontWeight: 600, color: 'var(--muted)' }}> · {s.info}</span> : null}</div>
              <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{s.locked ? (hasThreshold ? 'Powtórz najpierw krok 2 (stary pomiar nie ma danych potrzebnych do sylab).' : 'Najpierw zrób krok 2.') : s.why}</div>
              {s.n === 4 && doneWords.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>{TEST_WORDS.map(w => <Chip key={w} w={w} res={savedWords[w]} />)}</div>
              )}
            </div>
            {s.go && !s.locked && (
              <button className={`btn btn-sm ${next && next.n === s.n ? 'btn-primary' : 'btn-outline'}`} onClick={s.go} data-go={s.n}>
                {s.n === 4 && doneWords.length && toRepeat.length && toRepeat.length < TEST_WORDS.length ? `Powtórz ${toRepeat.length}` : s.state === 'todo' ? 'Zacznij' : 'Powtórz'}
              </button>
            )}
          </div>
        ))}

        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, borderLeft: `4px solid ${summary.c}`, background: 'var(--soft)', fontSize: 13, lineHeight: 1.5 }} data-summary>
          {summary.t}
        </div>
        {saved && (
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Zapisane {new Date(saved.date).toLocaleDateString('pl-PL')}: próg {saved.hz} Hz („s” ≈ {saved.sHz} Hz, „sz” ≈ {saved.szHz} Hz).
          </div>
        )}
      </div>
    )
  }

  const Stop = () => <button className="btn btn-ghost btn-full mt-12" onClick={() => goHome()}>Przerwij i wróć do kroków</button>

  if (stage === 'noise') return <div className="card" style={{ textAlign: 'center', fontWeight: 800, fontSize: 18 }}>Cisza przez sekundę. Słucham pokoju…</div>

  if (stage === 'vol') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="form-label">Krok 1 · głośność</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)', margin: '4px 0' }}>Powiedz głośno: „Ala ma kota”</div>
        <p className="text-muted" style={{ fontSize: 14 }}>Pasek ma wejść na zielone pole. Jeśli nie wchodzi, usiądź bliżej mikrofonu.</p>
        <LevelBar db={level} />
        <div className="progress-wrap dark" style={{ height: 8, marginTop: 8 }}><div className="progress-fill colored" style={{ width: `${progress * 100}%` }} /></div>
        <div style={{ minHeight: 22, marginTop: 10, fontWeight: 700, fontSize: 14, color: 'var(--orange)' }} data-flash>{flash}</div>
        <Stop />
      </div>
    )
  }

  if (stage === 's' || stage === 'sz') {
    const step = SUSTAIN[stage]
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="form-label">Krok 2 · {stage === 's' ? 'głoska 1 z 2' : 'głoska 2 z 2'} · powiedz długo</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 2, color: stage === 's' ? 'var(--orange)' : 'var(--blue)' }}>{step.say}</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 12px' }}>{step.hint}</p>
        <div className="progress-wrap dark" style={{ height: 16 }}>
          <div className="progress-fill" style={{ width: `${progress * 100}%`, background: stage === 's' ? 'var(--orange)' : 'var(--blue)', transition: 'width .1s linear' }} />
        </div>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>Cel: pasek do końca. Rośnie tylko wtedy, gdy słyszę szum głoski. Można brać oddech.</div>
        <LevelBar db={level} />
        <div style={{ minHeight: 22, marginTop: 6, fontWeight: 700, fontSize: 14, color: 'var(--orange)' }} data-flash>{flash}</div>
        <Stop />
      </div>
    )
  }

  if (stage === 'syll' || stage === 'test') {
    const list = stage === 'syll' ? SYLLABLES.map(x => x.say) : queue
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="form-label">{stage === 'syll' ? 'Krok 3 · sylaby' : 'Krok 4 · słowa'} · {idx + 1} z {list.length}</div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: 1, color: 'var(--primary)', margin: '4px 0' }} data-say>{list[idx]}</div>
        {stage === 'test'
          ? <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', margin: '6px 0' }}>{TEST_WORDS.map(w => <Chip key={w} w={w} res={words[w]} current={w === list[idx]} />)}</div>
          : <div className="progress-wrap dark"><div className="progress-fill colored" style={{ width: `${(idx / list.length) * 100}%` }} /></div>}
        <LevelBar db={level} />
        <div style={{ minHeight: 40, marginTop: 6, fontWeight: 700, fontSize: 14, lineHeight: 1.4, color: flash ? 'var(--orange)' : 'var(--muted)' }} data-flash>
          {flash || 'Powiedz raz, wyraźnie. Słucham…'}
        </div>
        {fails >= 2 && <button className="btn btn-outline btn-full" onClick={skipItem} data-skip>Pomiń {stage === 'syll' ? 'tę sylabę' : 'to słowo'}</button>}
        <Stop />
      </div>
    )
  }

  if (stage === 'judge') {
    const { word } = d.current.pending || {}
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="form-label">Krok 4 · słowa · ocenia dorosły</div>
        <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--primary)', margin: '4px 0' }}>{word}</div>
        <p style={{ fontSize: 15, fontWeight: 700, margin: '6px 0 12px' }}>Jak dziecko to powiedziało?</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-green" style={{ flex: 1 }} onClick={() => judge(true)} data-judge="good">Dobrze</button>
          <button className="btn" style={{ flex: 1, background: '#FEF2F2', color: 'var(--red)' }} onClick={() => judge(false)} data-judge="bad">Źle (np. „s” zamiast „sz”)</button>
        </div>
        <button className="btn btn-ghost btn-full mt-8" onClick={sayAgain}>Niech powie jeszcze raz</button>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Aplikacja ma już swoją ocenę. Sprawdzamy, czy jest taka sama jak Twoja.</p>
      </div>
    )
  }

  // ── Wynik ─────────────────────────────────────────────────────────────────
  if (bad) {
    return (
      <div className="card" style={{ borderLeft: '5px solid var(--red)' }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{bad.quality === 'narrow' ? 'Głoski są za blisko siebie' : bad.quality === 'overlap' ? 'Głoski nakładają się w pomiarze' : 'Za mało pomiarów'}</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 12px', lineHeight: 1.55 }}>
          „s” ≈ {bad.sHz} Hz · „sz” ≈ {bad.szHz} Hz · odstęp {bad.gap} Hz (potrzeba co najmniej 400). Nie zapisuję tego pomiaru
          {hasThreshold ? ', zostaje poprzedni próg' : ''}. Najczęstsze przyczyny: „sz” zabrzmiało jak „s” (pilnuj dzióbka i języka u góry),
          hałas w pokoju albo za duża odległość od mikrofonu.
        </p>
        <button className="btn btn-primary btn-full" onClick={() => start('sustain')}>Powtórz krok 2</button>
        <button className="btn btn-ghost btn-full mt-8" onClick={() => goHome()}>Wróć do kroków</button>
      </div>
    )
  }
  return (
    <div className="card" style={{ borderLeft: `5px solid ${wordsOk ? 'var(--green)' : 'var(--yellow)'}` }}>
      <div style={{ fontWeight: 800, fontSize: 18 }} data-result>Zgodność: {agreeCount} z {TEST_WORDS.length} słów · cel {TARGET}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>{TEST_WORDS.map(w => <Chip key={w} w={w} res={savedWords[w]} />)}</div>
      <p className="text-muted" style={{ fontSize: 14, margin: '0 0 12px', lineHeight: 1.55 }}>
        {wordsOk ? `Cel osiągnięty: aplikacja ocenia tak jak Ty. Kalibracja jest pełna.${toRepeat.length ? ' Słowo z ✕ możecie jeszcze powtórzyć.' : ''}`
          : `✓ = aplikacja oceniła tak samo jak Ty. Zaliczone słowa zostają. Powtórzcie tylko: ${toRepeat.join(', ')}.`}
      </p>
      {toRepeat.length > 0 && <button className={`btn ${wordsOk ? 'btn-outline' : 'btn-primary'} btn-full`} onClick={() => start('test', toRepeat)} data-repeat>Powtórz tylko: {toRepeat.join(', ')}</button>}
      <button className={`btn ${wordsOk ? 'btn-primary' : 'btn-ghost'} btn-full mt-8`} onClick={() => goHome()}>Wróć do kroków</button>
    </div>
  )
}
