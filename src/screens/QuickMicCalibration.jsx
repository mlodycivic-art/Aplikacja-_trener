// Kalibracja mikrofonu w 1 minutę — szablon: długie "ssss", potem długie "szszsz".
//
// Dlaczego tak: gry potrzebują granicy między "s" a "sz" dla TEGO głosu i TEGO mikrofonu.
// Dwie przeciągnięte głoski dają ją szybciej i czyściej niż słowa. Pasek rośnie tylko wtedy,
// gdy system naprawdę słyszy szum głoski — więc od razu widać, czy mikrofon "łapie".
// Logopeda potwierdza jedno: że "szszsz" zabrzmiało poprawnie. Dokładniejszą bazę
// (nagrania słów oceniane pojedynczo) można dograć w zakładce "Baza wzorców".

import { useEffect, useRef, useState } from 'react'
import { useSibilantMeter } from './games/useSibilantMeter'
import { computeQuickProfile, saveQuickProfile, getQuickProfile } from '../data/patternStore'

const NEED_FRAMES = 90        // ok. 1,5 s czystego szumu (ramka ≈ 16 ms)
const STEPS = {
  s:  { say: 'ssssss',   hint: 'Zęby razem, uśmiech, język za dolnymi zębami. Syczymy jak wąż.' },
  sz: { say: 'szszszsz', hint: 'Dzióbek, język uniesiony do góry. Szumimy jak wiatr.' },
}

export default function QuickMicCalibration() {
  const meter = useSibilantMeter()
  const [stage, setStage] = useState('intro')      // intro | noise | s | sz | result | error
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [saved, setSaved]   = useState(getQuickProfile())
  const framesRef = useRef({ s: [], sz: [] })
  const lastTRef  = useRef(0)
  const stageRef  = useRef(stage)
  stageRef.current = stage

  useEffect(() => () => meter.stop(), [meter])

  // Zbieranie ramek: tylko te z wykrytym szumem, każda ramka raz
  useEffect(() => {
    const id = setInterval(() => {
      const st = stageRef.current
      if (st === 'noise') { if (meter.getInfo().state === 'on') { lastTRef.current = performance.now(); setStage('s') } return }
      if (st !== 's' && st !== 'sz') return
      const bucket = framesRef.current[st]
      for (const f of meter.getFrames()) {
        if (f.t <= lastTRef.current) continue
        lastTRef.current = f.t
        if (f.hiss) bucket.push(f.cog)
      }
      setProgress(Math.min(1, bucket.length / NEED_FRAMES))
      if (bucket.length >= NEED_FRAMES) {
        if (st === 's') { setProgress(0); setStage('sz') }
        else {
          meter.stop()
          const r = computeQuickProfile(framesRef.current.s, framesRef.current.sz)
          setResult(r)
          if (r.quality === 'good') { saveQuickProfile(r); setSaved(getQuickProfile()) }
          setStage('result')
        }
      }
    }, 60)
    return () => clearInterval(id)
  }, [meter])

  const start = async () => {
    framesRef.current = { s: [], sz: [] }
    setProgress(0); setResult(null)
    setStage('noise')
    const ok = await meter.start()
    if (!ok) setStage('error')
  }

  const Saved = () => saved && (
    <div className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>
      Zapisana kalibracja: próg {saved.hz} Hz (s ≈ {saved.sHz} Hz, sz ≈ {saved.szHz} Hz), {new Date(saved.date).toLocaleDateString('pl-PL')}.
    </div>
  )

  if (stage === 'intro' || stage === 'error') {
    return (
      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 18 }}>Kalibracja w minutę</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 14px', lineHeight: 1.55 }}>
          Dwa kroki: długie „ssss”, potem długie „szszsz”. Cichy pokój, usta 20–30 cm od mikrofonu,
          na tym urządzeniu, na którym będą gry. Najlepiej z logopedą, który potwierdzi, że „sz” brzmi dobrze.
        </p>
        {stage === 'error' && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 10 }}>Brak dostępu do mikrofonu.</div>}
        <button className="btn btn-primary btn-full" onClick={start}>Zaczynamy</button>
        <Saved />
      </div>
    )
  }

  if (stage === 'noise') {
    return <div className="card" style={{ textAlign: 'center', fontWeight: 800, fontSize: 18 }}>Cisza przez sekundę — słucham pokoju…</div>
  }

  if (stage === 's' || stage === 'sz') {
    const step = STEPS[stage]
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="form-label">Krok {stage === 's' ? 1 : 2} z 2 · powiedz długo</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 2, color: stage === 's' ? 'var(--orange)' : 'var(--blue)' }}>{step.say}</div>
        <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 16px' }}>{step.hint}</p>
        <div className="progress-wrap dark" style={{ height: 16 }}>
          <div className="progress-fill" style={{ width: `${progress * 100}%`, background: stage === 's' ? 'var(--orange)' : 'var(--blue)', transition: 'width .1s linear' }} />
        </div>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
          Pasek rośnie tylko wtedy, gdy słyszę szum głoski. Można brać oddech i zaczynać od nowa.
        </div>
        <button className="btn btn-ghost btn-full mt-12" onClick={() => { meter.stop(); setStage('intro') }}>Przerwij</button>
      </div>
    )
  }

  // result
  const r = result
  const good = r.quality === 'good'
  return (
    <div className="card" style={{ borderLeft: `5px solid ${good ? 'var(--green)' : 'var(--red)'}` }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>
        {good ? `Gotowe. Próg: ${r.hz} Hz` : r.quality === 'narrow' ? 'Głoski są za blisko siebie' : 'Głoski nakładają się w pomiarze'}
      </div>
      <p className="text-muted" style={{ fontSize: 14, margin: '6px 0 12px', lineHeight: 1.55 }}>
        „s” ≈ {r.sHz} Hz · „sz” ≈ {r.szHz} Hz · odstęp {r.gap} Hz.{' '}
        {good
          ? 'Kalibracja zapisana — gry z mikrofonem mogą oceniać głoski na tym urządzeniu.'
          : 'Nie zapisuję. Najczęstsze przyczyny: „sz” zabrzmiało jak „s”, hałas w pokoju albo mikrofon tnie wysokie dźwięki. Spróbujcie ponownie, bliżej mikrofonu.'}
      </p>
      <button className="btn btn-outline btn-full" onClick={start}>Powtórz kalibrację</button>
      <Saved />
    </div>
  )
}
