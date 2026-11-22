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
  const perWordRef      = useRef([])      // [{ ms, speak }] — osobno dla każdego słowa

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
          const i = wordRef.current
          const w = perWordRef.current[i] || (perWordRef.current[i] = { ms: 0, speak: 0 })
          w.ms += dt
          if (speaking) w.speak += dt
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

  const markWord = useCallback((i) => { wordRef.current = i }, [])

  const resetCounters = useCallback(() => {
    windowMsRef.current = 0
    speakingMsRef.current = 0
    perWordRef.current = []
    wordRef.current = 0
  }, [])

  // Wynik = ile słów zdania dziecko powiedziało „w swoim czasie” (gdy słowo było podkreślane).
  // Słowo jest zaliczone, gdy głos było słychać przez co najmniej 30% jego czasu (min. 120 ms).
  // Naturalne przerwy w mowie (oddech, zwarcia w „k”, „p”, „t”) nie obniżają wyniku.
  // Cisza przez całe zdanie = 0. Bez podziału na słowa (stary sposób): zwykłe pokrycie czasu.
  const getResult = useCallback((wordCount, minFrac = 0.3) => {
    const windowMs   = windowMsRef.current
    const speakingMs = speakingMsRef.current
    let ratio = windowMs > 0 ? Math.min(1, speakingMs / windowMs) : 0
    let wordsSpoken = null
    if (wordCount > 0) {
      wordsSpoken = 0
      const heard = (i) => { const w = perWordRef.current[i]; return !!w && w.ms > 0 && w.speak >= Math.min(w.ms * 0.8, Math.max(120, w.ms * minFrac)) }
      for (let i = 0; i < wordCount; i++) {
        const w = perWordRef.current[i]
        // krótkie słowo („ma”, „i”) dziecko często mówi z małym opóźnieniem — liczy się też głos tuż po nim
        if (heard(i) || (w && w.ms < 450 && i + 1 < wordCount && heard(i + 1))) wordsSpoken++
      }
      ratio = wordsSpoken / wordCount
    }
    return { ratio, speakingMs, windowMs, wordsSpoken }
  }, [])

  return { start, stop, setWindowActive, markWord, resetCounters, getResult }
}
