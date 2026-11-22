// Ekran serii „Gimnastyka buzi i języka”: etapy → ćwiczenia → powtórzenia.
// Każde powtórzenie to jeden obieg animacji (przód + przekrój z boku); ćwiczący naśladuje ruch.
// Przed każdym ćwiczeniem: nazwa i wskazówka czytane wolniej (jeśli głos włączony), potem odliczanie 3-2-1 i dopiero start.

import { useEffect, useMemo, useRef, useState } from 'react'
import { FacePair, usePoseLoop, poseAt } from './FaceRig'
import { buildRun, stageName, estimateSec, normalizeGym } from '../../data/gymExercises'
import { speak, plural } from '../../data/voice'
import { addResult } from '../../data/resultsStore'

const SLOW = 0.78                     // wolniejsze czytanie nazwy i wskazówki
const COUNT_WORDS = { 3: 'trzy', 2: 'dwa', 1: 'jeden' }
const STILL = [{ t: 0 }, { t: 1 }]
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export default function GymSeries({ exercise, onComplete }) {
  const gym = useMemo(() => normalizeGym(exercise.params?.gym), [exercise])
  const run = useMemo(() => buildRun(gym), [gym])
  const [phase, setPhase] = useState('intro')      // intro | prep | run | done
  const [idx, setIdx] = useState(0)
  const [rep, setRep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [count, setCount] = useState(null)         // odliczanie 3-2-1 przed startem ćwiczenia
  const doneReps = useRef(0)
  const startedAt = useRef(0)
  const token = useRef(0)                          // przerywa trwające przygotowanie (Dalej, Wstecz, wyjście)

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
    if (repRef.current >= st.reps) prepare(idx + 1)
  }
  const pose = usePoseLoop(keys, cycle, playing || phase === 'intro', phase === 'run' ? onCycle : null)

  // Przygotowanie ćwiczenia: nazwa i wskazówka czytane wolniej, potem odliczanie 3-2-1, dopiero wtedy start.
  const prepare = async (to) => {
    const my = ++token.current
    try { window.speechSynthesis?.cancel() } catch (e) {}
    if (to >= run.length) { finish(); return }
    const s = run[to]
    repRef.current = 0
    setIdx(to); setRep(0); setCount(null); setPaused(false); setPhase('prep')
    if (gym.voice) {
      await speak(`${s.name}.`, { rate: SLOW })
      if (my !== token.current) return
      await sleep(250)
      if (my !== token.current) return
      await speak(s.tongueHold ? `${s.hint} Język przez cały czas trzymaj u góry.` : s.hint, { rate: SLOW })
    } else {
      await sleep(3500)
    }
    for (const c of [3, 2, 1]) {
      if (my !== token.current) return
      setCount(c)
      if (gym.voice) speak(COUNT_WORDS[c], { rate: 0.9 })
      await sleep(1000)
    }
    if (my !== token.current) return
    setCount(null)
    setPhase('run')
  }

  useEffect(() => () => { token.current++; try { window.speechSynthesis?.cancel() } catch (e) {} }, [])

  const start = () => {
    startedAt.current = Date.now(); doneReps.current = 0
    prepare(0)
  }
  const finish = () => {
    token.current++
    setPhase('done'); setCount(null)
    try { window.speechSynthesis?.cancel() } catch (e) {}
    if (gym.voice) speak('Koniec serii. Dobra robota.', { rate: SLOW })
    addResult('gym_series', {
      templateId: exercise.templateId || exercise.id, stations: run.length, reps: doneReps.current,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    })
  }
  const skip = () => prepare(idx + 1)
  const back = () => prepare(Math.max(0, phase === 'run' && rep === 0 ? idx - 1 : idx))

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
        <FacePair pose={pose} hold={!!st?.tongueHold} />
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
  const prepPose = poseAt(next.keys, 0)
  return (
    <div className="card" data-gym={phase}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)' }}>{stageName(next.stage).toUpperCase()} · {stageIdx} z {stageTotal}</div>
        <div className="text-muted" style={{ fontSize: 12 }}>{idx + 1} / {run.length}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }} data-station={next.id}>{next.name}</div>
      <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10, minHeight: 42, color: phase === 'prep' ? 'var(--text)' : 'var(--muted)', fontWeight: phase === 'prep' ? 600 : 400 }}>{next.hint}</p>
      <div style={{ position: 'relative' }}>
        <FacePair pose={phase === 'prep' ? prepPose : pose} hold={!!next.tongueHold} />
        {phase === 'prep' && count != null && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div key={count} data-countdown={count} style={{ width: 110, height: 110, borderRadius: 55, background: 'var(--primary)', color: '#fff', border: '5px solid #1A1410',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60, fontWeight: 800, animation: 'gymPop .35s ease-out' }}>{count}</div>
          </div>
        )}
      </div>
      <style>{'@keyframes gymPop{from{transform:scale(.6);opacity:.3}to{transform:scale(1);opacity:1}}'}</style>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', margin: '14px 0 6px' }} data-reps>
        {Array.from({ length: next.reps }, (_, i) => (
          <span key={i} style={{ width: 16, height: 16, borderRadius: 8, border: '2px solid var(--border)',
            background: phase === 'run' && i < rep ? 'var(--green)' : phase === 'run' && i === rep ? 'var(--primary)' : 'var(--soft)', transition: 'background .2s' }} />
        ))}
      </div>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, minHeight: 22, marginBottom: 10 }}>
        {phase === 'prep' ? (count != null ? 'Przygotuj się…' : 'Posłuchaj i popatrz') : paused ? 'Pauza' : `Powtórzenie ${Math.min(rep + 1, next.reps)} z ${next.reps}`}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={back}>Wstecz</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={phase !== 'run'} onClick={() => setPaused(v => !v)} data-act="gym-pause">{paused ? 'Wznów' : 'Pauza'}</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={skip} data-act="gym-skip">Dalej</button>
      </div>
    </div>
  )
}
