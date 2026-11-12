// MAPA UST — osobisty wzorzec pozycji ust, policzków i języka jednej osoby.
//
// Idea: zamiast stałych progów ("szerokość ust < 0,55") zapisujemy, jak KAŻDA pozycja wygląda
// u tej osoby (średnia i rozrzut ~40 miar twarzy), a w grze pytamy: "do której zapisanej pozycji
// jest teraz najbliżej i jak pewnie?". Miary, które u tej osoby dobrze rozróżniają pozycje,
// dostają większą wagę automatycznie.
//
// Pozycje wywołujemy głoskami, bo każdy wie, jak je powiedzieć:
//   mmm = usta zamknięte, aaa = otwarte, iii = szeroko, uuu = dzióbek, szszsz = dzióbek do "sz",
//   oraz język wypychający: lewy policzek, prawy policzek, pod górną wargą, pod dolną wargą.
//
// Kamera nie widzi języka — widzi tylko, jak wypycha od środka. Czy to wystarcza, mówi TEST
// TRAFNOŚCI po kalibracji (accuracy). Gry włączają sterowanie z kamery dopiero powyżej progu.

const KEY = 'stc_face_map'
export const MIN_ACCURACY = 0.8      // poniżej tej trafności gry nie używają kamery do sterowania
export const MAX_YAW = 0.22          // większy obrót głowy = klatki nie oceniamy (mylą się z policzkiem)
export const MAX_DIST = 4.0          // dalej niż tyle od każdego wzorca = "nie wiem"

export const POSES = [
  { id: 'closed',     say: 'mmm',    label: 'Usta zamknięte',           hint: 'Powiedz długie „mmm”. Usta razem, rozluźnione.' },
  { id: 'open',       say: 'aaa',    label: 'Usta otwarte',             hint: 'Powiedz długie „aaa”. Buzia szeroko otwarta.' },
  { id: 'wide',       say: 'iii',    label: 'Usta szeroko',             hint: 'Powiedz długie „iii”. Uśmiech, kąciki na boki.' },
  { id: 'pucker',     say: 'uuu',    label: 'Dzióbek',                  hint: 'Powiedz długie „uuu”. Usta w ciasny dzióbek.' },
  { id: 'sz',         say: 'szszsz', label: 'Dzióbek do „sz”',          hint: 'Powiedz długie „szszsz”. Dzióbek, zęby blisko siebie.' },
  { id: 'cheekL',     say: '',       label: 'Język w lewy policzek',    hint: 'Usta zamknięte. Wypchnij językiem LEWY policzek i trzymaj.' },
  { id: 'cheekR',     say: '',       label: 'Język w prawy policzek',   hint: 'Usta zamknięte. Wypchnij językiem PRAWY policzek i trzymaj.' },
  { id: 'tongueUp',   say: '',       label: 'Język pod górną wargą',    hint: 'Usta zamknięte. Wsuń język między górne zęby a górną wargę.' },
  { id: 'tongueDown', say: '',       label: 'Język pod dolną wargą',    hint: 'Usta zamknięte. Wsuń język między dolne zęby a dolną wargę.' },
]
// Grupy pozycji używane przez gry
export const STEER_POSES  = ['closed', 'cheekL', 'cheekR']
export const CIRCLE_POSES = ['closed', 'cheekL', 'tongueUp', 'cheekR', 'tongueDown']
// Kąt na ekranie (stopnie, zgodnie z ruchem wskazówek zegara od prawej strony), widok jak w lustrze:
// lewy policzek gracza = lewa strona ekranu.
export const POSE_ANGLE = { cheekR: 0, tongueDown: 90, cheekL: 180, tongueUp: 270 }

