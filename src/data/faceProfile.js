// Osobisty profil ust — "jak wyglądają usta TEJ osoby w spoczynku i w dzióbku".
//
// Kreator kalibracji używa stałych progów dla grupy wiekowej. Twarze różnią się jednak
// szerokością ust i tym, jak mocny dzióbek ktoś potrafi zrobić, więc te same progi są dla jednych
// za łatwe, a dla innych nieosiągalne. Tu zapisujemy dwa pomiary konkretnej osoby:
//   neutral — usta zamknięte, rozluźnione,
//   pucker  — jej najlepszy dzióbek (zaakceptowany przez logopedę),
// a poziom dzióbka liczymy jako to, JAK DALEKO między tymi dwoma punktami są usta teraz.
//
// widthRatio = szerokość ust / odległość między oczami; aspect = otwór ust / szerokość ust
// (te same miary, które liczy checkPucker w detectors.js).

const KEY = 'stc_face_profile'
export const MIN_RANGE = 0.04   // dzióbek musi zwęzić usta co najmniej o tyle, żeby dało się go mierzyć

export function getFaceProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null')
    return p && p.neutral && p.pucker && isValidProfile(p) ? p : null
  } catch (e) { return null }
}

export function isValidProfile(p) {
  return !!p && p.neutral.widthRatio - p.pucker.widthRatio >= MIN_RANGE
}

export function saveFaceProfile(neutral, pucker) {
  const p = { neutral, pucker, date: new Date().toISOString() }
  if (!isValidProfile(p)) return null
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch (e) {}
  return p
}

export function clearFaceProfile() { try { localStorage.removeItem(KEY) } catch (e) {} }

// 0 = usta jak w spoczynku, 1 = jak w zapisanym dzióbku (może przekroczyć 1 przy mocniejszym)
export function puckerScore(widthRatio, profile) {
  if (widthRatio == null || !profile) return 0
  const range = profile.neutral.widthRatio - profile.pucker.widthRatio
  return Math.max(0, Math.min(1.3, (profile.neutral.widthRatio - widthRatio) / range))
}

// Poziom 0–3 jak w getPuckerLevel, ale względem własnego zakresu osoby:
// 1 = 45% drogi do własnego dzióbka, 2 = 65%, 3 = 85%.
// Szeroko otwarte usta (aspect dużo większy niż w dzióbku) nie są dzióbkiem.
export const PERSONAL_LEVELS = [0.45, 0.65, 0.85]
export function personalPuckerLevel(widthRatio, aspect, profile) {
  if (!profile || widthRatio == null) return 0
  const maxAspect = Math.max(0.55, (profile.pucker.aspect || 0) * 1.8)
  if (aspect != null && aspect > maxAspect) return 0
  const s = puckerScore(widthRatio, profile)
  if (s >= PERSONAL_LEVELS[2]) return 3
  if (s >= PERSONAL_LEVELS[1]) return 2
  if (s >= PERSONAL_LEVELS[0]) return 1
  return 0
}

// Zamknięte usta względem własnego spoczynku: otwór nie większy niż w spoczynku + margines
export function personalMouthClosed(aspect, profile) {
  if (!profile || aspect == null) return null
  return aspect <= (profile.neutral.aspect || 0) + 0.08
}

// Stabilny pomiar z serii próbek: mediana (odporna na pojedyncze skoki detektora)
export function medianSample(samples) {
  const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] }
  return { widthRatio: med(samples.map(s => s.widthRatio)), aspect: med(samples.map(s => s.aspect)) }
}
