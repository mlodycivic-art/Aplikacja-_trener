// Miernik głosek syczących/szumiących (s, c  ↔  sz, cz).
//
// Co mierzy: "środek ciężkości" szumu głoski w Hz. Dla "s"/"c" szum leży wysoko,
// dla "sz"/"cz" — nisko. Nie rozpoznaje słów i nie ocenia poprawności wymowy;
// podaje tylko liczbę, którą potem porównujemy z nagraniami Karolka.
//
// Osobny od useMicRhythm.js (tamten mierzy tylko głośność) — nic w nim nie zmieniamy.
//
// Użycie:
//   const meter = useSibilantMeter()
//   await meter.start()          // otwiera mikrofon + ~0.7 s pomiaru tła (cisza!)
//   meter.getFrames()            // ramki z ostatnich 3 s (do wykresu na żywo)
//   meter.getInfo()              // { state, sampleRate, noiseDb }
//   meter.startTake()            // początek nagrania jednej próby
//   const take = await meter.stopTake()  // { value, segments, durationMs, url }
//   meter.stop()

import { useRef, useCallback, useMemo } from 'react'

// ── Parametry pomiaru (wspólne dla całego testu) ─────────────────────────────
export const BAND_LO_HZ  = 2000   // dolna granica pasma szumu głosek
export const BAND_HI_HZ  = 11000  // górna granica (wyżej mikrofony telefonów są niepewne)
const LOW_LO_HZ   = 150           // pasmo "głosu" (samogłoski) — do odróżnienia od szumu
const LOW_HI_HZ   = 1000
const NOISE_CAL_MS      = 700     // tyle trwa pomiar tła po włączeniu mikrofonu
const HISS_OVER_NOISE   = 6       // szum głoski musi być ≥ 6× mocniejszy od tła (~8 dB)
const HISS_OVER_VOICE   = 1.0     // i mocniejszy niż pasmo głosu (odcina samogłoski)
const KEEP_MS           = 3000    // długość historii na żywo
export const MIN_SEGMENT_MS = 40  // krótsze "szumy" pomijamy (trzaski, zwarcia k/t)
export const MAX_GAP_MS     = 35  // przerwa krótsza niż to nie dzieli odcinka

// ── Analiza ramek → odcinki szumu ────────────────────────────────────────────
// frames: [{ t, hiss, cog }]  →  [{ startMs, durationMs, cog }]  (cog = mediana odcinka)
export function analyseFrames(frames) {
  const segments = []
  let cur = null
  let lastHissT = 0
  const close = () => {
    if (!cur) return
    const dur = cur.endT - cur.startT
    if (dur >= MIN_SEGMENT_MS && cur.cogs.length >= 2) {
      const sorted = [...cur.cogs].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      segments.push({ startMs: Math.round(cur.startT), durationMs: Math.round(dur), cog: Math.round(median) })
    }
    cur = null
  }
  for (const f of frames) {
    if (f.hiss) {
      if (cur && f.t - lastHissT > MAX_GAP_MS) close()
      if (!cur) cur = { startT: f.t, endT: f.t, cogs: [] }
      cur.endT = f.t
      cur.cogs.push(f.cog)
      lastHissT = f.t
    } else if (cur && f.t - lastHissT > MAX_GAP_MS) {
      close()
    }
  }
  close()
  return segments
}

// Wynik jednej próby = najniższy odcinek szumu w nagraniu.
// Dlaczego najniższy: w "soczek" są dwa szumy — "s" (wysoko) i "cz" (nisko).
// W "socek" oba są wysoko. Najniższy odcinek odróżnia więc te dwa słowa.
export function takeValue(segments) {
  if (!segments.length) return null
  return Math.min(...segments.map(s => s.cog))
}

