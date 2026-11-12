// Silnik kamery + MediaPipe do użycia W ĆWICZENIACH I GRACH (poza kreatorem kalibracji).
//
// Kreator kalibracji (VisionWizard.jsx) ma własną, sprawdzoną pętlę i jej nie ruszamy.
// Ten hook daje to samo źródło punktów twarzy każdej grze: jedna inicjalizacja na sesję,
// obraz z kamery NIE jest pokazywany dziecku (gra rysuje własną grafikę).
//
// Użycie:
//   const face = useFaceEngine()
//   await face.start()            // kamera + model; zwraca true/false
//   face.getPoints()              // punkty twarzy z ostatniej klatki albo null (brak twarzy)
//   face.getCanvasSize()          // { width, height } obrazu — potrzebne detektorom
//   face.getState()               // 'off' | 'loading' | 'on' | 'error'
//   face.stop()

import { useRef, useCallback, useMemo } from 'react'
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision'

// Te same adresy co w kreatorze kalibracji
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

export function useFaceEngine() {
  const videoRef      = useRef(null)
  const streamRef     = useRef(null)
  const landmarkerRef = useRef(null)
  const rafRef        = useRef(null)
  const pointsRef     = useRef(null)
  const blendRef      = useRef(null)
  const lastSeenRef   = useRef(0)
  const stateRef      = useRef('off')
  const errorRef      = useRef('')
  const runIdRef      = useRef(0)

  const loop = useCallback(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    if (video && landmarker && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const result = landmarker.detectForVideo(video, performance.now())
        const points = result.faceLandmarks && result.faceLandmarks[0]
        pointsRef.current = points || null
        // ~50 gotowych miar mimiki (ściągnięcie warg, otwarcie żuchwy…) jako { nazwa: wartość 0–1 }
        const cats = points && result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories
        if (cats) { const b = {}; for (const c of cats) b[c.categoryName] = c.score; blendRef.current = b } else blendRef.current = null
        if (points) lastSeenRef.current = performance.now()
      } catch (e) { /* pojedyncza klatka może się nie udać — próbujemy następną */ }
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  const stop = useCallback(() => {
    runIdRef.current++
    cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch (e) {}
    try { landmarkerRef.current?.close() } catch (e) {}
    streamRef.current = null
    landmarkerRef.current = null
    videoRef.current = null
    pointsRef.current = null
    stateRef.current = 'off'
  }, [])

  const start = useCallback(async () => {
    if (stateRef.current === 'loading' || stateRef.current === 'on') return stateRef.current === 'on'
    const runId = ++runIdRef.current
    stateRef.current = 'loading'
    errorRef.current = ''
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      if (runId !== runIdRef.current) { stream.getTracks().forEach(t => t.stop()); return false }
      streamRef.current = stream

      // Element wideo istnieje tylko w pamięci — nie trafia na ekran dziecka
      const video = document.createElement('video')
      video.playsInline = true
      video.muted = true
      video.srcObject = stream
      videoRef.current = video
      try { await video.play() } catch (e) {
        // StrictMode / szybkie wyjście z ekranu przerywa play() — to nie jest błąd kamery
        if (e?.name !== 'AbortError') throw e
      }

      const resolver = await FilesetResolver.forVisionTasks(WASM_URL)
      let landmarker
      try {
        landmarker = await FaceLandmarker.createFromOptions(resolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        })
      } catch (e) {
        landmarker = await FaceLandmarker.createFromOptions(resolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        })
      }
      if (runId !== runIdRef.current) { try { landmarker.close() } catch (e) {} ; return false }
      landmarkerRef.current = landmarker
      stateRef.current = 'on'
      rafRef.current = requestAnimationFrame(loop)
      return true
    } catch (e) {
      console.warn('Kamera / model niedostępne:', e)
      errorRef.current = e?.name === 'NotAllowedError'
        ? 'Brak zgody na kamerę w przeglądarce.'
        : 'Nie udało się uruchomić kamery lub pobrać modelu (potrzebny internet przy pierwszym uruchomieniu).'
      try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch (e2) {}
      streamRef.current = null
      stateRef.current = 'error'
      return false
    }
  }, [loop])

  const getPoints     = useCallback(() => pointsRef.current, [])
  const getBlendshapes = useCallback(() => blendRef.current, [])
  // Element wideo — WYŁĄCZNIE do podglądu dla dorosłego podczas kalibracji (dziecko obrazu nie widzi)
  const getVideo      = useCallback(() => videoRef.current, [])
  const getState      = useCallback(() => stateRef.current, [])
  const getError      = useCallback(() => errorRef.current, [])
  const msSinceFace   = useCallback(() => (lastSeenRef.current ? performance.now() - lastSeenRef.current : Infinity), [])
  const getCanvasSize = useCallback(() => {
    const v = videoRef.current
    return { width: v?.videoWidth || 640, height: v?.videoHeight || 480 }
  }, [])

  return useMemo(
    () => ({ start, stop, getPoints, getBlendshapes, getVideo, getState, getError, msSinceFace, getCanvasSize }),
    [start, stop, getPoints, getBlendshapes, getVideo, getState, getError, msSinceFace, getCanvasSize]
  )
}
