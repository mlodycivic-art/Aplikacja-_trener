// Jakie głoski syczące i szumiące POWINNY paść w danym tekście — i czy padły.
//
// Trzy szeregi polskich głosek dentalizowanych:
//   L (szumiące, pomiar NISKO):   sz, cz, ż, rz, dż
//   H (syczące,  pomiar WYSOKO):  s, c, z, dz
//   M (ciszące,  pośrodku):       ś, ć, ź, dź oraz si, ci, zi, dzi — NIE oceniamy (leżą między L i H)
// Miernik słyszy pewnie tylko głoski bezdźwięczne (sz, cz, s, c). Dźwięczne (ż, z, dż, dz)
// często zagłusza głos, więc liczymy je osobno i traktujemy jako "mogą, ale nie muszą się pojawić".

import { classifyValue } from './patternStore'

const VOICELESS_BEFORE_RZ = ['p', 't', 'k', 'ch', 'h']   // przy, trzy, krzesło, chrzan → "rz" brzmi jak "sz"

export function parseSibilants(text) {
  const t = (text || '').toLowerCase()
  const out = { L: 0, H: 0, Lv: 0, Hv: 0, M: 0 }
  const isVowel = (c) => 'aąeęioóuy'.includes(c)
  for (let i = 0; i < t.length;) {
    const c3 = t.substr(i, 3), c2 = t.substr(i, 2), c1 = t[i]
    const next = (n) => t[i + n] || ''
    if (c3 === 'dzi') { out.M++; i += 3; continue }
    if (c2 === 'dź')  { out.M++; i += 2; continue }
    if (c2 === 'dż')  { out.Lv++; i += 2; continue }
    if (c2 === 'dz')  { out.Hv++; i += 2; continue }
    if (c2 === 'sz' || c2 === 'cz') { out.L++; i += 2; continue }
    if (c2 === 'rz') {
      const prev1 = t[i - 1] || '', prev2 = t.substr(Math.max(0, i - 2), 2)
      if (VOICELESS_BEFORE_RZ.includes(prev1) || prev2 === 'ch') out.L++; else out.Lv++
      i += 2; continue
    }
    if (c2 === 'ch') { i += 2; continue }
    // si / ci / zi: zmiękczenie (siano, ciasto, zima) — głoska cisząca; przed samogłoską 'i' jest tylko znakiem
    if (c2 === 'si' || c2 === 'ci' || c2 === 'zi') { out.M++; i += 2; continue }
    if (c1 === 'ś' || c1 === 'ć' || c1 === 'ź') { out.M++; i += 1; continue }
    if (c1 === 'ż') { out.Lv++; i += 1; continue }
    if (c1 === 's' || c1 === 'c') { out.H++; i += 1; continue }
    if (c1 === 'z') { out.Hv++; i += 1; continue }
    i += 1
  }
  return out
}

// Tolerancja: ile wymaganych głosek szumiących musi być wykrytych, ile "nadliczbowych" syczących
// wolno, i jak szeroka jest strefa niepewna wokół progu (mniejsza = więcej ocenia, ale ryzykowniej).
export const TOLERANCE = {
  easy:   { label: 'Łagodna',  ratio: 0.5,  extraH: 1, dead: 0.15 },
  normal: { label: 'Zwykła',   ratio: 0.75, extraH: 0, dead: 0.25 },
  strict: { label: 'Dokładna', ratio: 1.0,  extraH: 0, dead: 0.30 },
}

// segments: odcinki szumu z analyseFrames(); expected: wynik parseSibilants(tekst).
// Zwraca { verdict: 'pass' | 'fail' | 'unclear' | 'silent', dL, dH, needL, needH }
//   pass    — głoski szumiące wykryte tam, gdzie miały być, bez nadliczbowych syczących
//   fail    — zabrakło szumiących albo jest za dużo syczących (typowe "socek" zamiast "soczek")
//   unclear — pomiary w strefie niepewnej albo tekst bez głosek do oceny
//   silent  — nie wykryto żadnego szumu głoski
export function judgeUtterance(segments, expected, threshold, toleranceId = 'normal') {
  const tol = TOLERANCE[toleranceId] || TOLERANCE.normal
  const needL = expected.L, needH = expected.H
  if (!segments.length) return { verdict: 'silent', dL: 0, dH: 0, needL, needH }
  let dL = 0, dH = 0
  for (const seg of segments) {
    const c = classifyValue(seg.cog, threshold, tol.dead)
    if (c === 'sz') dL++; else if (c === 's') dH++
  }
  const base = { dL, dH, needL, needH }
  if (needL === 0 && needH === 0) return { verdict: 'unclear', ...base }
  if (dL + dH === 0) return { verdict: 'unclear', ...base }
  if (needL > 0) {
    const ratio = Math.min(dL, needL) / needL
    const extraH = Math.max(0, dH - (needH + expected.Hv))
    return { verdict: ratio >= tol.ratio && extraH <= tol.extraH ? 'pass' : 'fail', ...base }
  }
  // tekst tylko z głoskami syczącymi (słowo kontrolne): źle, gdy pojawiło się "sz" zamiast "s"
  return { verdict: dH >= 1 && dL === 0 ? 'pass' : 'fail', ...base }
}
