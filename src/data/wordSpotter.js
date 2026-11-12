// Wyłapywanie WŁASNYCH słów w ciągłej mowie — bez rozpoznawania mowy i bez internetu.
//
// Pomysł: każde słowo z listy osoba nagrywa kilka razy. Z nagrania zapamiętujemy "kształt"
// słowa: jak w kolejnych chwilach rozkłada się energia w pasmach głosu (samogłoski, rytm,
// miejsca szumu). W ciągłej mowie szukamy fragmentów o podobnym kształcie (dopasowanie
// z rozciąganiem w czasie, DTW), bo to samo słowo raz jest wypowiedziane szybciej, raz wolniej.
//
// Kształt celowo NIE rozróżnia "s" od "sz": cały szum powyżej 2,8 kHz to jedna cecha
// ("tu jest szum głoski"). Dzięki temu wzorzec "czemu" znajduje także "cemu", a o tym,
// która to była głoska, rozstrzyga osobno miernik szumu (useSibilantMeter + próg z kalibracji).
//
// Ten plik to czysta logika (bez Reacta i bez mikrofonu), żeby dało się ją testować osobno.

import { parseSibilants, judgeUtterance } from './sibilants'
import { classifyValue } from './patternStore'

export const SLOT_MS = 20                       // siatka czasu cech
// Pasma "kształtu" głosu: 10 pasm 200–2600 Hz (formanty samogłosek) + 1 pasmo szumu głosek
const LOW_EDGES = [200, 300, 420, 560, 730, 930, 1170, 1450, 1780, 2170, 2600]
const HISS_LO = 2800, HISS_HI = 11000
export const N_BANDS = LOW_EDGES.length         // 10 pasm niskich + 1 szumowe = 11
export const N_FEAT  = N_BANDS + 1              // + poziom energii
const SHAPE_RANGE_DB  = 30                      // kształt: ile dB poniżej najmocniejszego pasma jeszcze liczymy
const ENERGY_RANGE_DB = 40                      // energia: ile dB poniżej lokalnego szczytu
const ENERGY_WEIGHT   = 1.5
const SILENCE_DB      = 32                      // ramka cichsza o tyle od lokalnego szczytu = cisza
const REF_HALF_SLOTS  = 25                      // lokalny szczyt głośności: ±0,5 s
const HISS_DOMINANT_DB = 6                      // szum głoski mocniejszy o tyle od pasm głosu = ramka "szumowa"

// ── Widmo → wektor pasm (wywoływane przez miernik dla każdej ramki) ──────────
// spec: Float32Array dB z AnalyserNode; noise: moc tła na prążek (albo null).
// Zwraca Float32Array(N_BANDS) z mocą (liniową) ponad tłem w każdym paśmie.
export function bandVector(spec, noise, binHz) {
  const out = new Float32Array(N_BANDS)
  const n = spec.length
  const power = (i) => {
    const p = Math.pow(10, spec[i] / 10) - (noise ? noise[i] * 1.5 : 0)
    return p > 0 ? p : 0
  }
  for (let b = 0; b < N_BANDS - 1; b++) {
    const lo = Math.max(1, Math.round(LOW_EDGES[b] / binHz))
    const hi = Math.min(n - 1, Math.max(lo, Math.round(LOW_EDGES[b + 1] / binHz) - 1))
    let s = 0
    for (let i = lo; i <= hi; i++) s += power(i)
    out[b] = s
  }
  const lo = Math.round(HISS_LO / binHz), hi = Math.min(n - 1, Math.round(HISS_HI / binHz))
  let s = 0
  for (let i = lo; i <= hi; i++) s += power(i)
  out[N_BANDS - 1] = s
  return out
}

