// Kalibracja "Mapa ust" — około minuty + 30 sekund testu trafności.
//
// Krok po kroku ekran prosi o pozycję (głoską albo ruchem języka), zbiera ~2 s klatek i idzie dalej.
// Na końcu TEST: losowo prosi o pozycje i sprawdza, czy mapa je rozpoznaje. Wynik to liczba
// (trafność %) i lista pomyłek — po niej widać, czy powtórzyć kalibrację i czy gry mogą używać kamery.
//
// Tryb testowy bez kamery (stc_debug_sim = '1') podstawia sztuczne dane, żeby dało się przejść ekran.

import { useEffect, useRef, useState } from 'react'
import { useFaceEngine } from './useFaceEngine'
import {
  POSES, extractFeatures, buildMap, classify, scoreTrials, getFaceMap, saveFaceMap, clearFaceMap,
  simFeatures, accuracyFor, MAX_YAW, MIN_ACCURACY, STEER_POSES, CIRCLE_POSES,
} from '../../data/faceMap'
import { isSimMode } from './useMouthControl'
import SetupCheck from './SetupCheck'

const NEED = 40            // klatek na pozycję (~2 s)
const PREP_MS = 1800       // czas na przyjęcie pozycji przed zbieraniem
const TEST_PREP_MS = 1500
const TEST_NEED = 14
const TEST_REPEATS = 2
const poseById = Object.fromEntries(POSES.map(p => [p.id, p]))
const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`)

export default function FaceMapCalibration() {
  const face = useFaceEngine()
  const sim = useRef(isSimMode()).current
  const [stage, setStage] = useState('idle')      // idle | loading | setup | collect | test | done | error
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState('prep')      // prep | take
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('ok')      // ok | noface | turned
  const [map, setMap] = useState(getFaceMap())
  const [result, setResult] = useState(null)
  const canvasRef = useRef(null)
  const st = useRef({ samples: {}, buf: [], phaseAt: 0, order: [], trials: [], map: null })
  const stageRef = useRef(stage); stageRef.current = stage
  const idxRef = useRef(idx); idxRef.current = idx
  const phaseRef = useRef(phase); phaseRef.current = phase

  useEffect(() => () => face.stop(), [face])

  // Jedna pętla: podgląd dla dorosłego + zbieranie klatek
  useEffect(() => {
    const id = setInterval(() => {
      const stg = stageRef.current
      if (stg !== 'collect' && stg !== 'test') return
      const s = st.current
      const poseId = stg === 'collect' ? POSES[idxRef.current].id : s.order[idxRef.current]

      // podgląd (lustrzany), tylko w strefie dorosłego
      const cv = canvasRef.current, video = face.getVideo()
      if (cv && video && video.videoWidth) {
        const g = cv.getContext('2d')
        g.save(); g.scale(-1, 1); g.drawImage(video, -cv.width, 0, cv.width, cv.height); g.restore()
      }

      let f = null
      if (sim) f = simFeatures(poseId, 0.012)
      else {
        const points = face.getPoints()
        if (!points || face.msSinceFace() > 800) { setStatus('noface'); return }
        const ex = extractFeatures(points, face.getCanvasSize(), face.getBlendshapes())
        if (!ex) { setStatus('noface'); return }
        if (Math.abs(ex.yaw) > MAX_YAW) { setStatus('turned'); return }
        f = ex.f
      }
      setStatus('ok')

      const now = performance.now()
      if (phaseRef.current === 'prep') {
        if (now - s.phaseAt >= (stg === 'collect' ? PREP_MS : TEST_PREP_MS)) { s.buf = []; setPhase('take'); setProgress(0) }
        return
      }
      s.buf.push(f)
      const need = stg === 'collect' ? NEED : TEST_NEED
      setProgress(Math.min(1, s.buf.length / need))
      if (s.buf.length < need) return

      if (stg === 'collect') {
        s.samples[poseId] = s.buf
        s.buf = []
        if (idxRef.current + 1 < POSES.length) { setIdx(idxRef.current + 1); s.phaseAt = now; setPhase('prep'); setProgress(0) }
        else {
          const m = buildMap(s.samples)
          if (!m) { setStage('error'); return }
          s.map = m
          // test: każda pozycja TEST_REPEATS razy, w losowej kolejności, bez dwóch takich samych pod rząd
          let order = []
          for (let r = 0; r < TEST_REPEATS; r++) order = order.concat(POSES.map(p => p.id).sort(() => Math.random() - 0.5))
          for (let i = 1; i < order.length; i++) if (order[i] === order[i - 1] && i + 1 < order.length) [order[i], order[i + 1]] = [order[i + 1], order[i]]
          s.order = order; s.trials = []
          setIdx(0); s.phaseAt = now; setPhase('prep'); setProgress(0); setStage('test')
        }
      } else {
        // głosowanie większościowe z klatek próby
        const votes = {}
        for (const fr of s.buf) { const c = classify(fr, s.map).pose || 'brak'; votes[c] = (votes[c] || 0) + 1 }
        const got = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]
        s.trials.push({ expected: poseId, got: got === 'brak' ? null : got })
        s.buf = []
        if (idxRef.current + 1 < s.order.length) { setIdx(idxRef.current + 1); s.phaseAt = now; setPhase('prep'); setProgress(0) }
        else {
          const sc = scoreTrials(s.trials)
          // setup = warunki, w których powstała mapa (odległość, kąt, światło) — gry porównują z nimi
          const final = { ...s.map, accuracy: sc.accuracy, perPose: sc.perPose, confusion: sc.confusion, setup: s.setup || null }
          saveFaceMap(final)
          setMap(final); setResult(sc)
          face.stop()
          setStage('done')
        }
      }
    }, 45)
    return () => clearInterval(id)
  }, [face, sim])

  const start = async () => {
    st.current = { samples: {}, buf: [], phaseAt: 0, order: [], trials: [], map: null }
    setIdx(0); setPhase('prep'); setProgress(0); setResult(null)
    if (!sim) {
      setStage('loading')
      const ok = await face.start()
      if (!ok) { setStage('error'); return }
    }
    setStage('setup')     // najpierw kontrola stanowiska (ścisła), potem zbieranie pozycji
  }
  const afterSetup = (conditions) => {
    st.current.setup = conditions
    st.current.phaseAt = performance.now()
    setStage('collect')
  }
  const stop = () => { face.stop(); setStage('idle') }

  const Summary = ({ m }) => {
    const steer = accuracyFor(m, STEER_POSES), circle = accuracyFor(m, CIRCLE_POSES)
    const ok = (v) => v != null && v >= MIN_ACCURACY
    return (
      <div style={{ marginTop: 10 }}>
        <div className="row-list-item"><span className="rli-label">Trafność wszystkich pozycji</span><span className="rli-val">{pct(m.accuracy)}</span></div>
        <div className="row-list-item"><span className="rli-label">Policzki (gra Auto)</span>
          <span className="rli-val" style={{ color: ok(steer) ? 'var(--green)' : 'var(--red)' }}>{pct(steer)} · {ok(steer) ? 'kamera steruje' : 'za mało'}</span></div>
        <div className="row-list-item" style={{ borderBottom: 'none' }}><span className="rli-label">Język dookoła ust (gra Sejf)</span>
          <span className="rli-val" style={{ color: ok(circle) ? 'var(--green)' : 'var(--red)' }}>{pct(circle)} · {ok(circle) ? 'kamera steruje' : 'za mało'}</span></div>
        {m.confusion && m.confusion.length > 0 && (
          <div className="text-muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
            Pomyłki: {m.confusion.slice(0, 5).map(c => `„${poseById[c.expected]?.label || c.expected}” rozpoznane jako „${poseById[c.got]?.label || 'nic'}” (${c.n}×)`).join('; ')}.
          </div>
        )}
      </div>
    )
  }

  const pose = stage === 'collect' ? POSES[idx] : stage === 'test' ? poseById[st.current.order[idx]] : null
  const total = stage === 'collect' ? POSES.length : st.current.order.length

  return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 17 }}>Mapa ust</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px', lineHeight: 1.5 }}>
        Dziewięć pozycji po 2 sekundy, potem krótki test, który sprawdza, czy system rozpoznaje je u tej osoby.
        Od wyniku testu zależy, czy gry Auto i Sejf mogą być sterowane kamerą.
      </p>

      {(stage === 'idle' || stage === 'error') && (<>
        {map && (<>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>Zapisana mapa z {new Date(map.date).toLocaleDateString('pl-PL')}</div>
          <Summary m={map} />
        </>)}
        {stage === 'error' && <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, margin: '8px 0' }}>{face.getError() || 'Nie udało się zbudować mapy — spróbuj ponownie.'}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={start}>{map ? 'Kalibruj ponownie' : 'Zacznij kalibrację'}</button>
          {map && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { clearFaceMap(); setMap(null) }}>Usuń mapę</button>}
        </div>
      </>)}

      {stage === 'loading' && <div style={{ fontWeight: 800 }}>Uruchamiam kamerę…</div>}
      {stage === 'setup' && <SetupCheck face={face} mode="strict" onReady={afterSetup} title="Najpierw ustawcie stanowisko" />}

      {pose && (<>
        <div className="form-label">{stage === 'collect' ? 'Kalibracja' : 'Test trafności'} · {idx + 1} z {total}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!sim && <canvas ref={canvasRef} width={160} height={120} style={{ width: 120, height: 90, borderRadius: 10, background: 'var(--soft)', flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            {pose.say && <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1, color: 'var(--primary)', lineHeight: 1.1 }}>{pose.say}</div>}
            <div style={{ fontWeight: 800, fontSize: 18 }}>{pose.label}</div>
          </div>
        </div>
        <div className="text-muted" style={{ fontSize: 14, margin: '8px 0 12px' }}>{pose.hint}</div>
        <div className="progress-wrap dark" style={{ height: 14 }}>
          <div className="progress-fill colored" style={{ width: `${phase === 'take' ? progress * 100 : 0}%`, transition: 'width .08s linear' }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: status === 'ok' ? (phase === 'take' ? 'var(--green)' : 'var(--muted)') : 'var(--red)' }}>
          {status === 'noface' ? 'Nie widzę twarzy — usiądź na wprost kamery'
            : status === 'turned' ? 'Głowa jest obrócona — patrz prosto w ekran'
            : phase === 'prep' ? 'Przygotuj się…' : 'Trzymaj — zapisuję'}
        </div>
        <button className="btn btn-ghost btn-full mt-12" onClick={stop}>Przerwij</button>
      </>)}

      {stage === 'done' && map && (<>
        <div style={{ fontWeight: 800, fontSize: 18, color: map.accuracy >= MIN_ACCURACY ? 'var(--green)' : 'var(--orange)' }}>
          Trafność: {pct(map.accuracy)}
        </div>
        <Summary m={map} />
        <div className="text-muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          Poniżej {Math.round(MIN_ACCURACY * 100)}% gra korzysta z trybu prowadzonego zamiast kamery. Warto wtedy powtórzyć kalibrację
          w lepszym świetle, z twarzą bliżej i na wprost.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={start}>Powtórz</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStage('idle')}>Gotowe</button>
        </div>
      </>)}
    </div>
  )
}
