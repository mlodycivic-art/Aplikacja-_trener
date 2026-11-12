// Kalibracja mikrofonu — szablon tego, co osoba ma powiedzieć, żeby system poznał JEJ głoski:
//
//   1. długie "ssss" i długie "szszsz"      → kotwice obu szeregów (ok. 20 s). Po tym kroku jest już próg.
//   2. sylaby: sa, sza, su, szu, ca, cza, cy, czy
//        → samogłoska przesuwa brzmienie szumu, a "c/cz" trwają ułamek sekundy — próg z samych
//          przeciągniętych głosek bywa za prosty, sylaby go poprawiają.
//   3. TEST TRAFNOŚCI na słowach: sok, szok, kasa, kasza, czapka, soczek
//        → liczba: w ilu słowach system rozpoznał głoski tak, jak powinny zabrzmieć.
//
// Kroki 2 i 3 można pominąć ("Zakończ na tym") — gry działają wtedy na progu z kroku 1.
// Logopeda potwierdza jedno: że "sz" i "cz" brzmiały poprawnie podczas kalibracji.

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter, analyseFrames } from './games/useSibilantMeter'
import { createUtteranceReader } from './games/utterance'
import { computeQuickProfile, saveQuickProfile, getQuickProfile } from '../data/patternStore'
import { parseSibilants, judgeUtterance } from '../data/sibilants'

const NEED_FRAMES = 90        // ok. 1,5 s czystego szumu
const SUSTAIN = {
  s:  { say: 'ssssss',   hint: 'Zęby razem, uśmiech, język za dolnymi zębami. Syczymy jak wąż.' },
  sz: { say: 'szszszsz', hint: 'Dzióbek, język uniesiony do góry. Szumimy jak wiatr.' },
}
const SYLLABLES = [
  { say: 'sa', cls: 's' }, { say: 'sza', cls: 'sz' }, { say: 'su', cls: 's' }, { say: 'szu', cls: 'sz' },
  { say: 'ca', cls: 's' }, { say: 'cza', cls: 'sz' }, { say: 'cy', cls: 's' }, { say: 'czy', cls: 'sz' },
]
const TEST_WORDS = ['sok', 'szok', 'kasa', 'kasza', 'czapka', 'soczek']
const SYLLABLE_WEIGHT = 8     // jedna sylaba liczy się jak 8 ramek przeciągniętej głoski
const pct = (v) => `${Math.round(v * 100)}%`

