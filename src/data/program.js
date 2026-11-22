// Plan 4‑tygodniowy — co poniedziałek aplikacja sama wpisuje godziny i zestawy na nowy tydzień.
//
// Stan planu (włączony, data startu, który tydzień jest wpisany, kopia wcześniejszych godzin)
// leży w localStorage pod kluczem stc_program i idzie razem z „ustawieniami domyślnymi”.
// Treść tygodni jest tutaj, w kodzie.
//
// Każdy dzień ma dwie sesje po ok. 12 min: Gimnastyka → SZ Lip Shape → Speech Rhythm (→ powtórka),
// a na koniec dnia Froggy Mouth 20 min. Alarm dzwoni tylko na początek sesji i na Froggy;
// pozostałe ćwiczenia sesji idą zaraz po sobie, bez osobnego alarmu.

import { DEFAULT_SOUND_SETS } from './defaultData'

export const PROGRAM_KEY = 'stc_program'
export const DEFAULT_PROGRAM_STATE = { enabled: true, start: '2026-11-23', appliedWeek: null, backup: null }

const WEEKDAY_TIMES = { sessions: ['15:30', '20:00'], froggy: '20:40' }
const WEEKEND_TIMES = { sessions: ['10:00', '19:00'], froggy: '19:30' }
const MON_WED = [0, 1, 2], THU_SUN = [3, 4, 5, 6], MON_SUN = [0, 1, 2, 3, 4, 5, 6]

// Skróty: G = gimnastyka, S(n) = SZ Lip zestaw n (1–10), R(głoska, poziom) = Speech Rhythm
const G = { kind: 'gym' }
const S = (n) => ({ kind: 'sz', setIdx: n - 1 })
const R = (setId, level) => ({ kind: 'sr', setId, level })

// Szacowany czas (min) — do kolejnych godzin w sesji i do podsumowań
const SR_MIN = { short: 3, medium: 5, zsounds: 6, harder: 6, twisters: 2, poem: 2 }
const SR_MIN_SZS = { short: 2, medium: 2, zsounds: 5, harder: 4, twisters: 2, poem: 2 }

export const PROGRAM_WEEKS = [
  {
    title: 'Tydzień 1 — kształt ust przy SZ, spokojne tempo',
    gym: { tempo: 'slow', reps: {} }, gymMin: 8,
    days: [
      { days: MON_SUN, sessions: [[G, S(1), R('sz', 'short')], [G, S(2), R('sz', 'short')]] },
    ],
  },
  {
    title: 'Tydzień 2 — SZ w wyrazach',
    gym: { tempo: 'normal', reps: {} }, gymMin: 7,
    days: [
      { days: MON_WED, sessions: [[G, S(3), R('sz', 'medium')], [G, S(4), R('sz', 'medium')]] },
      { days: THU_SUN, sessions: [[G, S(3), R('sz', 'zsounds')], [G, S(4), R('sz', 'zsounds')]] },
    ],
  },
  {
    title: 'Tydzień 3 — CZ („soczek”, nie „socek”)',
    gym: { tempo: 'normal', reps: { lift: 8, cup: 8 } }, gymMin: 7,
    days: [
      { days: MON_WED, sessions: [[G, S(5), R('cz', 'short')], [G, S(6), R('cz', 'short')]] },
      { days: THU_SUN, sessions: [[G, S(5), R('cz', 'medium')], [G, S(6), R('cz', 'medium')]] },
    ],
  },
  {
    title: 'Tydzień 4 — Ż/RZ, zbitki, odróżnianie SZ od S',
    gym: { tempo: 'normal', reps: { lift: 8, cup: 8 } }, gymMin: 7,
    days: [
      { days: MON_WED, sessions: [[G, S(7), R('sz_s', 'short'), R('cz', 'short')], [G, S(8), R('sz_s', 'short'), R('cz', 'short')]] },
      { days: [3, 4],  sessions: [[G, S(10), R('sz_s', 'medium'), R('cz', 'short')], [G, S(6), R('sz_s', 'medium'), R('cz', 'short')]] },
      { days: [5, 6],  sessions: [[G, S(4), R('sz_s', 'medium'), R('cz', 'short')], [G, S(6), R('sz_s', 'medium'), R('cz', 'short')]] },
    ],
  },
]