// ── Ramki miernika → cechy na równej siatce 20 ms ────────────────────────────
// frames: [{ t (ms), bands: Float32Array(N_BANDS), loud }]. Przeglądarka podaje ramki
// nierówno (60 lub 120 razy na sekundę, czasem z dziurą), więc uśredniamy je w przedziałach.
// Zwraca { feat: Float32Array(nSlots * N_FEAT), nSlots, t0 } albo null.
export function featuresFromFrames(frames) {
  const fr = frames.filter(f => f.bands)
  if (fr.length < 4) return null
  const t0 = fr[0].t
  const nSlots = Math.floor((fr[fr.length - 1].t - t0) / SLOT_MS) + 1
  if (nSlots < 4) return null
  const sums = new Float64Array(nSlots * N_BANDS)
  const counts = new Uint16Array(nSlots)
  for (const f of fr) {
    const s = Math.min(nSlots - 1, Math.floor((f.t - t0) / SLOT_MS))
    counts[s]++
    for (let b = 0; b < N_BANDS; b++) sums[s * N_BANDS + b] += f.bands[b]
  }
  // dziury (brak ramki w przedziale) wypełniamy poprzednią wartością
  for (let s = 0; s < nSlots; s++) {
    if (counts[s]) { for (let b = 0; b < N_BANDS; b++) sums[s * N_BANDS + b] /= counts[s] }
    else if (s > 0) { for (let b = 0; b < N_BANDS; b++) sums[s * N_BANDS + b] = sums[(s - 1) * N_BANDS + b] }
  }
  const db = new Float32Array(nSlots * N_BANDS)
  const tot = new Float32Array(nSlots)
  for (let s = 0; s < nSlots; s++) {
    let sum = 0
    for (let b = 0; b < N_BANDS; b++) {
      const p = sums[s * N_BANDS + b]
      sum += p
      db[s * N_BANDS + b] = 10 * Math.log10(p + 1e-14)
    }
    tot[s] = 10 * Math.log10(sum + 1e-14)
  }
  // lokalny szczyt głośności: słowo w środku długiej wypowiedzi bywa cichsze niż jej początek
  const feat = new Float32Array(nSlots * N_FEAT)
  for (let s = 0; s < nSlots; s++) {
    let ref = -Infinity
    const a = Math.max(0, s - REF_HALF_SLOTS), z = Math.min(nSlots - 1, s + REF_HALF_SLOTS)
    for (let k = a; k <= z; k++) if (tot[k] > ref) ref = tot[k]
    const rel = tot[s] - ref
    const o = s * N_FEAT
    if (rel < -SILENCE_DB) {
      for (let b = 0; b < N_BANDS; b++) feat[o + b] = -1
      feat[o + N_BANDS] = -ENERGY_WEIGHT
      continue
    }
    let mx = -Infinity, mxLow = -Infinity
    for (let b = 0; b < N_BANDS; b++) {
      const v = db[s * N_BANDS + b]
      if (v > mx) mx = v
      if (b < N_BANDS - 1 && v > mxLow) mxLow = v
    }
    if (db[s * N_BANDS + N_BANDS - 1] - mxLow > HISS_DOMINANT_DB) {
      // ramka zdominowana przez szum głoski: jeden wspólny kształt dla "s" i "sz"
      // ("sz" wchodzi energią w pasma poniżej 2,6 kHz, "s" nie — bez tego wzorzec odróżniałby je)
      for (let b = 0; b < N_BANDS - 1; b++) feat[o + b] = -1
      feat[o + N_BANDS - 1] = 0
    } else {
      for (let b = 0; b < N_BANDS; b++) {
        const v = (db[s * N_BANDS + b] - mx) / SHAPE_RANGE_DB
        feat[o + b] = v < -1 ? -1 : v
      }
    }
    const e = rel / ENERGY_RANGE_DB
    feat[o + N_BANDS] = (e < -1 ? -1 : e) * ENERGY_WEIGHT
  }
  return { feat, nSlots, t0 }
}

// Przycięcie nagrania wzorca do samego słowa (pierwsza–ostatnia głośna ramka, z małym zapasem)
export function trimToSpeech(frames, marginMs = 30) {
  let first = -1, last = -1
  for (let i = 0; i < frames.length; i++) if (frames[i].loud) { if (first < 0) first = i; last = i }
  if (first < 0) return []
  const t1 = frames[first].t - marginMs, t2 = frames[last].t + marginMs
  return frames.filter(f => f.t >= t1 && f.t <= t2)
}

// ── Zapis cech w localStorage (1 bajt na liczbę, base64) ─────────────────────
export function encodeFeat(feat) {
  let s = ''
  for (let i = 0; i < feat.length; i++) {
    const isEnergy = i % N_FEAT === N_BANDS
    const v = isEnergy ? feat[i] / ENERGY_WEIGHT : feat[i]
    s += String.fromCharCode(Math.max(0, Math.min(255, Math.round((v + 1) * 255))))
  }
  return btoa(s)
}
export function decodeFeat(b64) {
  const s = atob(b64)
  const feat = new Float32Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const v = s.charCodeAt(i) / 255 - 1
    feat[i] = i % N_FEAT === N_BANDS ? v * ENERGY_WEIGHT : v
  }
  return feat
}

