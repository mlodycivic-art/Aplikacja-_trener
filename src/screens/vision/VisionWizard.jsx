import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision'
import { checkFaceFramed, checkMouthClosed, checkPucker, puckerLevelColor, getVolumeLevel, drawRoundedFrame, drawMouthOval, drawPuckerCircle, drawVolumeIndicator } from './detectors'
import { getAgeProfile } from './ageProfiles'

// Model i WASM ładowane z CDN Google — na etapie testów wystarczy internet
// przy pierwszym uruchomieniu. W wersji produkcyjnej można je wgrać lokalnie
// do folderu public/ i podmienić poniższe stałe na ścieżki lokalne.
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

// Ile ms dany krok musi być nieprzerwanie spełniony, zanim zaproponujemy akceptację
const STABLE_MS = { step0: 1200, step1: 2000, step2: 3000 }

const STEP_LABELS = {
  step0: 'Krok 0 — ustawienie twarzy w kadrze',
  step1: 'Krok 1 — naturalne ustawienie ust',
  step2: 'Krok 2 — dzióbek do głoski SZ (obraz)',
  step3: 'Krok 3 — przejścia usta → dzióbek (x3)',
}

const STEP_INSTRUCTIONS = {
  step0: 'Ustaw całą głowę prosto w zielonej ramce — bez przechylania na bok.',
  step1: 'Najpierw ustaw głowę w ramce, aż zrobi się zielona, a potem zamknij naturalnie usta (bez napinania mięśni). Utrzymaj tak przez 2 sekundy.',
  step2: 'Zrób dzióbek — zwęź usta, zostaw mały otwór pośrodku. Utrzymaj tak przez 2 sekundy.',
}

const STEP_QUESTIONS = {
  step0: 'Czy akceptujesz ustawienie twarzy w kadrze?',
  step1: 'Czy akceptujesz naturalne ustawienie ust?',
  step2: 'Czy akceptujesz wizualny układ ust (dzióbek)?',
  step3: 'Czy akceptujesz przejścia naturalne usta → dzióbek (3 powtórzenia)?',
}

