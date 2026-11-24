// Przetwarzanie nagrania słowa „offline” — do ekranu „Wzorzec”.
//
//   analyseBuffer(samples, sr)  → gdzie w nagraniu jest słowo i gdzie są głoski-szumy (s, sz, c, cz)
//   renderTuned(samples, sr, seg, ratio, stretch) → to samo nagranie, w którym JEDEN wskazany szum jest
//        przesunięty w górę/w dół (ratio) i ewentualnie wydłużony (stretch). Reszta słowa bez zmian.
//
// Przesunięcie szumu robimy zmianą prędkości samego odcinka szumu (ratio 0,5 = wszystkie częstotliwości
// o połowę niżej), a długość odtwarzamy z „ziarenek” szumu nakładanych na siebie — szum nie ma melodii,
// więc tak sklejony brzmi naturalnie. Samogłosek nie dotykamy.

const N = 1024, HOP = 256
const BAND_LO = 2000, BAND_HI = 11000, LOW_LO = 150, LOW_HI = 1000

const HANN = (() => { const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); return w })()

// FFT (radix-2, w miejscu)
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t
      }
    }
  }
}

// Moc w pasmach i środek ciężkości szumu dla jednej ramki zaczynającej się w `at`
function frameStats(samples, at, sr, re, im) {
  for (let i = 0; i < N; i++) { re[i] = (samples[at + i] || 0) * HANN[i]; im[i] = 0 }
  fft(re, im)
  const binHz = sr / N
  const lo = Math.floor(BAND_LO / binHz), hi = Math.min(N / 2 - 1, Math.ceil(BAND_HI / binHz))
  const vLo = Math.max(1, Math.floor(LOW_LO / binHz)), vHi = Math.ceil(LOW_HI / binHz)
  let band = 0, mom = 0, low = 0, total = 0
  for (let i = 1; i < N / 2; i++) {
    const p = re[i] * re[i] + im[i] * im[i]
    total += p
    if (i >= lo && i <= hi) { band += p; mom += p * i * binHz }
    if (i >= vLo && i <= vHi) low += p
  }
  return { band, low, total, cog: band > 0 ? mom / band : 0 }
}

const percentile = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0 }

// Środek ciężkości szumu w wycinku nagrania (ważony mocą)
export function cogOf(samples, sr, from = 0, to = samples.length) {
  const re = new Float32Array(N), im = new Float32Array(N)
  let band = 0, mom = 0
  for (let at = from; at + N <= to; at += HOP) { const f = frameStats(samples, at, sr, re, im); band += f.band; mom += f.band * f.cog }
  return band > 0 ? mom / band : 0
}

export function analyseBuffer(samples, sr) {
  const re = new Float32Array(N), im = new Float32Array(N)
  const frames = []
  for (let at = 0; at + N <= samples.length; at += HOP) frames.push({ at, ...frameStats(samples, at, sr, re, im) })
  if (!frames.length) return { segments: [], trim: { start: 0, end: samples.length }, envelope: [] }
  const maxTotal = frames.reduce((m, f) => Math.max(m, f.total), 0)
  const maxBand = frames.reduce((m, f) => Math.max(m, f.band), 0)
  const noiseBand = Math.max(1e-12, percentile(frames.map(f => f.band), 0.1))
  const noiseTotal = Math.max(1e-12, percentile(frames.map(f => f.total), 0.1))

  // słowo = od pierwszej do ostatniej ramki wyraźnie głośniejszej od tła (+ 80 ms zapasu)
  const loud = (f) => f.total > Math.max(noiseTotal * 8, maxTotal * 0.01)
  let a = frames.findIndex(loud), b = frames.length - 1
  while (b > 0 && !loud(frames[b])) b--
  if (a < 0) { a = 0; b = frames.length - 1 }
  const pad = Math.round(0.08 * sr)
  const trim = { start: Math.max(0, frames[a].at - pad), end: Math.min(samples.length, frames[b].at + N + pad) }

  // szum głoski: dużo energii w paśmie 2–11 kHz, więcej niż w paśmie głosu, wyraźnie ponad tłem
  const isHiss = (f) => f.band > noiseBand * 8 && f.band > f.low && f.band > maxBand * 0.03
  const hopMs = (HOP / sr) * 1000
  const maxGap = Math.max(1, Math.round(35 / hopMs)), minLen = Math.max(2, Math.round(40 / hopMs))
  const segments = []
  let cur = null, gap = 0
  const close = () => {
    if (cur && cur.last - cur.first + 1 >= minLen) {
      const fr = frames.slice(cur.first, cur.last + 1)
      const band = fr.reduce((s, f) => s + f.band, 0)
      segments.push({ start: frames[cur.first].at, end: Math.min(samples.length, frames[cur.last].at + N), cog: Math.round(fr.reduce((s, f) => s + f.band * f.cog, 0) / (band || 1)) })
    }
    cur = null
  }
  frames.forEach((f, i) => {
    if (f.at < trim.start || f.at > trim.end) return
    if (isHiss(f)) { if (!cur) cur = { first: i, last: i }; cur.last = i; gap = 0 }
    else if (cur && ++gap > maxGap) close()
  })
  close()

  // obwiednia do rysunku (ok. 120 słupków w obrębie słowa)
  const bars = 120, step = Math.max(1, Math.floor((trim.end - trim.start) / bars)), envelope = []
  for (let i = 0; i < bars; i++) {
    let m = 0
    const s0 = trim.start + i * step
    for (let k = s0; k < s0 + step && k < trim.end; k += 4) m = Math.max(m, Math.abs(samples[k]))
    envelope.push(m)
  }
  return { segments, trim, envelope }
}

