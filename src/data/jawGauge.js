// „Miarka” otwarcia buzi: odległość od podstawy nosa do dołu brody.
//
// Liczymy ją w jednostkach rozstawu oczu (więc nie zależy od odległości od kamery), a z kalibracji
// (buzia zamknięta / buzia szeroko otwarta) robimy własną skalę ćwiczącego: 0% – 100%.
// Milimetry są PRZYBLIŻONE: za linijkę służy tęczówka oka (u ludzi ok. 11,7 mm średnicy).
//
// Pochylenie głowy w przód/w tył skraca lub wydłuża tę odległość na obrazie, mimo że buzia się nie
// zmienia — dlatego mierzymy też pochylenie i przy dużym (względem kalibracji) wyniku nie pokazujemy.

const KEY = 'stc_jaw_range'
const NOSE_BASE = 2, CHIN = 152, EYE_R = 33, EYE_L = 263, FOREHEAD = 10
const IRIS_MM = 11.7
export const MAX_TILT_DEG = 14

// points: 478 punktów MediaPipe (x, y w ułamku obrazu, z w skali szerokości), size: { width, height }
export function measureJaw(points, size) {
  if (!points) return null
  const P = (i) => { const p = points[i]; return p ? [p.x * size.width, p.y * size.height, (p.z || 0) * size.width] : null }
  const nose = P(NOSE_BASE), chin = P(CHIN), eR = P(EYE_R), eL = P(EYE_L), top = P(FOREHEAD)
  if (!nose || !chin || !eR || !eL || !top) return null
  const eye = Math.hypot(eL[0] - eR[0], eL[1] - eR[1])
  if (!(eye > 1)) return null
  const px = Math.hypot(chin[0] - nose[0], chin[1] - nose[1])
  // pochylenie: czoło i podstawa nosa leżą na „sztywnej” części twarzy (nie ruszają się z żuchwą)
  const dy = Math.hypot(nose[0] - top[0], nose[1] - top[1])
  const tilt = dy > 1 ? (Math.atan2(nose[2] - top[2], dy) * 180) / Math.PI : 0
  // tęczówki: 469/471 (prawa) i 474/476 (lewa) to punkty na jej brzegach w poziomie
  let mmPerPx = null
  const iris = (a, b) => { const A = P(a), B = P(b); return A && B ? Math.hypot(A[0] - B[0], A[1] - B[1]) : 0 }
  const d = [iris(469, 471), iris(474, 476)].filter(v => v > 2)
  if (d.length) mmPerPx = IRIS_MM / (d.reduce((a, b) => a + b, 0) / d.length)
  return { ratio: px / eye, px, tilt, mm: mmPerPx ? px * mmPerPx : null, nose, chin }
}

// Zakres może być chwilowo niepełny (zrobiony tylko jeden z dwóch pomiarów) — wtedy brakująca wartość to null
export function getJawRange() {
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r && (typeof r.closed === 'number' || typeof r.open === 'number') ? r : null } catch (e) { return null }
}
export function saveJawRangePartial(r) { try { localStorage.setItem(KEY, JSON.stringify({ ...r, date: new Date().toISOString() })) } catch (e) {} }
export function clearJawRange() { try { localStorage.removeItem(KEY) } catch (e) {} }
// zakres jest użyteczny, gdy otwarta buzia wyraźnie różni się od zamkniętej
export const jawRangeOk = (r) => !!r && typeof r.closed === 'number' && typeof r.open === 'number' && r.open - r.closed >= 0.12

// 0–100% własnej skali (może lekko przekroczyć 100, gdy otworzy szerzej niż przy kalibracji)
export function jawPercent(m, range) {
  if (!m || !jawRangeOk(range)) return null
  return Math.max(0, Math.min(120, ((m.ratio - range.closed) / (range.open - range.closed)) * 100))
}
export const jawTilted = (m, range) => !!m && Math.abs(m.tilt - (range?.tilt ?? m.tilt)) > MAX_TILT_DEG