const BLEND_USED = [
  'mouthPucker', 'mouthFunnel', 'jawOpen', 'mouthClose', 'mouthSmileLeft', 'mouthSmileRight',
  'mouthLeft', 'mouthRight', 'cheekPuff', 'mouthPressLeft', 'mouthPressRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'jawLeft', 'jawRight',
]
// Punkty siatki twarzy: [nazwa, indeks] — policzki i okolice warg, gdzie widać wypychanie języka
const BULGE_POINTS = [
  ['ck1L', 205], ['ck1R', 425], ['ck2L', 214], ['ck2R', 434], ['ck3L', 192], ['ck3R', 416],
  ['ck4L', 207], ['ck4R', 427], ['upL', 37], ['upR', 267], ['upM', 164], ['loM', 18], ['loL', 84], ['loR', 314], ['chin', 200],
]

// ── Miary z jednej klatki ────────────────────────────────────────────────────
// points: 478 punktów z MediaPipe (x, y w ułamku obrazu; z w skali szerokości), size: { width, height },
// blend: { nazwa: wartość 0–1 } albo null. Zwraca { f: { miara: wartość }, yaw } albo null.
// Wszystko liczone w układzie twarzy (oś X wzdłuż linii oczu, jednostka = odległość między oczami),
// więc wynik nie zależy od odległości od kamery ani od przechylenia głowy na bok.
export function extractFeatures(points, size, blend = null) {
  const P = (i) => { const p = points[i]; return p ? [p.x * size.width, p.y * size.height, (p.z || 0) * size.width] : null }
  const eR = P(33), eL = P(263), nose = P(1)
  if (!eR || !eL || !nose) return null
  const eye = Math.hypot(eL[0] - eR[0], eL[1] - eR[1])
  if (!(eye > 1)) return null
  const ux = (eL[0] - eR[0]) / eye, uy = (eL[1] - eR[1]) / eye
  // współrzędne względem nosa, w układzie twarzy
  const rel = (i) => {
    const p = P(i); if (!p) return [0, 0, 0]
    const dx = p[0] - nose[0], dy = p[1] - nose[1]
    return [(dx * ux + dy * uy) / eye, (-dx * uy + dy * ux) / eye, (p[2] - nose[2]) / eye]
  }
  const dist = (a, b) => { const A = rel(a), B = rel(b); return Math.hypot(A[0] - B[0], A[1] - B[1]) }
  const f = {}
  f.mouthW = dist(61, 291)
  f.mouthOpen = dist(13, 14)
  f.mouthH = dist(0, 17)
  f.lipZ = (rel(0)[2] + rel(17)[2] + rel(13)[2] + rel(14)[2]) / 4
  f.mouthY = (rel(13)[1] + rel(14)[1]) / 2
  f.mouthX = (rel(61)[0] + rel(291)[0]) / 2
  f.cornerLy = rel(61)[1]; f.cornerRy = rel(291)[1]
  for (const [name, idx] of BULGE_POINTS) {
    const r = rel(idx)
    f[name + 'x'] = r[0]; f[name + 'z'] = r[2]
    if (name.startsWith('up') || name.startsWith('lo') || name === 'chin') f[name + 'y'] = r[1]
  }
  if (blend) for (const b of BLEND_USED) if (typeof blend[b] === 'number') f['b_' + b] = blend[b]
  // obrót głowy w lewo/prawo: nos bliżej jednej krawędzi twarzy niż drugiej
  const sR = rel(234), sL = rel(454)
  const a = Math.abs(sR[0]), b = Math.abs(sL[0])
  const yaw = a + b > 0 ? (a - b) / (a + b) : 0
  return { f, yaw }
}

