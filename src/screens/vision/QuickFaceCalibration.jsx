// Osobista kalibracja ust w dwóch krokach (ok. 20 sekund):
//   1. usta zamknięte, rozluźnione — 2 sekundy,
//   2. najlepszy dzióbek — 2 sekundy.
// Zapisuje profil osoby (data/faceProfile.js). Gry liczą potem dzióbek względem JEJ zakresu,
// a nie stałych progów grupy wiekowej. Kreator kalibracji (Kroki 0–3) działa niezależnie.

import { useEffect, useRef, useState } from 'react'
import { useFaceEngine } from './useFaceEngine'
import { checkPucker } from './detectors'
import { getFaceProfile, saveFaceProfile, clearFaceProfile, medianSample, puckerScore, MIN_RANGE } from '../../data/faceProfile'

const NEED_SAMPLES = 45       // ok. 2 s przy 20–30 klatkach na sekundę
const STEPS = {
  neutral: { title: 'Krok 1 z 2: usta zamknięte', hint: 'Patrz w ekran. Usta zamknięte i rozluźnione, bez uśmiechu.' },
  pucker:  { title: 'Krok 2 z 2: dzióbek',         hint: 'Zrób najlepszy dzióbek, jak do „sz”, i trzymaj.' },
}

export default function QuickFaceCalibration() {
  const face = useFaceEngine()
  const [stage, setStage]     = useState('idle')   // idle | loading | neutral | pucker | done | weak | error
  const [progress, setProgress] = useState(0)
  const [seen, setSeen]       = useState(false)
  const [live, setLive]       = useState(null)
  const [profile, setProfile] = useState(getFaceProfile())
  const data = useRef({ samples: [], neutral: null })
  const stageRef = useRef(stage)
  stageRef.current = stage

  useEffect(() => () => face.stop(), [face])

  useEffect(() => {
    const id = setInterval(() => {
      const st = stageRef.current
      if (st !== 'neutral' && st !== 'pucker' && st !== 'done') return
      const points = face.getPoints()
      const visible = !!points && face.msSinceFace() < 800
      setSeen(visible)
      if (!visible) return
      const m = checkPucker(points, face.getCanvasSize())
      if (m.widthRatio == null) return
      setLive({ widthRatio: m.widthRatio, aspect: m.aspect })
      if (st === 'done') return
      const d = data.current
      d.samples.push({ widthRatio: m.widthRatio, aspect: m.aspect })
      setProgress(Math.min(1, d.samples.length / NEED_SAMPLES))
      if (d.samples.length >= NEED_SAMPLES) {
        const med = medianSample(d.samples)
        d.samples = []
        setProgress(0)
        if (st === 'neutral') { d.neutral = med; setStage('pucker') }
        else {
          const saved = saveFaceProfile(d.neutral, med)
          if (saved) { setProfile(saved); setStage('done') } else setStage('weak')
        }
      }
    }, 45)
    return () => clearInterval(id)
  }, [face])

  const start = async () => {
    data.current = { samples: [], neutral: null }
    setProgress(0)
    setStage('loading')
    const ok = await face.start()
    setStage(ok ? 'neutral' : 'error')
  }
  const stop = () => { face.stop(); setStage('idle') }

  const fmt = (v) => (v == null ? '–' : v.toFixed(2))

  return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 17 }}>Osobista kalibracja ust</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px', lineHeight: 1.5 }}>
        Dwa kroki po 2 sekundy. System zapamiętuje usta tej osoby w spoczynku i w dzióbku, a gry mierzą dzióbek
        względem jej własnego zakresu. Warto powtórzyć po zmianie urządzenia lub miejsca kamery.
      </p>

      {profile && stage === 'idle' && (
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 10 }}>
          Zapisany profil z {new Date(profile.date).toLocaleDateString('pl-PL')}: spoczynek {fmt(profile.neutral.widthRatio)}, dzióbek {fmt(profile.pucker.widthRatio)}.
        </div>
      )}

      {(stage === 'idle' || stage === 'error') && (<>
        {stage === 'error' && <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{face.getError()}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={start}>{profile ? 'Kalibruj ponownie' : 'Zacznij kalibrację'}</button>
          {profile && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { clearFaceProfile(); setProfile(null) }}>Usuń profil</button>}
        </div>
      </>)}

      {stage === 'loading' && <div style={{ fontWeight: 800 }}>Uruchamiam kamerę…</div>}

      {(stage === 'neutral' || stage === 'pucker') && (<>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{STEPS[stage].title}</div>
        <div className="text-muted" style={{ fontSize: 14, margin: '4px 0 12px' }}>{STEPS[stage].hint}</div>
        <div className="progress-wrap dark" style={{ height: 14 }}>
          <div className="progress-fill colored" style={{ width: `${progress * 100}%`, transition: 'width .1s linear' }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: seen ? 'var(--green)' : 'var(--red)' }}>
          {seen ? 'Widzę twarz' : 'Nie widzę twarzy — usiądź na wprost kamery, w dobrym świetle'}
        </div>
        <button className="btn btn-ghost btn-full mt-12" onClick={stop}>Przerwij</button>
      </>)}

      {stage === 'weak' && (<>
        <div style={{ fontWeight: 800, color: 'var(--red)' }}>Dzióbek prawie nie różni się od spoczynku</div>
        <div className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>
          Usta zwęziły się o mniej niż {MIN_RANGE} (w jednostkach odległości między oczami). Profil nie został zapisany.
          Spróbujcie mocniejszego dzióbka albo ustawcie twarz bliżej kamery.
        </div>
        <button className="btn btn-primary btn-full" onClick={start}>Powtórz</button>
      </>)}

      {stage === 'done' && profile && (<>
        <div style={{ fontWeight: 800, color: 'var(--green)' }}>Profil zapisany</div>
        <div className="text-muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
          Sprawdźcie na żywo: przy dzióbku pasek powinien dochodzić do końca, przy zamkniętych ustach wracać do zera.
        </div>
        <div className="progress-wrap dark" style={{ height: 16 }}>
          <div className="progress-fill" style={{ width: `${Math.min(100, puckerScore(live?.widthRatio, profile) * 100)}%`, background: 'var(--green)', transition: 'width .08s linear' }} />
        </div>
        <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
          Teraz: szerokość {fmt(live?.widthRatio)} · otwór {fmt(live?.aspect)} · {seen ? 'twarz widoczna' : 'brak twarzy'}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={start}>Powtórz</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={stop}>Gotowe</button>
        </div>
      </>)}
    </div>
  )
}