// ── Dopasowanie wzorca do fragmentu dłuższej wypowiedzi (DTW z wolnym początkiem i końcem) ──
const MIN_LEN_RATIO = 0.55, MAX_LEN_RATIO = 1.8   // słowo może być do ~2× wolniej lub szybciej niż wzorzec

// tpl, seq: Float32Array cech; zwraca dla każdego możliwego końca j: wynik (średnia odległość
// na krok dopasowania; mniej = bardziej podobne) i początek fragmentu.
export function dtwScan(tpl, seq) {
  const n = tpl.length / N_FEAT, m = seq.length / N_FEAT
  const score = new Float32Array(m).fill(Infinity)
  const start = new Int32Array(m).fill(-1)
  if (n < 3 || m < 3) return { score, start, n, m }
  let pD = new Float32Array(n), pL = new Int32Array(n), pS = new Int32Array(n)
  let cD = new Float32Array(n), cL = new Int32Array(n), cS = new Int32Array(n)
  for (let j = 0; j < m; j++) {
    const oj = j * N_FEAT
    for (let i = 0; i < n; i++) {
      const oi = i * N_FEAT
      let d = 0
      for (let k = 0; k < N_FEAT; k++) { const x = tpl[oi + k] - seq[oj + k]; d += x * x }
      d = Math.sqrt(d / N_FEAT)
      if (i === 0) { cD[0] = d; cL[0] = 1; cS[0] = j; continue }   // wolny początek: wzorzec może zacząć się w dowolnym miejscu
      // trzy ruchy: po przekątnej, "wzorzec idzie dalej" (ta sama ramka mowy), "mowa idzie dalej"
      let bD = cD[i - 1], bL = cL[i - 1], bS = cS[i - 1]
      if (j > 0) {
        if (pD[i - 1] / pL[i - 1] < bD / bL) { bD = pD[i - 1]; bL = pL[i - 1]; bS = pS[i - 1] }
        if (pD[i] / pL[i] < bD / bL)         { bD = pD[i];     bL = pL[i];     bS = pS[i] }
      }
      cD[i] = bD + d; cL[i] = bL + 1; cS[i] = bS
    }
    const len = j - cS[n - 1] + 1
    if (len >= n * MIN_LEN_RATIO && len <= n * MAX_LEN_RATIO) {
      score[j] = cD[n - 1] / cL[n - 1]
      start[j] = cS[n - 1]
    }
    const tD = pD, tL = pL, tS = pS
    pD = cD; pL = cL; pS = cS
    cD = tD; cL = tL; cS = tS
  }
  return { score, start, n, m }
}

export function bestMatch(tpl, seq) {
  const { score, start } = dtwScan(tpl, seq)
  let best = Infinity, bj = -1
  for (let j = 0; j < score.length; j++) if (score[j] < best) { best = score[j]; bj = j }
  return { score: best, startSlot: bj >= 0 ? start[bj] : -1, endSlot: bj }
}

// ── Rdzeń słowa ──────────────────────────────────────────────────────────────
// Żeby jedno nagranie „szkoła” łapało też „szkoły” i „szkole”, wzorzec można dopasowywać bez końcówki:
// model.frac < 1 oznacza „bierz tylko początkową część nagrania” (rdzeń, patrz stemOf w wordBase.js).
// Dotyczy nagrań podstawowych; wzorce dopisane z testu (ostatnie model.extra sztuk) są już wycięte z mowy.
export function matchTakes(m) {
  const f = m.frac ?? 1
  const nBase = m.takes.length - (m.extra || 0)
  return m.takes.map((t, i) => {
    if (i >= nBase || f >= 1) return t
    const slots = Math.max(4, Math.round((t.length / N_FEAT) * f))
    return t.subarray(0, Math.min(t.length, slots * N_FEAT))
  })
}

// ── Model słowa i progi ──────────────────────────────────────────────────────
// takes: [Float32Array cech] kilku nagrań tego samego słowa.
// intra = jak bardzo nagrania tego samego słowa różnią się MIĘDZY SOBĄ (im mniej, tym stabilniej).
export function intraDistance(takes) {
  if (takes.length < 2) return null
  let worst = 0
  for (let a = 0; a < takes.length; a++) for (let b = 0; b < takes.length; b++) {
    if (a === b) continue
    const s = bestMatch(takes[a], takes[b]).score
    if (Number.isFinite(s) && s > worst) worst = s
  }
  return worst || null
}