// ── Budowa mapy z próbek ─────────────────────────────────────────────────────
// samples: { poseId: [ {miara: wartość}, ... ] }
export function buildMap(samples) {
  const poseIds = Object.keys(samples).filter(p => samples[p].length >= 8)
  if (poseIds.length < 2) return null
  const names = Object.keys(samples[poseIds[0]][0]).filter(n => poseIds.every(p => typeof samples[p][0][n] === 'number'))
  const poses = {}
  for (const p of poseIds) {
    const mean = {}, sd = {}
    for (const n of names) {
      const v = samples[p].map(s => s[n])
      const m = v.reduce((a, b) => a + b, 0) / v.length
      mean[n] = m
      sd[n] = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length)
    }
    poses[p] = { mean, sd, n: samples[p].length }
  }
  // Skala każdej miary = typowy rozrzut wewnątrz pozycji (z dolnym ograniczeniem), waga = na ile miara
  // rozróżnia pozycje u tej osoby (rozrzut MIĘDZY pozycjami do rozrzutu WEWNĄTRZ).
  const scale = {}, weight = {}
  let wSum = 0
  for (const n of names) {
    const means = poseIds.map(p => poses[p].mean[n])
    const gm = means.reduce((a, b) => a + b, 0) / means.length
    const between = Math.sqrt(means.reduce((a, b) => a + (b - gm) * (b - gm), 0) / means.length)
    const within = Math.sqrt(poseIds.reduce((a, p) => a + poses[p].sd[n] ** 2, 0) / poseIds.length)
    const range = Math.max(...means) - Math.min(...means)
    scale[n] = Math.max(within, range * 0.06, 1e-4)
    const fisher = Math.min(40, (between / scale[n]) ** 2)
    weight[n] = fisher < 0.5 ? 0 : fisher        // miary, które nic nie rozróżniają, pomijamy
    wSum += weight[n]
  }
  if (wSum <= 0) return null
  for (const n of names) weight[n] /= wSum
  return { version: 1, date: new Date().toISOString(), names, poses, scale, weight, accuracy: null, confusion: null }
}

// Odległość klatki od wzorca pozycji (≈1 = typowa klatka tej pozycji, >4 = to nie ta pozycja)
export function poseDistance(f, map, poseId) {
  const pose = map.poses[poseId]
  if (!pose) return Infinity
  let d2 = 0
  for (const n of map.names) {
    const w = map.weight[n]
    if (!w) continue
    const z = ((f[n] ?? pose.mean[n]) - pose.mean[n]) / map.scale[n]
    d2 += w * z * z
  }
  return Math.sqrt(d2)
}

// Rozpoznanie pozycji. among: lista pozycji branych pod uwagę (gra podaje tylko te, których używa).
// Zwraca { pose, conf (0–1), dist, dists } — pose = null, gdy klatka nie pasuje do niczego.
export function classify(f, map, among = null) {
  const ids = (among || Object.keys(map.poses)).filter(p => map.poses[p])
  const dists = {}
  let best = null, second = null
  for (const p of ids) {
    const d = poseDistance(f, map, p)
    dists[p] = d
    if (best == null || d < dists[best]) { second = best; best = p }
    else if (second == null || d < dists[second]) second = p
  }
  if (best == null) return { pose: null, conf: 0, dist: Infinity, dists }
  const dB = dists[best], dS = second != null ? dists[second] : Infinity
  const conf = dS === Infinity ? 1 : Math.max(0, Math.min(1, 1 - dB / (dS + 1e-6)))
  return { pose: dB <= MAX_DIST ? best : null, conf, dist: dB, dists }
}

// Kąt "gdzie jest język" na okręgu wokół ust (stopnie 0–360, patrz POSE_ANGLE) albo null,
// gdy usta są w spoczynku lub pozycja jest nieczytelna. Między czterema zapisanymi punktami
// kąt jest wygładzany wagami — język w drodze z policzka pod wargę daje kąt pośredni.
export const NEUTRAL_DIST = 2.0   // bliżej wzorca "usta zamknięte" niż tyle = język nie wypycha
export function tongueAngle(f, map) {
  const dists = {}
  for (const p of CIRCLE_POSES) if (map.poses[p]) dists[p] = poseDistance(f, map, p)
  const tonguePoses = Object.keys(POSE_ANGLE).filter(p => p in dists)
  if (tonguePoses.length < 2) return null
  const dMin = Math.min(...tonguePoses.map(p => dists[p]))
  // spoczynek: klatka mieści się w skupisku "usta zamknięte"; nieczytelne: daleko od wszystkiego
  if ('closed' in dists && dists.closed <= NEUTRAL_DIST && dists.closed <= dMin) return null
  if (dMin > MAX_DIST * 1.5) return null
  let sx = 0, sy = 0
  for (const p of tonguePoses) {
    const w = 1 / (dists[p] * dists[p] + 0.25)      // bliższy wzorzec ciągnie mocniej
    const a = (POSE_ANGLE[p] * Math.PI) / 180
    sx += w * Math.cos(a); sy += w * Math.sin(a)
  }
  // prawie równe przyciąganie z przeciwnych stron = brak wyraźnego kierunku
  if (Math.hypot(sx, sy) < 0.08 * tonguePoses.reduce((a, p) => a + 1 / (dists[p] * dists[p] + 0.25), 0)) return null
  return ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360
}

