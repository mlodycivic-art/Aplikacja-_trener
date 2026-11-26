// „Profil głoski”: trzy liczby opisujące długą głoskę (s albo sz) i ich historia w czasie.
//
//   hz      POŁOŻENIE   — środek (mediana) wysokości szumu
//   spread  STABILNOŚĆ  — szerokość pasa, w którym mieści się 80% pomiaru (od 10. do 90. centyla); mniej = równiej
//   hit     TRAFNOŚĆ    — jaki procent pomiaru leży w pasie celu
//
// Pas celu dla głoski bierzemy po kolei z: celu ustawionego przez dorosłego (z osoby wzorcowej albo ręcznie),
// wzorca strojonego na słuch, progu z kalibracji, a na końcu z wartości domyślnych.

import { getThreshold, referenceSummary } from './patternStore'

const KEY = 'stc_sound_profile'
export const HZ_MIN = 2000, HZ_MAX = 10500
export const SOUNDS = [
  { id: 'sz', say: 'szszszsz', label: '„sz”', hint: 'Dzióbek, język uniesiony do góry.' },
  { id: 's', say: 'ssssss', label: '„s”', hint: 'Zęby razem, uśmiech, język za dolnymi zębami.' },
]

export function getProfile() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); if (p && Array.isArray(p.measures)) return { people: [], targets: {}, ...p } } catch (e) {}
  return { people: [], measures: [], targets: {} }
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch (e) {} }

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]

// cogs: wysokości szumu z kolejnych ramek (Hz); zone: { lo, hi }
export function computeStats(cogs, zone) {
  if (!cogs || cogs.length < 20) return null
  const s = [...cogs].sort((a, b) => a - b)
  const hit = zone ? cogs.filter(v => v >= zone.lo && v <= zone.hi).length / cogs.length : null
  return { hz: Math.round(pct(s, 0.5)), lo: Math.round(pct(s, 0.1)), hi: Math.round(pct(s, 0.9)), spread: Math.round(pct(s, 0.9) - pct(s, 0.1)), hit: hit == null ? null : Math.round(hit * 100), n: cogs.length }
}

// Pas celu dla głoski: { lo, hi, src, label }
export function zoneFor(sound, profile = getProfile()) {
  const t = profile.targets?.[sound]
  if (t && t.hi > t.lo) return { ...t, src: 'target', label: t.label || 'cel ustawiony ręcznie' }
  const ref = referenceSummary()
  if (ref.quality === 'good' && ref[sound]) {
    const m = 350
    return { lo: Math.max(HZ_MIN, ref[sound].min - m), hi: Math.min(HZ_MAX + 500, ref[sound].max + m), src: 'reference', label: 'wzorzec strojony na słuch' }
  }
  const th = getThreshold()
  if (th && th.quality === 'good') {
    const dead = th.gap * 0.125
    return sound === 'sz' ? { lo: HZ_MIN, hi: Math.round(th.hz - dead), src: 'threshold', label: 'próg z kalibracji' }
      : { lo: Math.round(th.hz + dead), hi: HZ_MAX + 500, src: 'threshold', label: 'próg z kalibracji' }
  }
  return sound === 'sz' ? { lo: HZ_MIN, hi: 5000, src: 'default', label: 'wartości domyślne (zrób kalibrację)' } : { lo: 6500, hi: HZ_MAX + 500, src: 'default', label: 'wartości domyślne (zrób kalibrację)' }
}

export function addMeasure(m) {
  const p = getProfile()
  p.measures = [...p.measures, { ...m, date: new Date().toISOString() }].slice(-400)
  saveProfile(p)
  return p
}
export const measuresOf = (profile, personId, sound) => profile.measures.filter(m => m.personId === personId && m.sound === sound)
