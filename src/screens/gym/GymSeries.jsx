// Ekran serii „Gimnastyka buzi i języka”: etapy → ćwiczenia → powtórzenia.
// Każde powtórzenie to jeden obieg animacji (przód + przekrój z boku); ćwiczący naśladuje ruch.
// Między ćwiczeniami 3 sekundy przerwy z zapowiedzią następnego. Głos (jeśli włączony) mówi nazwę i liczbę powtórzeń.

import { useEffect, useMemo, useRef, useState } from 'react'
import { FacePair, usePoseLoop, NEUTRAL } from './FaceRig'
import { buildRun, stageName, estimateSec, normalizeGym } from '../../data/gymExercises'
import { speak, plural } from '../../data/voice'
import { addResult } from '../../data/resultsStore'

const REST_MS = 3000
const STILL = [{ t: 0 }, { t: 1 }]

export default function GymSeries({ exercise, onComplete }) {
  const gym = useMemo(() => normalizeGym(exercise.params?.gym), [exercise])
  const run = useMemo(() => buildRun(gym), [gym])
  const [phase, setPhase] = useState('intro')      // intro | run | rest | done
  const [idx, setIdx] = useState(0)
  const [rep, setRep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [restLeft, setRestLeft] = useState(0)
  const doneReps = useRef(0)
  const startedAt = useRef(0)

  const st = run[idx]
  const playing = phase === 'run' && !paused
  const keys = phase === 'run' || phase === 'intro' ? (st?.keys || STILL) : STILL
  const cycle = st?.cycle || 3000

  // wywoływane z pętli animacji raz na pełne powtórzenie (poza renderowaniem, więc bez podwójnych wywołań)
  const repRef = useRef(0)
  const onCycle = () => {
    doneReps.current++
    repRef.current++
    setRep(repRef.current)
    if (repRef.current >= st.reps) goNext(idx + 1)
  }
  const pose = usePoseLoop(keys, cycle, playing || phase === 'intro', phase === 'run' ? onCycle : null)

  const announce = (s) => { if (gym.voice) speak(`${s.name}. ${s.reps} ${plural(s.reps, 'raz', 'razy', 'razy')}.`) }

  const goNext = (to) => {
    if (to >= run.length) { finish(); return }
    repRef.current = 0
    setPhase('rest'); setIdx(to); setRep(0); setRestLeft(Math.ceil(REST_MS / 1000))
  }
  // odliczanie przerwy
  useEffect(() => {
    if (phase !== 'rest' || paused) return
    if (restLeft <= 0) { setPhase('run'); announce(run[idx]); return }
    const t = setTimeout(() => setRestLeft(v => v - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, restLeft, paused])

  useEffect(() => () => { try { window.speechSynthesis?.cancel() } catch (e) {} }, [])

  const start = () => {
    startedAt.current = Date.now(); doneReps.current = 0
    repRef.current = 0
    setIdx(0); setRep(0); setPhase('run'); announce(run[0])
  }
  const finish = () => {
    setPhase('done')
    try { window.speechSynthesis?.cancel() } catch (e) {}
    if (gym.voice) speak('Koniec serii. Dobra robota.')
    addResult('gym_series', {
      templateId: exercise.templateId || exercise.id, stations: run.length, reps: doneReps.current,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    })
  }
  const skip = () => { try { window.speechSynthesis?.cancel() } catch (e) {} goNext(idx + 1) }
  const back = () => { repRef.current = 0; setRep(0); if (idx > 0) { setIdx(idx - 1); setPhase('run'); announce(run[idx - 1]) } }

  if (!run.length) {
    return (
      <div className="card">
        <p style={{ fontWeight: 700 }}>W serii nie ma włączonych ćwiczeń.</p>
        <p className="text-muted" style={{ fontSize: 13 }}>Dorosły włącza je w Trenerze, w ustawieniach tego ćwiczenia.</p>
      </div>
    )
  }

  if (phase === 'intro') {
    const sec = estimateSec(gym)
    let lastStage = null
    return (
      <div className="card" data-gym="intro">
        <FacePair pose={pose} />
        <div style={{ margin: '14px 0 10px', fontSize: 14, lineHeight: 1.6 }}>
          {run.map((s, i) => {
            const head = s.stage !== lastStage; lastStage = s.stage
            return (
              <div key={s.id}>
                {head && <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginTop: i ? 10 : 0 }}>{stageName(s.stage).toUpperCase()}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{s.name}</span><span className="text-muted">{s.reps}×</span></div>
              </div>
            )
          })}
        </div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Razem około {Math.max(1, Math.round(sec / 60))} min. Patrz na rysunek i rób to samo. Najlepiej przed lustrem albo z kamerą w telefonie.
        </p>
        <button className="btn btn-primary btn-full" onClick={start} data-act="gym-start">Zaczynamy</button>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="card" data-gym="done" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Seria zrobiona</div>
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 16 }}>
          {run.length} {plural(run.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}, {doneReps.current} {plural(doneReps.current, 'powtórzenie', 'powtórzenia', 'powtórzeń')}.
        </p>
        <button className="btn btn-primary btn-full" onClick={() => onComplete(false, false, 0)} data-act="gym-done">Gotowe</button>
      </div>
    )
  }

  const next = run[idx]
  const stageIdx = run.filter((s, i) => i <= idx && s.stage === next.stage).length
  const stageTotal = run.filter(s => s.stage === next.stage).length
  return (
    <div className="card" data-gym={phase}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)' }}>{stageName(next.stage).toUpperCase()} · {stageIdx} z {stageTotal}</div>
        <div className="text-muted" style={{ fontSize: 12 }}>{idx + 1} / {run.length}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }} data-station={next.id}>{phase === 'rest' ? `Za chwilę: ${next.name}` : next.name}</div>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10, minHeight: 42 }}>{next.hint}</p>
      <FacePair pose={phase === 'rest' ? NEUTRAL : pose} />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', margin: '14px 0 6px' }} data-reps>
        {Array.from({ length: next.reps }, (_, i) => (
          <span key={i} style={{ width: 16, height: 16, borderRadius: 8, border: '2px solid var(--border)',
            background: phase === 'run' && i < rep ? 'var(--green)' : phase === 'run' && i === rep ? 'var(--primary)' : 'var(--soft)', transition: 'background .2s' }} />
        ))}
      </div>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, minHeight: 22, marginBottom: 10 }}>
        {phase === 'rest' ? `Odpocznij… ${restLeft}` : paused ? 'Pauza' : `Powtórzenie ${Math.min(rep + 1, next.reps)} z ${next.reps}`}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={back}>Wstecz</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setPaused(v => !v)} data-act="gym-pause">{paused ? 'Wznów' : 'Pauza'}</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={skip} data-act="gym-skip">Dalej</button>
      </div>
    </div>
  )
}