// ── Ocena pary: błędne vs poprawne ───────────────────────────────────────────
// Progi poniżej służą WYŁĄCZNIE do opisu wyniku testu ("czy da się odróżnić").
// Nie są progami poprawnej wymowy — te ustawimy z nagrań zatwierdzonych przez logopedkę.
export function pairVerdict(wrongVals, rightVals) {
  const w = wrongVals.filter(v => v != null)
  const r = rightVals.filter(v => v != null)
  if (w.length < 2 || r.length < 2) return { level: 'none', label: 'Za mało nagrań (min. 2 + 2)' }
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length
  const mw = mean(w), mr = mean(r)
  const gap = Math.min(...w) - Math.max(...r)   // > 0: żadne nagrania się nie nakładają
  const diff = Math.round(mw - mr)
  if (gap >= 400)  return { level: 'good', label: 'Wyraźnie rozdzielone', diff, gap: Math.round(gap) }
  if (diff >= 500) return { level: 'mid',  label: 'Częściowo rozdzielone (nagrania się nakładają)', diff, gap: Math.round(gap) }
  return { level: 'bad', label: 'Nie do odróżnienia tym pomiarem', diff, gap: Math.round(gap) }
}

export function useSibilantMeter() {
  const ctxRef      = useRef(null)
  const analyserRef = useRef(null)
  const streamRef   = useRef(null)
  const rafRef      = useRef(null)
  const specRef     = useRef(null)   // Float32Array dB
  const noiseRef    = useRef(null)   // Float32Array moc tła na prążek
  const calRef      = useRef({ sum: null, n: 0, until: 0 })
  const framesRef   = useRef([])
  const infoRef     = useRef({ state: 'off', sampleRate: 0, noiseDb: null })
  const takeRef     = useRef(null)   // { startT, frames, recorder, chunks }

  const loop = useCallback(() => {
    const analyser = analyserRef.current
    const spec = specRef.current
    if (analyser && spec) {
      analyser.getFloatFrequencyData(spec)
      const now = performance.now()
      const sr = infoRef.current.sampleRate
      const binHz = sr / analyser.fftSize
      const nBins = spec.length
      const cal = calRef.current

      if (infoRef.current.state === 'calibrating') {
        // Uśredniamy moc tła w każdym prążku
        for (let i = 0; i < nBins; i++) cal.sum[i] += Math.pow(10, spec[i] / 10)
        cal.n++
        if (now >= cal.until && cal.n > 0) {
          const noise = new Float32Array(nBins)
          let band = 0
          const lo = Math.floor(BAND_LO_HZ / binHz)
          const hi = Math.min(nBins - 1, Math.ceil(BAND_HI_HZ / binHz))
          for (let i = 0; i < nBins; i++) noise[i] = cal.sum[i] / cal.n
          for (let i = lo; i <= hi; i++) band += noise[i]
          noiseRef.current = noise
          infoRef.current = { ...infoRef.current, state: 'on', noiseDb: Math.round(10 * Math.log10(band + 1e-20)) }
        }
      } else if (infoRef.current.state === 'on') {
        const noise = noiseRef.current
        const lo  = Math.floor(BAND_LO_HZ / binHz)
        const hi  = Math.min(nBins - 1, Math.ceil(BAND_HI_HZ / binHz))
        const vLo = Math.floor(LOW_LO_HZ / binHz)
        const vHi = Math.ceil(LOW_HI_HZ / binHz)
        let band = 0, weighted = 0, noiseBand = 0, voice = 0
        for (let i = lo; i <= hi; i++) {
          const p = Math.max(0, Math.pow(10, spec[i] / 10) - noise[i] * 1.5)
          band += p
          weighted += p * (i * binHz)
          noiseBand += noise[i]
        }
        for (let i = vLo; i <= vHi; i++) voice += Math.max(0, Math.pow(10, spec[i] / 10) - noise[i] * 1.5)

        const hiss = band > noiseBand * HISS_OVER_NOISE && band > voice * HISS_OVER_VOICE
        const cog  = band > 0 ? weighted / band : 0
        const frame = { t: now, hiss, cog, db: 10 * Math.log10(band + 1e-20) }

        const frames = framesRef.current
        frames.push(frame)
        while (frames.length && now - frames[0].t > KEEP_MS) frames.shift()
        if (takeRef.current) takeRef.current.frames.push(frame)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  const start = useCallback(async () => {
    try {
      // Wyłączamy "ulepszacze" przeglądarki — redukcja szumów potrafi wyciąć właśnie szum głosek
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      })
      streamRef.current = stream
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024                 // ~21 ms okna — "cz" trwa krótko
      analyser.smoothingTimeConstant = 0      // bez wygładzania w czasie
      source.connect(analyser)
      ctxRef.current = ctx
      analyserRef.current = analyser
      specRef.current = new Float32Array(analyser.frequencyBinCount)
      calRef.current = {
        sum: new Float64Array(analyser.frequencyBinCount), n: 0,
        until: performance.now() + NOISE_CAL_MS,
      }
      framesRef.current = []
      infoRef.current = { state: 'calibrating', sampleRate: ctx.sampleRate, noiseDb: null }
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(loop)
      return true
    } catch (e) {
      console.warn('Mikrofon niedostępny:', e)
      infoRef.current = { state: 'error', sampleRate: 0, noiseDb: null }
      return false
    }
  }, [loop])

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    try { takeRef.current?.recorder?.stop() } catch (e) {}
    takeRef.current = null
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch (e) {}
    try { ctxRef.current?.close() } catch (e) {}
    streamRef.current = null
    ctxRef.current = null
    analyserRef.current = null
    infoRef.current = { state: 'off', sampleRate: 0, noiseDb: null }
  }, [])

  // Ponowny pomiar tła (np. po zmianie pokoju) bez zamykania mikrofonu
  const recalibrate = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    calRef.current = {
      sum: new Float64Array(analyser.frequencyBinCount), n: 0,
      until: performance.now() + NOISE_CAL_MS,
    }
    infoRef.current = { ...infoRef.current, state: 'calibrating' }
  }, [])

  const startTake = useCallback(() => {
    if (infoRef.current.state !== 'on' || takeRef.current) return false
    const take = { startT: performance.now(), frames: [], recorder: null, chunks: [] }
    try {
      if (window.MediaRecorder && streamRef.current) {
        const rec = new MediaRecorder(streamRef.current)
        rec.ondataavailable = (e) => { if (e.data && e.data.size) take.chunks.push(e.data) }
        rec.start()
        take.recorder = rec
      }
    } catch (e) { take.recorder = null }
    takeRef.current = take
    return true
  }, [])

  const stopTake = useCallback(() => new Promise((resolve) => {
    const take = takeRef.current
    takeRef.current = null
    if (!take) { resolve(null); return }
    const durationMs = Math.round(performance.now() - take.startT)
    const rel = take.frames.map(f => ({ ...f, t: f.t - take.startT }))
    const segments = analyseFrames(rel)
    const result = { value: takeValue(segments), segments, durationMs, url: null, blob: null }
    const rec = take.recorder
    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => {
        try {
          const blob = new Blob(take.chunks, { type: rec.mimeType || 'audio/webm' })
          result.blob = blob
          result.url = URL.createObjectURL(blob)
        } catch (e) {}
        resolve(result)
      }
      try { rec.stop() } catch (e) { resolve(result) }
    } else {
      resolve(result)
    }
  }), [])

  const getFrames = useCallback(() => framesRef.current, [])
  const getInfo   = useCallback(() => infoRef.current, [])

  // Stały obiekt między renderami — ekran używa go w zależnościach useEffect
  return useMemo(
    () => ({ start, stop, recalibrate, startTake, stopTake, getFrames, getInfo }),
    [start, stop, recalibrate, startTake, stopTake, getFrames, getInfo]
  )
}
