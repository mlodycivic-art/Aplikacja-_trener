// Hook mierzący, jak duża część czasu "cichego" powtórzenia (przebieg 2 w Speech
// Rhythm) była wypełniona mową dziecka. Nie rozpoznaje TREŚCI (patrz zasada
// ustalona dla mikrofonu: rytm/tempo, nie treść) — mierzy tylko pokrycie czasowe:
// czy dziecko mówiło w tym samym tempie i przez ten sam czas co lektor.
//
// Użycie:
//   const mic = useMicRhythm()
//   mic.start()              // otwiera mikrofon, zaczyna liczyć
//   mic.setWindowActive(bool) // true = jesteśmy w oknie czasowym, które ma być pokryte mową
//   mic.stop()                // zamyka mikrofon
//   const { ratio, speakingMs, windowMs } = mic.getResult()

import { useRef, useCallback } from 'react'

const SPEAKING_RMS_THRESHOLD = 0.06 // te same progi co w kalibracji wizji (poziom 1 głośności)

export function useMicRhythm() {
  const audioCtxRef   = useRef(null)
  const analyserRef   = useRef(null)
  const dataRef       = useRef(null)
  const streamRef     = useRef(null)
  const rafRef        = useRef(null)
  const lastTsRef     = useRef(0)
  const windowActiveRef = useRef(false)
  const windowMsRef     = useRef(0)
  const speakingMsRef   = useRef(0)

  const loop = useCallback((ts) => {
    const analyser = analyserRef.current
    const data = dataRef.current
    if (analyser && data) {
      analyser.getByteTimeDomainData(data)
      let sumSquares = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sumSquares += v * v
      }
      const rms = Math.sqrt(sumSquares / data.length)

      if (lastTsRef.current) {
        const dt = ts - lastTsRef.current
        if (windowActiveRef.current) {
          windowMsRef.current += dt
          if (rms > SPEAKING_RMS_THRESHOLD) speakingMsRef.current += dt
        }
      }
      lastTsRef.current = ts
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {})
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser
      dataRef.current = new Uint8Array(analyser.fftSize)
      lastTsRef.current = 0
      windowMsRef.current = 0
      speakingMsRef.current = 0
      rafRef.current = requestAnimationFrame(loop)
      return true
    } catch (e) {
      console.warn('Mikrofon niedostępny:', e)
      return false
    }
  }, [loop])

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch (e) {}
    try { audioCtxRef.current?.close() } catch (e) {}
    streamRef.current = null
    audioCtxRef.current = null
    analyserRef.current = null
  }, [])

  const setWindowActive = useCallback((active) => {
    windowActiveRef.current = active
  }, [])

  const resetCounters = useCallback(() => {
    windowMsRef.current = 0
    speakingMsRef.current = 0
  }, [])

  const getResult = useCallback(() => {
    const windowMs   = windowMsRef.current
    const speakingMs = speakingMsRef.current
    const ratio = windowMs > 0 ? Math.min(1, speakingMs / windowMs) : 0
    return { ratio, speakingMs, windowMs }
  }, [])

  return { start, stop, setWindowActive, resetCounters, getResult }
}