// ── Daty ────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseIso = (s) => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const shortDate = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`

// Najbliższy poniedziałek (dziś, jeśli dziś jest poniedziałek)
export function nextMonday(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const js = d.getDay()
  return addDays(d, js === 1 ? 0 : (8 - js) % 7)
}

// Indeks tygodnia (0–3) dla daty; -1 przed startem, PROGRAM_WEEKS.length po końcu
export function weekIndexFor(state, date = new Date()) {
  const start = parseIso(state?.start)
  if (!start) return -1
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = Math.round((day - start) / 86400000)
  if (diff < 0) return -1
  return Math.min(PROGRAM_WEEKS.length, Math.floor(diff / 7))
}

export function weekRange(state, idx) {
  const start = parseIso(state?.start)
  if (!start) return ''
  return `${shortDate(addDays(start, idx * 7))}–${shortDate(addDays(start, idx * 7 + 6))}`
}

export const programEnd = (state) => {
  const start = parseIso(state?.start)
  return start ? addDays(start, PROGRAM_WEEKS.length * 7 - 1) : null
}

// ── Budowa harmonogramu tygodnia ────────────────────────────────────────────
const addMin = (hour, min) => {
  const [h, m] = hour.split(':').map(Number)
  const t = h * 60 + m + min
  return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`
}

const itemMin = (it, week) => {
  if (it.kind === 'gym') return week.gymMin
  if (it.kind === 'sz') return 2
  return (it.setId === 'sz_s' ? SR_MIN_SZS : SR_MIN)[it.level] || 3
}

const phonemeOf = (setId) => (DEFAULT_SOUND_SETS.find(s => s.id === setId) || {}).phoneme || setId

// { gym: [...], sz: [...], sr: [...], froggy: [...] } — sloty harmonogramu na cały tydzień
export function buildWeekSchedule(weekIdx) {
  const week = PROGRAM_WEEKS[weekIdx]
  const out = { gym: [], sz: [], sr: [], froggy: [] }
  for (const group of week.days) {
    for (const day of group.days) {
      const times = day >= 5 ? WEEKEND_TIMES : WEEKDAY_TIMES
      group.sessions.forEach((items, si) => {
        let hour = times.sessions[si]
        items.forEach((it, k) => {
          const slot = { day, hour }
          if (k > 0) slot.alarm = false          // w środku sesji bez alarmu — dziecko już ćwiczy
          if (it.kind === 'gym') out.gym.push(slot)
          if (it.kind === 'sz') out.sz.push({ ...slot, setIdx: it.setIdx })
          if (it.kind === 'sr') out.sr.push({ ...slot, activeSetId: it.setId, activeLevel: it.level, activePhoneme: phonemeOf(it.setId) })
          hour = addMin(hour, itemMin(it, week))
        })
      })
      out.froggy.push({ day, hour: times.froggy })
    }
  }
  const byTime = (a, b) => a.day - b.day || a.hour.localeCompare(b.hour)
  for (const k of Object.keys(out)) out[k].sort(byTime)
  return out
}

// Szacowane minuty ćwiczeń w sesjach danego dnia (bez Froggy)
export function sessionMinutes(weekIdx, day) {
  const week = PROGRAM_WEEKS[weekIdx]
  const group = week.days.find(g => g.days.includes(day))
  return group ? group.sessions.map(items => items.reduce((s, it) => s + itemMin(it, week), 0)) : []
}

// Czytelny opis sesji — do karty w Trenerze
const LEVEL_LABEL = { short: 'krótkie', medium: 'średnie', zsounds: 'z głoskami', harder: 'trudniejsze', twisters: 'łamańce', poem: 'wierszyk' }
export function describeItems(items) {
  return items.map(it => {
    if (it.kind === 'gym') return 'Gimnastyka'
    if (it.kind === 'sz') return `SZ Lip zest. ${it.setIdx + 1}`
    return `Rytm ${phonemeOf(it.setId).toUpperCase()} ${LEVEL_LABEL[it.level] || it.level}`
  }).join(' → ')
}

// ── Wpisanie tygodnia do ćwiczeń ─────────────────────────────────────────────
const PROGRAM_MODULES = ['tongue_position', 'sz_lip', 'speech_rhythm', 'froggy_mouth']

// Główne ćwiczenie danego modułu (pierwsze na liście — dodatkowe kopie Speech Rhythm nie biorą udziału)
const mainOf = (exercises, module) => (exercises || []).find(e => e.module === module)

function applyGymWeek(gym, week) {
  if (!gym?.stations) return gym
  return {
    ...gym,
    stations: gym.stations.map(s => ({
      ...s,
      tempo: week.gym.tempo || s.tempo,
      ...(week.gym.reps[s.id] ? { reps: week.gym.reps[s.id] } : {}),
    })),
  }
}

// Zwraca { exercises, backup }. Pozostałe ćwiczenia dostają pusty harmonogram na czas planu;
// ich wcześniejsze godziny są w backup (przywracane po wyłączeniu planu).
export function applyProgramWeek(exercises, weekIdx, backup) {
  const week = PROGRAM_WEEKS[weekIdx]
  const sched = buildWeekSchedule(weekIdx)
  const main = Object.fromEntries(PROGRAM_MODULES.map(m => [m, mainOf(exercises, m)?.id]))
  const bk = backup || Object.fromEntries((exercises || []).map(e => [e.id, e.schedule || []]))
  const next = (exercises || []).map(ex => {
    if (ex.id === main.tongue_position) {
      return { ...ex, schedule: sched.gym, duration: week.gymMin, params: { ...(ex.params || {}), gym: applyGymWeek(ex.params?.gym, week) } }
    }
    if (ex.id === main.sz_lip)        return { ...ex, schedule: sched.sz, duration: 2 }
    if (ex.id === main.speech_rhythm) return { ...ex, schedule: sched.sr, duration: 4 }
    if (ex.id === main.froggy_mouth)  return { ...ex, schedule: sched.froggy, duration: 20 }
    return (ex.schedule || []).length ? { ...ex, schedule: [] } : ex
  })
  return { exercises: next, backup: bk }
}

// Po wyłączeniu planu: wcześniejsze godziny wracają (ćwiczenia dodane w trakcie zostają bez zmian)
export function restoreBackup(exercises, backup) {
  if (!backup) return exercises
  return (exercises || []).map(ex => (ex.id in backup ? { ...ex, schedule: backup[ex.id] } : ex))
}

export function readProgram() {
  try { return JSON.parse(localStorage.getItem(PROGRAM_KEY) || 'null') } catch (e) { return null }
}
export function writeProgram(state) {
  try { localStorage.setItem(PROGRAM_KEY, JSON.stringify(state)) } catch (e) {}
}

// Wywoływane przy starcie aplikacji. Jeśli wypada nowy tydzień planu, zwraca nowe ćwiczenia; inaczej null.
export function syncProgram(exercises, date = new Date()) {
  const state = readProgram()
  if (!state?.enabled) return null
  const idx = weekIndexFor(state, date)
  if (idx < 0 || idx >= PROGRAM_WEEKS.length) return null       // przed startem / po końcu: nic nie ruszamy
  if (state.appliedWeek === idx) return null
  const { exercises: next, backup } = applyProgramWeek(exercises, idx, state.backup)
  writeProgram({ ...state, appliedWeek: idx, backup })
  return next
}