const MIN_THRESHOLD = 0.05
export const RELIABLE_MARGIN = 1.2    // obce słowa muszą być co najmniej o 20% "dalej" niż własne nagrania

// models: { [word]: { takes: [Float32Array], intra } } → dopisuje threshold, inter, reliable.
// inter = najlepsze dopasowanie wzorca do nagrań INNYCH słów (im więcej, tym trudniej o pomyłkę).
// Słów zawartych jedno w drugim ("może" w "możesz") nie porównujemy — tam wygrywa dłuższe.
export function calibrateThresholds(models) {
  const words = Object.keys(models)
  for (const w of words) {
    const m = models[w]
    let inter = Infinity
    for (const v of words) {
      if (v === w || v.includes(w) || w.includes(v)) continue
      const nBaseV = models[v].takes.length - (models[v].extra || 0)
      for (const other of models[v].takes.slice(0, nBaseV)) for (const tpl of matchTakes(m)) {
        const s = bestMatch(tpl, other).score
        if (s < inter) inter = s
      }
    }
    const intra = m.intra ?? MIN_THRESHOLD
    m.inter = Number.isFinite(inter) ? inter : null
    if (m.inter == null) { m.threshold = Math.max(MIN_THRESHOLD, intra * 1.4); m.reliable = null }
    else if (m.inter >= intra * RELIABLE_MARGIN) { m.threshold = Math.max(MIN_THRESHOLD, (intra + m.inter) / 2); m.reliable = true }
    else { m.threshold = Math.max(MIN_THRESHOLD, intra * 1.1); m.reliable = false }
  }
  return models
}

// ── Strojenie na zdaniach testowych ──────────────────────────────────────────
// Słowo w zdaniu brzmi inaczej niż powiedziane osobno (krócej, zlewa się z sąsiadami), więc progi
// z samych pojedynczych nagrań są za ciasne. Test trafności daje to, czego brakuje:
//   – próby DODATNIE: zdania, w których słowo na pewno padło,
//   – próby UJEMNE: zdania z innymi słowami, w których tego słowa nie ma.
// Dla każdego słowa: (1) fragment zdania, który pasuje lepiej niż cokolwiek z prób ujemnych,
// dopisujemy jako dodatkowy wzorzec "słowo w zdaniu"; (2) próg stawiamy między próbami dodatnimi
// a najlepszą ujemną. Trafienia liczymy uczciwie: zdanie nie jest oceniane wzorcem wyciętym z niego samego.
//
// models: { word: { takes: [Float32Array], intra, ... } };  trials: [{ word, feat }]
// Zwraca models z polami: threshold, reliable, extra (liczba dopisanych wzorców), test { trials, hits, falseAlarms, margin }.
export const MAX_EXTRA_TAKES = 2
export function tuneFromTest(models, trials) {
  const nested = (a, b) => a === b || a.includes(b) || b.includes(a)
  const scoreIn = (takes, feat) => {
    let best = { score: Infinity, startSlot: -1, endSlot: -1 }
    for (const t of takes) { const r = bestMatch(t, feat); if (r.score < best.score) best = r }
    return best
  }
  for (const word of Object.keys(models)) {
    const m = models[word]
    const fullBase = m.takes.slice(0, m.takes.length - (m.extra || 0))   // ponowny test nie dokłada wzorców w nieskończoność
    const base = matchTakes({ takes: fullBase, frac: m.frac, extra: 0 })   // w trybie „rdzeń” dopasowujemy bez końcówki
    const pos = trials.filter(t => t.word === word)
    const neg = trials.filter(t => !nested(t.word, word))
    if (!pos.length) { m.takes = fullBase; m.extra = 0; continue }
    const negMin = (takes) => { let mn = Infinity; for (const t of neg) { const s = scoreIn(takes, t.feat).score; if (s < mn) mn = s } return mn }
    const n0 = neg.length ? negMin(base) : Infinity
    // (1) fragmenty zdań jako dodatkowe wzorce
    const extras = []
    for (const t of pos) {
      const r = scoreIn(base, t.feat)
      t._frag = null
      if (r.startSlot >= 0 && r.score < n0 * 0.97) t._frag = t.feat.slice(r.startSlot * N_FEAT, (r.endSlot + 1) * N_FEAT)
    }
    const withFrag = pos.filter(t => t._frag).slice(0, MAX_EXTRA_TAKES)
    for (const t of withFrag) extras.push(t._frag)
    const all = [...base, ...extras]
    // (2) próg: trafienia liczone bez wzorca wyciętego z ocenianego zdania
    const nMin = neg.length ? negMin(all) : Infinity
    const pScores = pos.map(t => scoreIn(all.filter(x => x !== t._frag), t.feat).score)
    const okP = pScores.filter(s => s < nMin * 0.97)
    let threshold
    if (!okP.length) threshold = Math.max(MIN_THRESHOLD, Math.min((m.intra ?? MIN_THRESHOLD) * 1.1, nMin * 0.9))
    else if (Number.isFinite(nMin)) threshold = Math.min((Math.max(...okP) + nMin) / 2, nMin * 0.95)
    else threshold = Math.max(...okP) * 1.25
    const hits = pScores.filter(s => s < threshold).length
    m.takes = [...fullBase, ...extras]
    m.extra = extras.length
    m.threshold = threshold
    m.inter = Number.isFinite(nMin) ? nMin : null
    m.reliable = hits > 0
    m.test = { trials: pos.length, hits, falseAlarms: 0, margin: Number.isFinite(nMin) && okP.length ? nMin / Math.max(...okP) : null }
    for (const t of pos) delete t._frag
  }
  return models
}

