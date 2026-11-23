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

import { useRef, useCallback, useMemo } from 'react'
import { scoreWords } from './speechScore'

// Próg „mówi / nie mówi” dobiera się sam do pokoju i mikrofonu (bez kalibracji):
// śledzimy poziom ciszy, a mowa to wyraźnie więcej niż cisza. Stały próg 0.06 był za wysoki
// dla spokojnego głosu z odległości ekranu.
const MIN_THRESHOLD = 0.012
const MAX_THRESHOLD = 0.06

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
  const floorRef        = useRef(0.004)   // poziom ciszy (tła)
  const wordRef         = useRef(0)       // które słowo jest teraz podkreślane
  const framesRef       = useRef(0)
  const timelineRef     = useRef([])      // [{ t, dt, speaking }] — ramki z otwartego okna słuchania
  const marksRef        = useRef([])      // [{ i, t }] — początki słów

  const loop = useCallback((ts) => {
    const analyser = analyserRef.current
    const data = dataRef.current
    if (analyser && data) {
      let sumSquares = 0
      if (data instanceof Float32Array) {
        analyser.getFloatTimeDomainData(data)
        for (let i = 0; i < data.length; i++) sumSquares += data[i] * data[i]
      } else {
        analyser.getByteTimeDomainData(data)
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sumSquares += v * v }
      }
      const rms = Math.sqrt(sumSquares / data.length)

      // Poziom ciszy: szybko w dół (gdy jest ciszej), bardzo wolno w górę (ok. 3% na sekundę),
      // więc kilka sekund mówienia go nie podniesie, a zmiana hałasu w pokoju — po chwili tak.
      // Pierwsza sekunda po włączeniu mikrofonu: bierzemy najcichszy zmierzony poziom.
      framesRef.current += 1
      const f = floorRef.current
      if (framesRef.current <= 60) floorRef.current = framesRef.current === 1 ? rms : Math.min(f, rms)
      else floorRef.current = rms < f ? f + (rms - f) * 0.5 : f * 1.0005 + 0.000002
      const threshold = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, floorRef.current * 3 + 0.004))

      if (lastTsRef.current) {
        const dt = Math.min(100, ts - lastTsRef.current)
        if (windowActiveRef.current) {
          const speaking = rms > threshold
          windowMsRef.current += dt
          if (speaking) speakingMsRef.current += dt
          timelineRef.current.push({ t: ts, dt, speaking })
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
      dataRef.current = typeof analyser.getFloatTimeDomainData === 'function'
        ? new Float32Array(analyser.fftSize) : new Uint8Array(analyser.fftSize)
      framesRef.current = 0
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

  const markWord = useCallback((i) => { wordRef.current = i; marksRef.current.push({ i, t: performance.now() }) }, [])

  const resetCounters = useCallback(() => {
    windowMsRef.current = 0
    speakingMsRef.current = 0
    timelineRef.current = []
    marksRef.current = []
    wordRef.current = 0
  }, [])

  // Które słowa dziecko powiedziało „w swoim czasie” — patrz scoreWords() w useSpeechJudge.js
  const getHeard = useCallback((wordCount, opts) => scoreWords(timelineRef.current, marksRef.current, wordCount, opts), [])

  const getResult = useCallback((wordCount, opts) => {
    const windowMs = windowMsRef.current, speakingMs = speakingMsRef.current
    const heard = wordCount > 0 ? getHeard(wordCount, opts) : []
    const ratio = wordCount > 0 ? heard.filter(Boolean).length / wordCount : (windowMs > 0 ? Math.min(1, speakingMs / windowMs) : 0)
    return { ratio, speakingMs, windowMs, heard }
  }, [getHeard])

  return useMemo(() => ({ start, stop, setWindowActive, markWord, resetCounters, getResult, getHeard }),
    [start, stop, setWindowActive, markWord, resetCounters, getResult, getHeard])
}