// Zmiana prędkości odcinka (interpolacja liniowa): ratio < 1 → niżej i dłużej, ratio > 1 → wyżej i krócej
function resample(src, ratio) {
  const n = Math.max(2, Math.floor(src.length / ratio))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i * ratio, k = Math.floor(x), fr = x - k
    out[i] = (src[k] || 0) * (1 - fr) + (src[Math.min(src.length - 1, k + 1)] || 0) * fr
  }
  return out
}

// Rozciągnięcie/skrócenie szumu do zadanej długości przez nakładanie „ziarenek”
function stretchNoise(src, outLen) {
  const G = Math.min(1024, Math.max(64, src.length >> 1)), H = G >> 2
  const out = new Float32Array(outLen), norm = new Float32Array(outLen)
  const win = new Float32Array(G); for (let i = 0; i < G; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (G - 1))
  const maxIn = Math.max(1, src.length - G)
  for (let o = -G / 2; o < outLen; o += H) {
    const pos = Math.max(0, Math.min(maxIn, Math.round(((o + G / 2) / outLen) * src.length - G / 2 + (Math.random() - 0.5) * H)))
    for (let i = 0; i < G; i++) {
      const j = Math.round(o) + i
      if (j < 0 || j >= outLen) continue
      out[j] += src[pos + i] * win[i]; norm[j] += win[i]
    }
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-6) out[i] /= norm[i]
  return out
}

// Słowo (przycięte do trim) ze strojonym odcinkiem seg. Zwraca { samples, segStart, segEnd } w próbkach wyniku.
export function renderTuned(samples, sr, trim, seg, ratio = 1, stretch = 1) {
  const head = samples.subarray(trim.start, seg ? seg.start : trim.end)
  if (!seg) return { samples: Float32Array.from(head), segStart: 0, segEnd: 0 }
  const body = samples.subarray(seg.start, seg.end)
  const tail = samples.subarray(seg.end, trim.end)
  const untouched = Math.abs(ratio - 1) < 0.005 && Math.abs(stretch - 1) < 0.005
  let mid
  if (untouched) mid = Float32Array.from(body)
  else {
    const shifted = Math.abs(ratio - 1) < 0.005 ? body : resample(body, ratio)
    mid = stretchNoise(shifted, Math.max(64, Math.round(body.length * stretch)))
    // ta sama głośność co w oryginale
    let e0 = 0, e1 = 0
    for (let i = 0; i < body.length; i++) e0 += body[i] * body[i]
    for (let i = 0; i < mid.length; i++) e1 += mid[i] * mid[i]
    const g = e1 > 0 ? Math.sqrt((e0 / body.length) / (e1 / mid.length)) : 1
    for (let i = 0; i < mid.length; i++) mid[i] *= g
  }
  const out = new Float32Array(head.length + mid.length + tail.length)
  out.set(head, 0); out.set(mid, head.length); out.set(tail, head.length + mid.length)
  if (!untouched) {
    // krótkie przejścia na obu końcach, żeby nie było trzasku
    const X = Math.min(Math.round(0.006 * sr), mid.length >> 2)
    for (let i = 0; i < X; i++) {
      const t = i / X
      const a = head.length + i, b = head.length + mid.length - 1 - i
      out[a] = out[a] * t + (body[i] || 0) * (1 - t)
      out[b] = out[b] * t + (body[body.length - 1 - i] || 0) * (1 - t)
    }
  }
  return { samples: out, segStart: head.length, segEnd: head.length + mid.length }
}
