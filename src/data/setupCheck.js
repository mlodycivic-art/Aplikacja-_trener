// KONTROLA STANOWISKA — czy ćwiczący siedzi i ma ustawiony telefon/tablet tak, jak trzeba.
//
// Zalecane stanowisko: krzesło przy biurku, urządzenie pionowo na statywie, kamera na wysokości
// twarzy, 40–50 cm od niej, światło z przodu. Dwa powody: (1) pozycja ciała wpływa na pracę żuchwy
// i języka, (2) Mapa ust jest robiona w konkretnych warunkach — w innych rozpoznaje gorzej.
//
// Co mierzymy i z czego:
//   odległość      — średnica tęczówki na obrazie (u ludzi prawie stała, ~11,7 mm, niezależnie od wieku)
//   twarz w kadrze — położenie i wielkość twarzy
//   głowa prosto   — przechylenie (linia oczu), obrót w bok (krawędzie twarzy), pochylenie (głębia czoło–broda)
//   wysokość       — pochylenie głowy względem kamery + kierunek spojrzenia (tęczówka w oku) + pion urządzenia
//   światło        — jasność twarzy na obrazie, światło zza pleców, cień na połowie twarzy
//   stabilność     — drganie obrazu twarzy i czujnik ruchu urządzenia (telefon w ręku vs na statywie)
//   pion           — czujnik położenia urządzenia (tylko telefon/tablet)
//
// Wartości w cm są PRZYBLIŻONE (nie znamy dokładnego kąta widzenia kamery). Dokładne jest porównanie
// "teraz" z "podczas kalibracji" — dlatego Mapa ust zapisuje warunki, w których powstała.

const KEY_MODE = 'stc_setup_mode'
const IRIS_MM = 11.7
const ASSUMED_HFOV_DEG = 62          // typowa przednia kamera; wpływa tylko na przybliżone centymetry

// strict = kalibracja; normal = gry; relaxed = poluzowane przez dorosłego; off = bez kontroli
export const TOLERANCES = {
  strict:  { label: 'Dokładna',   distMin: 32, distMax: 60, center: 0.16, roll: 8,  yaw: 0.14, pitch: 12, lightMin: 70, backlight: 45, side: 55, jitter: 0.030, tilt: 18, refDist: 0.20, refPitch: 9 },
  normal:  { label: 'Zwykła',     distMin: 28, distMax: 70, center: 0.22, roll: 12, yaw: 0.20, pitch: 16, lightMin: 55, backlight: 60, side: 70, jitter: 0.045, tilt: 25, refDist: 0.30, refPitch: 13 },
  relaxed: { label: 'Poluzowana', distMin: 22, distMax: 90, center: 0.30, roll: 18, yaw: 0.26, pitch: 22, lightMin: 40, backlight: 80, side: 90, jitter: 0.08,  tilt: 40, refDist: 0.5,  refPitch: 20 },
}
export function getSetupMode() { try { const m = localStorage.getItem(KEY_MODE); return m === 'off' || TOLERANCES[m] ? m : 'normal' } catch (e) { return 'normal' } }
export function setSetupMode(m) { try { localStorage.setItem(KEY_MODE, m) } catch (e) {} }

const deg = (r) => (r * 180) / Math.PI