// ── Szukanie słów w wypowiedzi ───────────────────────────────────────────────
// seq: cechy wypowiedzi; models: { word: { takes, threshold } } (tylko słowa monitorowane).
// Zwraca listę [{ word, startSlot, endSlot, score, ratio }] bez nakładających się trafień.
// ratio = score / threshold (< 1 = trafienie; im mniej, tym pewniej).
export function spotWords(seq, models) {
  const cands = []
  for (const word of Object.keys(models)) {
    const m = models[word]
    if (!m.takes?.length || !m.threshold) continue
    const m2 = seq.length / N_FEAT
    const best = new Float32Array(m2).fill(Infinity)
    const st = new Int32Array(m2).fill(-1)
    for (const tpl of matchTakes(m)) {
      const r = dtwScan(tpl, seq)
      for (let j = 0; j < m2; j++) if (r.score[j] < best[j]) { best[j] = r.score[j]; st[j] = r.start[j] }
    }
    // lokalne minima poniżej progu
    for (let j = 0; j < m2; j++) {
      if (!(best[j] < m.threshold)) continue
      let isMin = true
      for (let k = Math.max(0, j - 6); k <= Math.min(m2 - 1, j + 6); k++) if (best[k] < best[j]) { isMin = false; break }
      if (isMin) cands.push({ word, startSlot: st[j], endSlot: j, score: best[j], ratio: best[j] / m.threshold })
    }
  }
  // przy nakładaniu: dłuższe słowo zawierające krótsze wygrywa; poza tym wygrywa pewniejsze trafienie
  cands.sort((a, b) => a.ratio - b.ratio)
  const overlap = (a, b) => Math.min(a.endSlot, b.endSlot) - Math.max(a.startSlot, b.startSlot) > 0.3 * Math.min(a.endSlot - a.startSlot, b.endSlot - b.startSlot)
  const out = []
  for (const c of cands) {
    const clash = out.findIndex(o => overlap(o, c))
    if (clash < 0) { out.push(c); continue }
    const o = out[clash]
    if (c.word !== o.word && c.word.includes(o.word)) out[clash] = c
  }
  return out.sort((a, b) => a.startSlot - b.startSlot)
}

// ── Jakie głoski powinny paść w słowie (z uwzględnieniem ubezdźwięcznień) ────
// "łóżko" wymawiamy "łuszko", "pokaż" — "pokasz": tam "ż" brzmi jak "sz" i miernik słyszy je pewnie.
const VOICELESS = 'ptkfsśhcć'
export function phoneticize(word) {
  let w = (word || '').toLowerCase().trim()
  // "ż" i "rz" na końcu wyrazu lub przed głoską bezdźwięczną brzmią jak "sz"; "dż" na końcu jak "cz"
  w = w.replace(/dż$/u, 'cz').replace(/(rz|ż)$/u, 'sz').replace(/(rz|ż)(?=[ptkfsśhcć])/gu, 'sz')
  // samo "z" (nie część "sz", "cz", "rz", "dz") w tych samych miejscach brzmi jak "s"; "dz" na końcu jak "c"
  w = w.replace(/dz$/u, 'c')
  w = w.replace(/(.?)z(?=[ptkfh]|$)/gu, (m, prev) => ('scrd'.includes(prev) && prev !== '' ? m : `${prev}s`))
  return w
}
export function expectedFor(word) { return parseSibilants(phoneticize(word)) }