export default function QuickMicCalibration() {
  const meter = useSibilantMeter()
  const [stage, setStage] = useState('intro')   // intro | noise | s | sz | mid | syll | test | result | error
  const [progress, setProgress] = useState(0)
  const [idx, setIdx] = useState(0)
  const [flash, setFlash] = useState('')
  const [result, setResult] = useState(null)
  const [saved, setSaved] = useState(getQuickProfile())
  const d = useRef({ s: [], sz: [], lastT: 0, reader: null, profile: null, trials: [], syllOk: 0 })
  const stageRef = useRef(stage); stageRef.current = stage
  const idxRef = useRef(idx); idxRef.current = idx

  useEffect(() => () => meter.stop(), [meter])

  const save = (profile, extra = {}) => {
    const full = { ...profile, ...extra }
    setResult(full)
    if (full.quality === 'good') { saveQuickProfile(full); setSaved(getQuickProfile()) }
  }
  const finishEarly = () => { meter.stop(); save(d.current.profile || computeQuickProfile(d.current.s, d.current.sz)); setStage('result') }

  useEffect(() => {
    const id = setInterval(() => {
      const st = stageRef.current, D = d.current
      if (st === 'noise') { if (meter.getInfo().state === 'on') { D.lastT = performance.now(); setStage('s') } return }

      if (st === 's' || st === 'sz') {
        const bucket = D[st]
        for (const f of meter.getFrames()) { if (f.t <= D.lastT) continue; D.lastT = f.t; if (f.hiss) bucket.push(f.cog) }
        setProgress(Math.min(1, bucket.length / NEED_FRAMES))
        if (bucket.length >= NEED_FRAMES) {
          if (st === 's') { setProgress(0); setStage('sz') }
          else {
            D.profile = computeQuickProfile(D.s, D.sz)
            if (D.profile.quality !== 'good') { meter.stop(); save(D.profile); setStage('result') }
            else { save(D.profile); setStage('mid') }       // próg już jest zapisany
          }
        }
        return
      }

      if (st === 'syll' || st === 'test') {
        const frames = D.reader.poll()
        if (!frames) return
        const segments = analyseFrames(frames)
        const i = idxRef.current
        if (st === 'syll') {
          const item = SYLLABLES[i]
          if (!segments.length) { setFlash('Nie słyszę głoski — powtórz, bliżej mikrofonu'); return }
          // sylaba ma jedną głoskę: bierzemy najdłuższy odcinek szumu
          const seg = [...segments].sort((a, b) => b.durationMs - a.durationMs)[0]
          for (let k = 0; k < SYLLABLE_WEIGHT; k++) D[item.cls].push(seg.cog)
          setFlash('')
          if (i + 1 < SYLLABLES.length) setIdx(i + 1)
          else {
            const p = computeQuickProfile(D.s, D.sz)
            // gdy sylaby "zepsuły" odstęp, zostajemy przy progu z przeciągniętych głosek
            if (p.quality === 'good') D.profile = p
            D.trials = []; setIdx(0); setStage('test')
          }
        } else {
          const word = TEST_WORDS[i]
          const v = judgeUtterance(segments, parseSibilants(word), D.profile, 'normal').verdict
          if (v === 'silent') { setFlash('Nie słyszę głoski — powtórz'); return }
          D.trials.push({ word, ok: v === 'pass', verdict: v })
          setFlash('')
          if (i + 1 < TEST_WORDS.length) setIdx(i + 1)
          else {
            meter.stop()
            const ok = D.trials.filter(t => t.ok).length
            save(D.profile, { accuracy: ok / D.trials.length, trials: D.trials })
            setStage('result')
          }
        }
      }
    }, 60)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter])

  const start = async () => {
    d.current = { s: [], sz: [], lastT: 0, reader: null, profile: null, trials: [], syllOk: 0 }
    setProgress(0); setResult(null); setIdx(0); setFlash('')
    setStage('noise')
    const ok = await meter.start()
    if (!ok) setStage('error')
  }
  const goSyllables = () => { d.current.reader = createUtteranceReader(meter); setIdx(0); setFlash(''); setStage('syll') }

  const Saved = () => saved && (
    <div className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>
      Zapisana kalibracja: próg {saved.hz} Hz (s ≈ {saved.sHz} Hz, sz ≈ {saved.szHz} Hz)
      {saved.accuracy != null ? `, trafność na słowach ${pct(saved.accuracy)}` : ''}, {new Date(saved.date).toLocaleDateString('pl-PL')}.
    </div>
  )

  if (stage === 'intro' || stage === 'error') {
    return (
      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 18 }}>Kalibracja mikrofonu</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 14px', lineHeight: 1.55 }}>
          Najpierw długie „ssss” i „szszsz” (20 sekund) — po tym gry już działają. Potem, dla większej dokładności,
          osiem sylab i sześć słów z testem trafności (ok. minuty). Cichy pokój, usta 20–30 cm od mikrofonu,
          na urządzeniu, na którym będą gry.
        </p>
        {stage === 'error' && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 10 }}>Brak dostępu do mikrofonu.</div>}
        <button className="btn btn-primary btn-full" onClick={start}>Zaczynamy</button>
        <Saved />
      </div>
    )
  }

  if (stage === 'noise') return <div className="card" style={{ textAlign: 'center', fontWeight: 800, fontSize: 18 }}>Cisza przez sekundę — słucham pokoju…</div>

  if (stage === 's' || stage === 'sz') {
    const step = SUSTAIN[stage]
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="form-label">Krok 1 · {stage === 's' ? 'pierwsza' : 'druga'} głoska · powiedz długo</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 2, color: stage === 's' ? 'var(--orange)' : 'var(--blue)' }}>{step.say}</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 16px' }}>{step.hint}</p>
        <div className="progress-wrap dark" style={{ height: 16 }}>
          <div className="progress-fill" style={{ width: `${progress * 100}%`, background: stage === 's' ? 'var(--orange)' : 'var(--blue)', transition: 'width .1s linear' }} />
        </div>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>Pasek rośnie tylko wtedy, gdy słyszę szum głoski. Można brać oddech.</div>
        <button className="btn btn-ghost btn-full mt-12" onClick={() => { meter.stop(); setStage('intro') }}>Przerwij</button>
      </div>
    )
  }

  if (stage === 'mid') {
    return (
      <div className="card" style={{ borderLeft: '5px solid var(--green)' }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Próg zapisany: {result?.hz} Hz</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 14px', lineHeight: 1.55 }}>
          „s” ≈ {result?.sHz} Hz · „sz” ≈ {result?.szHz} Hz · odstęp {result?.gap} Hz. Gry mogą już oceniać głoski.
          Krok 2 doda sylaby i krótkie głoski „c / cz”, a krok 3 sprawdzi trafność na słowach.
        </p>
        <button className="btn btn-primary btn-full" onClick={goSyllables}>Dalej: sylaby i test (ok. minuty)</button>
        <button className="btn btn-ghost btn-full mt-8" onClick={finishEarly}>Zakończ na tym</button>
      </div>
    )
  }

  if (stage === 'syll' || stage === 'test') {
    const list = stage === 'syll' ? SYLLABLES.map(x => x.say) : TEST_WORDS
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="form-label">{stage === 'syll' ? 'Krok 2 · sylaby' : 'Krok 3 · test trafności'} · {idx + 1} z {list.length}</div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: 1, color: 'var(--primary)', margin: '4px 0' }}>{list[idx]}</div>
        <div className="progress-wrap dark"><div className="progress-fill colored" style={{ width: `${(idx / list.length) * 100}%` }} /></div>
        <div style={{ minHeight: 22, marginTop: 10, fontWeight: 700, fontSize: 14, color: flash ? 'var(--orange)' : 'var(--muted)' }}>
          {flash || 'Powiedz raz, wyraźnie. Słucham…'}
        </div>
        <button className="btn btn-ghost btn-full mt-12" onClick={finishEarly}>Zakończ na tym</button>
      </div>
    )
  }

  // result
  const r = result || {}
  const good = r.quality === 'good'
  const weak = good && r.accuracy != null && r.accuracy < 0.7
  return (
    <div className="card" style={{ borderLeft: `5px solid ${!good ? 'var(--red)' : weak ? 'var(--yellow)' : 'var(--green)'}` }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>
        {!good ? (r.quality === 'narrow' ? 'Głoski są za blisko siebie' : 'Głoski nakładają się w pomiarze')
          : r.accuracy != null ? `Próg ${r.hz} Hz · trafność na słowach ${pct(r.accuracy)}` : `Gotowe. Próg: ${r.hz} Hz`}
      </div>
      <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 10px', lineHeight: 1.55 }}>
        „s” ≈ {r.sHz} Hz · „sz” ≈ {r.szHz} Hz · odstęp {r.gap} Hz.{' '}
        {!good ? 'Nie zapisuję. Najczęstsze przyczyny: „sz” zabrzmiało jak „s”, hałas w pokoju albo mikrofon tnie wysokie dźwięki.'
          : weak ? 'Próg jest zapisany, ale na słowach system często się mylił — gry będą działać w trybie treningowym, dopóki trafność nie wzrośnie. Powtórzcie kalibrację albo nagrajcie Bazę wzorców.'
          : 'Kalibracja zapisana — gry z mikrofonem oceniają głoski na tym urządzeniu.'}
      </p>
      {r.trials && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {r.trials.map((t, i) => (
            <span key={i} className={`chip ${t.ok ? 'chip-completed' : 'chip-skipped'}`}>{t.word} {t.ok ? '✓' : t.verdict === 'unclear' ? '?' : '✕'}</span>
          ))}
        </div>
      )}
      <button className="btn btn-outline btn-full" onClick={start}>Powtórz kalibrację</button>
      <Saved />
    </div>
  )
}