// ── Pomiary z jednej klatki ──────────────────────────────────────────────────
// points: punkty twarzy (478, z tęczówkami), size: { width, height } obrazu.
export function measureFace(points, size) {
  const P = (i) => { const p = points[i]; return p ? [p.x * size.width, p.y * size.height, (p.z || 0) * size.width] : null }
  const eR = P(33), eL = P(263), nose = P(1), top = P(10), chin = P(152), sR = P(234), sL = P(454)
  if (!eR || !eL || !nose || !top || !chin || !sR || !sL) return null
  const eye = Math.hypot(eL[0] - eR[0], eL[1] - eR[1])
  const faceH = Math.hypot(chin[0] - top[0], chin[1] - top[1])
  if (!(eye > 1) || !(faceH > 1)) return null

  // odległość: tęczówka (punkty 469–472 prawe oko, 474–477 lewe); awaryjnie rozstaw oczu (~62 mm u dorosłego)
  const focal = size.width / (2 * Math.tan((ASSUMED_HFOV_DEG * Math.PI) / 360))
  const irisDia = (a, b) => { const A = P(a), B = P(b); return A && B ? Math.hypot(A[0] - B[0], A[1] - B[1]) : 0 }
  const iris = (irisDia(469, 471) + irisDia(474, 476)) / 2
  const distanceCm = iris > 2 ? (focal * IRIS_MM) / iris / 10 : (focal * 62) / eye / 10

  const cx = (sR[0] + sL[0]) / 2 / size.width, cy = (top[1] + chin[1]) / 2 / size.height
  const roll = deg(Math.atan2(eL[1] - eR[1], eL[0] - eR[0]))
  const a = Math.abs(sR[0] - nose[0]), b = Math.abs(sL[0] - nose[0])
  const yaw = a + b > 0 ? (a - b) / (a + b) : 0
  // pochylenie: broda dalej od kamery niż czoło = twarz skierowana w dół (albo kamera wyżej niż twarz)
  const pitch = deg(Math.atan2(chin[2] - top[2], faceH))

  // spojrzenie w pionie: środek tęczówki względem powiek (0 = górna powieka, 1 = dolna), średnia z obu oczu
  const gaze = (irisC, lidTop, lidBot) => { const c = P(irisC), t = P(lidTop), d = P(lidBot); if (!c || !t || !d) return null; const h = d[1] - t[1]; return h > 2 ? (c[1] - t[1]) / h : null }
  const g1 = gaze(468, 159, 145), g2 = gaze(473, 386, 374)
  const gazeV = g1 != null && g2 != null ? (g1 + g2) / 2 : null

  return {
    distanceCm, cx, cy, roll, yaw, pitch, gazeV, eyePx: eye,
    nx: nose[0] / eye, ny: nose[1] / eye,                     // do pomiaru drgań (w jednostkach rozstawu oczu)
    box: { x0: Math.min(sR[0], sL[0]) / size.width, x1: Math.max(sR[0], sL[0]) / size.width, y0: top[1] / size.height, y1: chin[1] / size.height },
  }
}

// Jasność z klatki wideo: całość, twarz, lewa i prawa połowa twarzy (0–255).
// ctx: kontekst małego płótna (np. 64×48), na które narysowano bieżącą klatkę.
export function measureLight(ctx, w, h, box) {
  let img
  try { img = ctx.getImageData(0, 0, w, h).data } catch (e) { return null }
  let all = 0, nAll = 0, face = 0, nFace = 0, left = 0, nL = 0, right = 0, nR = 0
  const x0 = Math.floor(box.x0 * w), x1 = Math.ceil(box.x1 * w), y0 = Math.floor(box.y0 * h), y1 = Math.ceil(box.y1 * h)
  const mid = (x0 + x1) / 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const l = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]
    all += l; nAll++
    if (x >= x0 && x < x1 && y >= y0 && y < y1) { face += l; nFace++; if (x < mid) { left += l; nL++ } else { right += l; nR++ } }
  }
  if (!nFace) return null
  return { frame: all / nAll, face: face / nFace, left: nL ? left / nL : 0, right: nR ? right / nR : 0 }
}

// Drganie: rozrzut położenia nosa w ostatniej sekundzie (w jednostkach rozstawu oczu)
export function jitterOf(history) {
  if (history.length < 8) return 0
  const mx = history.reduce((s, p) => s + p.nx, 0) / history.length, my = history.reduce((s, p) => s + p.ny, 0) / history.length
  return Math.sqrt(history.reduce((s, p) => s + (p.nx - mx) ** 2 + (p.ny - my) ** 2, 0) / history.length)
}

// Przybliżona różnica wysokości kamera–twarz w cm (dodatnia = kamera NIŻEJ niż twarz).
// Twarz skierowana w dół względem kamery + urządzenie w pionie ⇒ kamera jest pod linią wzroku.
export function heightOffsetCm(m, tiltFromVertical = 0) {
  return m.distanceCm * Math.tan(((m.pitch + tiltFromVertical) * Math.PI) / 180)
}