// Ocena głoski w znalezionym słowie.
// segments: odcinki szumu z całej wypowiedzi (analyseFrames), czasy w ms od jej początku.
// Zwraca { verdict: 'pass' | 'fail' | 'unclear', dL, dH }
export function judgeWord(segments, word, startMs, endMs, threshold, toleranceId = 'normal', endMarginMs = 50) {
  const inside = segments.filter(s => { const mid = s.startMs + s.durationMs / 2; return mid >= startMs - 50 && mid <= endMs + endMarginMs })
  const exp = expectedFor(word)
  if (exp.L > 0) {
    const r = judgeUtterance(inside, exp, threshold, toleranceId)
    let verdict = r.verdict === 'silent' ? 'unclear' : r.verdict
    // Brakującą głoskę szumiącą mógł "zjeść" odcinek ze strefy niepewnej (pomiar tuż przy progu).
    // Jeśli takich odcinków jest dość, a syczących nie ma za dużo — nie oceniamy, zamiast karać.
    if (verdict === 'fail') {
      const undecided = inside.length - r.dL - r.dH
      if (undecided >= exp.L - r.dL && r.dH <= exp.H + exp.Hv) verdict = 'unclear'
    }
    return { verdict, dL: r.dL, dH: r.dH }
  }
  // słowo tylko z głoską dźwięczną (ż, rz, dż): miernik słyszy ją słabo, więc oceniamy ostrożnie
  let dL = 0, dH = 0
  for (const s of inside) { const c = classifyValue(s.cog, threshold); if (c === 'sz') dL++; else if (c === 's') dH++ }
  if (exp.Lv > 0) {
    if (dL >= 1) return { verdict: 'pass', dL, dH }
    if (dH > exp.H + exp.Hv) return { verdict: 'fail', dL, dH }
  }
  return { verdict: 'unclear', dL, dH }
}

// Szukanie + ocena w jednym kroku. Trafienie bez żadnego szumu głoski w środku odrzucamy:
// każde słowo z listy ma głoskę, którą słychać jako szum, więc "woła" nie przejdzie jako "szkoła",
// a "pokoju" jako "pokaż". (Nie dotyczy słów tylko z dźwięcznym ż/rz — tam szumu może nie być słychać.)
// Zwraca [{ word, startMs, endMs, ratio, verdict, dL, dH }]
export function spotAndJudge(feat, segments, models, threshold, toleranceId = 'normal') {
  const out = []
  for (const hit of spotWords(feat, models)) {
    const startMs = hit.startSlot * SLOT_MS, endMs = (hit.endSlot + 1) * SLOT_MS
    // w trybie „rdzeń” oceniamy tylko głoski rdzenia: końcówka bywa inna („koszulce” ma „c”, którego w „koszulka” nie ma)
    const m = models[hit.word]
    const stem = (m.frac ?? 1) < 1 && m.stemText ? m.stemText : null
    const exp = expectedFor(stem || hit.word)
    // szum musi leżeć W ŚRODKU trafienia (co najmniej 20 ms), nie tuż obok — obok to już sąsiednie słowo
    const hasHiss = segments.some(s => Math.min(endMs, s.startMs + s.durationMs) - Math.max(startMs, s.startMs) >= 20)
    if (!hasHiss && exp.L + exp.H > 0) continue
    out.push({ word: hit.word, startMs, endMs, ratio: hit.ratio, ...judgeWord(segments, stem || hit.word, startMs, endMs, threshold, toleranceId, stem ? 0 : 50) })
  }
  return out
}

// Proporcja głosek szumiących wśród wszystkich ocenionych odcinków szumu (0–1) albo null
export function hissCounts(segments, threshold) {
  let sz = 0, s = 0
  for (const seg of segments) { const c = classifyValue(seg.cog, threshold); if (c === 'sz') sz++; else if (c === 's') s++ }
  return { sz, s }
}
export const shareOf = (sz, s) => (sz + s > 0 ? sz / (sz + s) : null)