export default function VisionWizard({ onCancel, onComplete, ageGroupId }) {
  const profile = getAgeProfile(ageGroupId)
  const profileRef = useRef(profile)
  profileRef.current = profile

  const videoRef       = useRef(null)
  const canvasRef      = useRef(null)
  const landmarkerRef  = useRef(null)
  const streamRef      = useRef(null)
  const rafRef         = useRef(null)
  const cancelledRef   = useRef(false)
  const stableSinceRef = useRef(null)
  const stepRef        = useRef('step0')
  const readyRef       = useRef(false)
  const frozenRef      = useRef(false)
  const loopRef        = useRef(null)
  const audioCtxRef    = useRef(null)
  const analyserRef    = useRef(null)
  const audioDataRef   = useRef(null)
  const voiceStableSinceRef = useRef(null)
  const voiceConfirmedRef   = useRef(false)
  const step3PhaseRef  = useRef('natural') // 'natural' | 'pause' | 'pucker'
  const step3StartRef  = useRef(null)
  const step3CycleRef  = useRef(0)

  const [step3Phase, setStep3Phase] = useState('natural')
  const [step3Cycle, setStep3Cycle] = useState(0)

  const [engineStatus, setEngineStatus] = useState('loading') // loading | running | error
  const [errorMsg, setErrorMsg]         = useState('')
  const [step, setStep]                 = useState('step0')  // step0 | step1 | step2 | done
  const [ready, setReady]               = useState(false)
  const [debugInfo, setDebugInfo]       = useState(null) // TYMCZASOWE — do dostrojenia progów, potem można usunąć

  // Zmiana kroku resetuje licznik stabilności i odmraża podgląd — nie łapiemy
  // "za darmo" akceptacji z poprzedniego kroku.
  useEffect(() => {
    stepRef.current = step
    stableSinceRef.current = null
    readyRef.current = false
    setReady(false)
    voiceStableSinceRef.current = null
    voiceConfirmedRef.current = false
    step3PhaseRef.current = 'natural'
    step3StartRef.current = null
    step3CycleRef.current = 0
    setStep3Phase('natural')
    setStep3Cycle(0)
    if (frozenRef.current) {
      frozenRef.current = false
      const video = videoRef.current
      if (video) video.play().catch(() => {})
      if (engineStatus === 'running') rafRef.current = requestAnimationFrame(() => loopRef.current && loopRef.current())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    cancelledRef.current = false

    async function setup() {
      try {
        setEngineStatus('loading')
        const filesetResolver = await FilesetResolver.forVisionTasks(WASM_URL)
        if (cancelledRef.current) return

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
        })
        if (cancelledRef.current) { landmarker.close(); return }
        landmarkerRef.current = landmarker

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        })
        if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        // Analiza głośności mikrofonu (RMS) — używana jako trzeci warunek w Kroku 2
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
          if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {})
          const source = audioCtx.createMediaStreamSource(stream)
          const analyser = audioCtx.createAnalyser()
          analyser.fftSize = 2048
          source.connect(analyser)
          audioCtxRef.current  = audioCtx
          analyserRef.current  = analyser
          audioDataRef.current = new Uint8Array(analyser.fftSize)
        } catch (audioErr) {
          console.warn('Analiza mikrofonu niedostępna:', audioErr)
        }

        const video = videoRef.current
        if (!video) { stream.getTracks().forEach(t => t.stop()); return }
        video.srcObject = stream

        try {
          await video.play()
        } catch (playErr) {
          // Patrz komentarz w poprzedniej wersji — React StrictMode w trybie
          // deweloperskim montuje komponent dwukrotnie, pierwsza próba bywa
          // przerywana. To nieszkodliwe.
          if (playErr && playErr.name === 'AbortError') return
          throw playErr
        }

        if (cancelledRef.current) return
        setEngineStatus('running')
        loop()
      } catch (err) {
        console.error('Błąd uruchamiania kamery / modelu twarzy:', err)
        if (!cancelledRef.current) {
          setEngineStatus('error')
          setErrorMsg('Nie udało się uruchomić kamery/mikrofonu lub modelu wykrywania twarzy. Sprawdź, czy przeglądarka ma zgodę na dostęp do kamery i mikrofonu.')
        }
      }
    }

    function loop() {
      if (cancelledRef.current || frozenRef.current) return
      const video      = videoRef.current
      const canvas     = canvasRef.current
      const landmarker = landmarkerRef.current

      if (!video || !canvas || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const result = landmarker.detectForVideo(video, performance.now())
      const points = result.faceLandmarks && result.faceLandmarks[0]

      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const halfW   = canvas.width  * 0.17
      const halfH   = canvas.height * 0.34
      const cornerR = halfW * 0.55

      let inTarget = false
      const currentStep = stepRef.current

      if (points) {
        if (currentStep === 'step0') {
          const res = checkFaceFramed(points, canvas, { cx, cy, halfW, halfH, ...profileRef.current.frame })
          inTarget = res.ok
          drawRoundedFrame(ctx, cx, cy, halfW, halfH, cornerR, inTarget ? '#22C55E' : '#EF4444')
        } else if (currentStep === 'step1') {
          const framed = checkFaceFramed(points, canvas, { cx, cy, halfW, halfH, ...profileRef.current.frame })
          const mouth  = checkMouthClosed(points, canvas, profileRef.current.mouth)
          inTarget = framed.ok && mouth.ok
          // Rysujemy OSOBNO ramkę twarzy i owal ust, każde z własnym kolorem —
          // dzięki temu widać, czy problem to dystans/kąt głowy, czy same usta.
          drawRoundedFrame(ctx, cx, cy, halfW, halfH, cornerR, framed.ok ? '#22C55E' : '#EF4444')
          if (mouth.mouthLeft) {
            drawMouthOval(ctx, mouth.mouthLeft, mouth.mouthRight, mouth.lipTop, mouth.lipBottom, canvas, mouth.ok ? '#22C55E' : '#EF4444')
          }
          setDebugInfo({
            step: 'step1',
            aspect: mouth.aspect, liftRatio: mouth.liftRatio, widthRatio: mouth.widthRatio,
          })
        } else if (currentStep === 'step2') {
          // Luźniejsze wymagania ramki niż w Kroku 0/1 — łatwiej utrzymać
          // twarz "w normie" podczas skupiania się na samym dzióbku.
          const framed = checkFaceFramed(points, canvas, { cx, cy, halfW, halfH, ...profileRef.current.frame })
          const pucker = checkPucker(points, canvas, profileRef.current.pucker)

          // Głośność mikrofonu (RMS z analizatora Web Audio)
          let volumeLevel = 0
          let rms = 0
          const analyser = analyserRef.current
          const dataArray = audioDataRef.current
          if (analyser && dataArray) {
            analyser.getByteTimeDomainData(dataArray)
            let sumSquares = 0
            for (let i = 0; i < dataArray.length; i++) {
              const v = (dataArray[i] - 128) / 128
              sumSquares += v * v
            }
            rms = Math.sqrt(sumSquares / dataArray.length)
            volumeLevel = getVolumeLevel(rms)
          }

          // Dźwięk musi trwać nieprzerwanie tylko 1 sekundę, w dowolnym momencie
          // próby (nie musi trwać przez całe 3 sekundy jak rama+dzióbek). Raz
          // potwierdzony, zostaje potwierdzony do końca tej próby.
          const nowTs = performance.now()
          if (volumeLevel >= 1) {
            if (voiceStableSinceRef.current == null) voiceStableSinceRef.current = nowTs
            if (nowTs - voiceStableSinceRef.current >= 1000) voiceConfirmedRef.current = true
          } else {
            voiceStableSinceRef.current = null
          }

          // Na razie wystarczy JAKIKOLWIEK wykryty dzióbek i dźwięk (poziom >= 1)
          // — pełna progresja do Poziomu 3 dojdzie w przyszłej wersji.
          inTarget = framed.ok && pucker.level >= 1 && voiceConfirmedRef.current
          const puckerColor = puckerLevelColor(pucker.level)
          const volumeColor = puckerLevelColor(volumeLevel)
          drawRoundedFrame(ctx, cx, cy, halfW, halfH, cornerR, framed.ok ? '#22C55E' : '#EF4444')
          if (pucker.mouthLeft) {
            drawPuckerCircle(ctx, pucker.mouthLeft, pucker.mouthRight, pucker.lipTop, pucker.lipBottom, canvas, puckerColor)
          }
          drawVolumeIndicator(ctx, volumeLevel, volumeColor)
          setDebugInfo({
            step: 'step2',
            widthRatio: pucker.widthRatio, aspect: pucker.aspect, level: pucker.level,
            framedOk: framed.ok, rms, volumeLevel, voiceConfirmed: voiceConfirmedRef.current,
          })
        }
      } else {
        drawRoundedFrame(ctx, cx, cy, halfW, halfH, cornerR, '#EF4444')
        if (currentStep === 'step3') step3StartRef.current = null
      }

      // Krok 3 ma własną, wewnętrzną logikę cykli (natural → pause → pucker) i
      // NIE korzysta z ogólnego licznika stabilności poniżej — obsługujemy to
      // tutaj, w tym samym miejscu co reszta.
      if (currentStep === 'step3' && points) {
        const framed = checkFaceFramed(points, canvas, { cx, cy, halfW, halfH, ...profileRef.current.frame })
        const phase = step3PhaseRef.current
        const nowTs = performance.now()

        if (phase === 'natural') {
          const mouth = checkMouthClosed(points, canvas, profileRef.current.mouth)
          const ok = framed.ok && mouth.ok
          drawRoundedFrame(ctx, cx, cy, halfW, halfH, cornerR, framed.ok ? '#22C55E' : '#EF4444')
          if (mouth.mouthLeft) {
            drawMouthOval(ctx, mouth.mouthLeft, mouth.mouthRight, mouth.lipTop, mouth.lipBottom, canvas, ok ? '#22C55E' : '#EF4444')
          }
          if (ok) {
            if (step3StartRef.current == null) step3StartRef.current = nowTs
            if (nowTs - step3StartRef.current >= 1000) {
              step3PhaseRef.current = 'pause'
              step3StartRef.current = nowTs
              setStep3Phase('pause')
            }
          } else {
            step3StartRef.current = null
          }
          setDebugInfo({ step: 'step3', phase: 'natural', cycle: step3CycleRef.current, framedOk: framed.ok, mouthOk: mouth.ok })
        } else if (phase === 'pause') {
          drawRoundedFrame(ctx, cx, cy, halfW, halfH, cornerR, framed.ok ? '#22C55E' : '#EF4444')
          if (step3StartRef.current == null) step3StartRef.current = nowTs
          if (nowTs - step3StartRef.current >= 1000) {
            step3PhaseRef.current = 'pucker'
            step3StartRef.current = null
            setStep3Phase('pucker')
          }
          setDebugInfo({ step: 'step3', phase: 'pause', cycle: step3CycleRef.current, framedOk: framed.ok })
        } else if (phase === 'pucker') {
          const pucker = checkPucker(points, canvas, profileRef.current.pucker)
          const ok = framed.ok && pucker.level >= 1
          const color = puckerLevelColor(pucker.level)
          drawRoundedFrame(ctx, cx, cy, halfW, halfH, cornerR, framed.ok ? '#22C55E' : '#EF4444')
          if (pucker.mouthLeft) {
            drawPuckerCircle(ctx, pucker.mouthLeft, pucker.mouthRight, pucker.lipTop, pucker.lipBottom, canvas, color)
          }
          if (ok) {
            if (step3StartRef.current == null) step3StartRef.current = nowTs
            if (nowTs - step3StartRef.current >= 1000) {
              const nextCycle = step3CycleRef.current + 1
              step3CycleRef.current = nextCycle
              setStep3Cycle(nextCycle)
              if (nextCycle >= 3) {
                // Wszystkie 3 przejścia udane — zamrażamy i pytamy o akceptację,
                // dokładnie tak jak w pozostałych krokach.
                frozenRef.current = true
                readyRef.current = true
                setReady(true)
                try { video.pause() } catch (e) {}
                return
              } else {
                step3PhaseRef.current = 'natural'
                step3StartRef.current = null
                setStep3Phase('natural')
              }
            }
          } else {
            step3StartRef.current = null
          }
          setDebugInfo({ step: 'step3', phase: 'pucker', cycle: step3CycleRef.current, framedOk: framed.ok, level: pucker.level })
        }

        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const now = performance.now()
      const requiredMs = STABLE_MS[currentStep] || 1200
      let justBecameReady = false

      if (inTarget) {
        if (stableSinceRef.current == null) stableSinceRef.current = now
        const elapsed = now - stableSinceRef.current
        const nowReady = elapsed >= requiredMs
        if (nowReady && !readyRef.current) justBecameReady = true
        readyRef.current = nowReady
        setReady(nowReady)
      } else {
        stableSinceRef.current = null
        readyRef.current = false
        setReady(false)
      }

      if (justBecameReady) {
        // Zamrażamy podgląd — łatwiej kliknąć Akceptuję/Odrzuć na nieruchomym obrazie.
        frozenRef.current = true
        try { video.pause() } catch (e) {}
        return
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    loopRef.current = loop

    setup()

    return () => {
      cancelledRef.current = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (landmarkerRef.current) landmarkerRef.current.close()
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {})
    }
  }, [])

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  const handleAccept = () => {
    if (step === 'step0') {
      setStep('step1')
    } else if (step === 'step1') {
      setStep('step2')
    } else if (step === 'step2') {
      setStep('step3')
    } else if (step === 'step3') {
      stopCamera()
      setStep('done')
    }
  }

  const handleReject = () => {
    stableSinceRef.current = null
    readyRef.current = false
    setReady(false)
    voiceStableSinceRef.current = null
    voiceConfirmedRef.current = false
    if (step === 'step3') {
      step3PhaseRef.current = 'natural'
      step3StartRef.current = null
      step3CycleRef.current = 0
      setStep3Phase('natural')
      setStep3Cycle(0)
    }
    if (frozenRef.current) {
      frozenRef.current = false
      const video = videoRef.current
      if (video) video.play().catch(() => {})
      rafRef.current = requestAnimationFrame(() => loopRef.current && loopRef.current())
    }
  }

  const handleCancelClick = () => {
    stopCamera()
    onCancel && onCancel()
  }

  const handleFinishClick = () => {
    onComplete && onComplete()
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {step !== 'done' && (
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{STEP_LABELS[step]}</div>
      )}

      {engineStatus === 'error' ? (
        <>
          <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{errorMsg}</div>
          <button className="btn btn-ghost btn-full" onClick={handleCancelClick}>Wróć</button>
        </>
      ) : step === 'done' ? (
        <div style={{
          fontSize: 12, color: 'var(--green)',
          background: '#F0FDF4', borderRadius: 8, padding: '8px 10px',
        }}>
          ✓ Krok 0, Krok 1, Krok 2 (obraz + dźwięk) i Krok 3 (przejścia x3) zaakceptowane —
          <strong> pełna kalibracja wizyjna zakończona!</strong> Nagrywanie słowa do odsłuchania
          i zapis profilu kalibracyjnego zostaną dodane w kolejnym etapie prac.
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-ghost btn-full" onClick={handleFinishClick}>Zamknij</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{
            position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden',
            background: '#000', aspectRatio: '4 / 3',
          }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                transform: 'scaleX(-1)',
              }}
            />
          </div>

          <div style={{ fontSize: 13, textAlign: 'center', marginTop: 10, marginBottom: 10, fontWeight: 700 }}>
            {engineStatus === 'loading' && 'Uruchamianie kamery i modelu wykrywania twarzy…'}
            {engineStatus === 'running' && !ready && step === 'step2' &&
              'Najpierw ustaw głowę, aż obwódka zrobi się zielona — nie ruszaj się, zrób dzióbek i jednocześnie wypowiedz głoskę. Utrzymaj przez 3 sekundy.'}
            {engineStatus === 'running' && !ready && step === 'step3' && (
              step3Phase === 'natural'
                ? `Przejście ${step3Cycle + 1}/3: ustaw głowę w ramce i zamknij naturalnie usta. Utrzymaj 1 sekundę.`
                : step3Phase === 'pause'
                ? `Przejście ${step3Cycle + 1}/3: przerwa — przygotuj się na dzióbek.`
                : `Przejście ${step3Cycle + 1}/3: teraz zrób dzióbek. Utrzymaj 1 sekundę.`
            )}
            {engineStatus === 'running' && !ready && step !== 'step2' && step !== 'step3' && STEP_INSTRUCTIONS[step]}
            {engineStatus === 'running' && ready  && 'Ustawienie wygląda dobrze!'}
          </div>

          {step === 'step1' && debugInfo?.step === 'step1' && (
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)',
              textAlign: 'center', marginTop: -6, marginBottom: 10,
            }}>
              aspekt: {debugInfo.aspect?.toFixed(3) ?? '—'} (próg &lt;0.12) ·{' '}
              uniesienie: {debugInfo.liftRatio?.toFixed(3) ?? '—'} (próg &lt;0.12) ·{' '}
              szerokość: {debugInfo.widthRatio?.toFixed(3) ?? '—'} (próg &lt;1.15)
            </div>
          )}

          {step === 'step2' && debugInfo?.step === 'step2' && (
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)',
              textAlign: 'center', marginTop: -6, marginBottom: 10,
            }}>
              rama: {debugInfo.framedOk ? 'OK' : 'źle'} · poziom dzióbka: {debugInfo.level ?? '—'} ·{' '}
              głośność: {debugInfo.volumeLevel ?? '—'} (rms {debugInfo.rms?.toFixed(3) ?? '—'}) ·{' '}
              głos 1s: {debugInfo.voiceConfirmed ? '✓' : '—'} ·{' '}
              szerokość: {debugInfo.widthRatio?.toFixed(3) ?? '—'} ·{' '}
              otwór: {debugInfo.aspect?.toFixed(3) ?? '—'}
            </div>
          )}

          {step === 'step3' && debugInfo?.step === 'step3' && (
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)',
              textAlign: 'center', marginTop: -6, marginBottom: 10,
            }}>
              faza: {debugInfo.phase} · cykl: {debugInfo.cycle}/3 · rama: {debugInfo.framedOk ? 'OK' : 'źle'}
              {debugInfo.phase === 'natural' && ` · usta OK: ${debugInfo.mouthOk ? 'tak' : 'nie'}`}
              {debugInfo.phase === 'pucker' && ` · poziom dzióbka: ${debugInfo.level ?? '—'}`}
            </div>
          )}

          {ready && (
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              {STEP_QUESTIONS[step]}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAccept}>Akceptuję</button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleReject}>Odrzuć i powtórz</button>
              </div>
            </div>
          )}

          <button className="btn btn-ghost btn-full" onClick={handleCancelClick} style={{ marginTop: 4 }}>
            Anuluj kalibrację
          </button>
        </>
      )}
    </div>
  )
}