// ── Test trafności ───────────────────────────────────────────────────────────
// trials: [{ expected, got }] → { accuracy, perPose: { id: { ok, n } }, confusion: [{ expected, got, n }] }
export function scoreTrials(trials) {
  const perPose = {}, conf = {}
  let ok = 0
  for (const t of trials) {
    const pp = perPose[t.expected] || (perPose[t.expected] = { ok: 0, n: 0 })
    pp.n++
    if (t.got === t.expected) { pp.ok++; ok++ }
    else { const k = `${t.expected}>${t.got || 'brak'}`; conf[k] = (conf[k] || 0) + 1 }
  }
  const confusion = Object.entries(conf).map(([k, n]) => { const [expected, got] = k.split('>'); return { expected, got, n } }).sort((a, b) => b.n - a.n)
  return { accuracy: trials.length ? ok / trials.length : 0, perPose, confusion }
}

// Trafność dla podzbioru pozycji (np. tylko sterowanie autem) — z zapisanych wyników testu
export function accuracyFor(map, poseIds) {
  if (!map || !map.perPose) return null
  let ok = 0, n = 0
  for (const p of poseIds) { const r = map.perPose[p]; if (!r) return null; ok += r.ok; n += r.n }
  return n ? ok / n : null
}

export function getFaceMap() {
  try { const m = JSON.parse(localStorage.getItem(KEY) || 'null'); return m && m.poses && m.names ? m : null } catch (e) { return null }
}
export function saveFaceMap(map) { try { localStorage.setItem(KEY, JSON.stringify(map)); return true } catch (e) { return false } }
export function clearFaceMap() { try { localStorage.removeItem(KEY) } catch (e) {} }

// ── Dane sztuczne do trybu testowego (bez kamery) ────────────────────────────
// Udają miary dla danej pozycji z niewielkim szumem — służą wyłącznie do sprawdzania ekranów i gier.
const SIM_BASE = { mouthW: 0.8, mouthOpen: 0.02, lipZ: 0, ck1Lx: -0.6, ck1Rx: 0.6, ck1Lz: 0.1, ck1Rz: 0.1, upMz: 0, loMz: 0 }
const SIM_DELTA = {
  closed: {}, open: { mouthOpen: 0.5 }, wide: { mouthW: 0.25 }, pucker: { mouthW: -0.28, lipZ: -0.12 },
  sz: { mouthW: -0.2, lipZ: -0.08, mouthOpen: 0.1 }, cheekL: { ck1Lx: -0.12, ck1Lz: -0.1 }, cheekR: { ck1Rx: 0.12, ck1Rz: -0.1 },
  tongueUp: { upMz: -0.1 }, tongueDown: { loMz: -0.1 },
}
export function simFeatures(poseId, noise = 0.012, blendWith = null, t = 0) {
  const f = {}
  for (const n of Object.keys(SIM_BASE)) {
    const a = SIM_DELTA[poseId]?.[n] || 0
    const b = blendWith ? (SIM_DELTA[blendWith]?.[n] || 0) : a
    f[n] = SIM_BASE[n] + a * (1 - t) + b * t + (Math.random() - 0.5) * 2 * noise
  }
  return f
}