// ── Ocena ────────────────────────────────────────────────────────────────────
// m: measureFace(); light: measureLight() | null; device: { beta, gamma } | null (czujnik położenia);
// jitter: jitterOf(); ref: warunki zapisane przy kalibracji | null.
// Zwraca listę kontroli: [{ id, label, ok, hint, value }] — hint mówi, co poprawić.
export function evaluateSetup(m, light, device, jitter, mode = 'normal', ref = null) {
  const t = TOLERANCES[mode] || TOLERANCES.normal
  const out = []
  if (!m) return [{ id: 'face', label: 'Twarz w kadrze', ok: false, hint: 'Nie widzę twarzy. Usiądź na wprost kamery.' }]

  const off = Math.max(Math.abs(m.cx - 0.5), Math.abs(m.cy - 0.5))
  out.push({ id: 'face', label: 'Twarz w kadrze', ok: off <= t.center,
    hint: off <= t.center ? '' : m.cy < 0.5 - t.center ? 'Twarz jest za wysoko w kadrze — podnieś telefon albo usiądź niżej.'
      : m.cy > 0.5 + t.center ? 'Twarz jest za nisko w kadrze — opuść telefon albo usiądź wyżej.' : 'Usiądź na środku, na wprost telefonu.' })

  const d = Math.round(m.distanceCm)
  let distOk = m.distanceCm >= t.distMin && m.distanceCm <= t.distMax
  let distHint = m.distanceCm < t.distMin ? 'Za blisko — odsuń się od telefonu.' : m.distanceCm > t.distMax ? 'Za daleko — przysuń się do telefonu.' : ''
  if (distOk && ref && ref.distanceCm) {
    const ratio = m.distanceCm / ref.distanceCm
    if (ratio > 1 + t.refDist) { distOk = false; distHint = 'Siedzisz dalej niż podczas kalibracji — przysuń się.' }
    else if (ratio < 1 - t.refDist) { distOk = false; distHint = 'Siedzisz bliżej niż podczas kalibracji — odsuń się.' }
  }
  out.push({ id: 'distance', label: 'Odległość', ok: distOk, hint: distHint, value: `ok. ${d} cm` })

  const rollOk = Math.abs(m.roll) <= t.roll, yawOk = Math.abs(m.yaw) <= t.yaw
  out.push({ id: 'head', label: 'Głowa prosto', ok: rollOk && yawOk,
    hint: !rollOk ? 'Głowa jest przechylona na bok — usiądź prosto.' : !yawOk ? 'Patrz na wprost, nie w bok.' : '' })

  // wysokość kamery: pochylenie twarzy względem kamery (+ porównanie z kalibracją)
  let pitchOk = Math.abs(m.pitch) <= t.pitch
  let pitchHint = m.pitch > t.pitch ? 'Telefon jest za nisko (patrzysz w dół) — podnieś go na wysokość twarzy.'
    : m.pitch < -t.pitch ? 'Telefon jest za wysoko (patrzysz w górę) — opuść go na wysokość twarzy.' : ''
  if (pitchOk && ref && typeof ref.pitch === 'number' && Math.abs(m.pitch - ref.pitch) > t.refPitch) {
    pitchOk = false
    pitchHint = m.pitch > ref.pitch ? 'Telefon stoi niżej niż podczas kalibracji — podnieś go.' : 'Telefon stoi wyżej niż podczas kalibracji — opuść go.'
  }
  const h = Math.round(heightOffsetCm(m))
  out.push({ id: 'height', label: 'Wysokość telefonu', ok: pitchOk, hint: pitchHint,
    value: Math.abs(h) < 3 ? 'na wysokości twarzy' : h > 0 ? `ok. ${h} cm za nisko` : `ok. ${-h} cm za wysoko` })

  if (light) {
    const dark = light.face < t.lightMin
    const back = light.frame - light.face > t.backlight
    const side = Math.abs(light.left - light.right) > t.side
    out.push({ id: 'light', label: 'Światło', ok: !dark && !back && !side,
      hint: back ? 'Światło jest za Tobą — usiądź twarzą do okna lub lampy.' : dark ? 'Za ciemno — zapal lampę przed sobą.'
        : side ? 'Pół twarzy jest w cieniu — obróć się do światła.' : '' })
  }

  let stable = jitter <= t.jitter
  let stableHint = stable ? '' : 'Obraz drga — postaw telefon na statywie albo oprzyj o coś stabilnego.'
  if (device && typeof device.beta === 'number') {
    // pionowo ustawiony telefon: beta ≈ 90° (portret), gamma ≈ 0°
    const tilt = Math.abs(90 - Math.abs(device.beta))
    if (tilt > t.tilt || Math.abs(device.gamma || 0) > t.tilt + 10) {
      stable = false
      stableHint = Math.abs(device.beta) < 40 ? 'Telefon leży — postaw go pionowo na statywie.' : 'Telefon jest mocno pochylony — ustaw go pionowo.'
    }
  }
  out.push({ id: 'stable', label: 'Telefon stabilnie i pionowo', ok: stable, hint: stableHint })
  return out
}

// Warunki do zapisania razem z kalibracją (średnia z kilku pomiarów)
export function summarizeConditions(samples, lightSamples) {
  if (!samples.length) return null
  const avg = (k) => samples.reduce((s, m) => s + (m[k] || 0), 0) / samples.length
  const face = lightSamples.length ? lightSamples.reduce((s, l) => s + l.face, 0) / lightSamples.length : null
  return { distanceCm: +avg('distanceCm').toFixed(1), pitch: +avg('pitch').toFixed(1), roll: +avg('roll').toFixed(1),
           gazeV: +avg('gazeV').toFixed(3), light: face != null ? Math.round(face) : null }
}
