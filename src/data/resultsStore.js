// Wspólny magazyn wyników — JEDNO miejsce na wszystko, co aplikacja mierzy.
//
// Dotąd aplikacja pamiętała tylko status ćwiczenia w planie dnia (ukończone / nie).
// Tu zapisujemy pojedyncze zdarzenia z treścią: próby mowy, wyniki gier, sprawdzenia
// języka, dziennik nocny, próbki tygodniowe. Każdy nowy moduł dopisuje swój typ wpisu
// zamiast tworzyć własny klucz w localStorage — dzięki temu raporty i wykresy czytają
// z jednego źródła, a późniejsze przeniesienie do chmury to podmiana tego jednego pliku.
//
// Wpis: { id, ts (ms), date ('YYYY-MM-DD', czas lokalny), type, data }
//
// Typy używane obecnie:
//   'exercise_done'  { templateId, module, name, points }
//   'bowling_throw'  { pct, pins }
//   'balloon_game'   { cycles, targetCycles, durationSec, difficulty, completed }
//   'mix_trial'      { word, kind: 'sz'|'s', selfRating: 'good'|'bad', cog, attempts }
//   'tongue_check'   { position: 'up'|'mid'|'down' }
//   'night_log'      { position: 'up'|'mid'|'down', mouth: 'closed'|'open', forDate }
//   'weekly_sample'  { good, bad, pct, durationSec }
//   'careful_window' { plannedMin, activeMin, good, bad, unclear, sz, s, share, baselineShare, words, judged, monitored, points }

import { useEffect, useState, useCallback } from 'react'

const KEY = 'stc_results_v1'
const MAX_ENTRIES = 5000          // bezpiecznik rozmiaru localStorage (najstarsze wpisy odpadają)
const EVENT = 'stc-results-changed'

// Data lokalna (nie UTC) — wpis zrobiony o 00:30 należy do nowego dnia w Polsce
export function localDateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function readResults() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

function writeResults(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX_ENTRIES)))
    window.dispatchEvent(new Event(EVENT))
    return true
  } catch (e) {
    return false
  }
}

export function addResult(type, data = {}) {
  const now = new Date()
  const entry = {
    id: `${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: now.getTime(),
    date: localDateKey(now),
    type,
    data,
  }
  writeResults([...readResults(), entry])
  return entry
}

export function removeResult(id) {
  writeResults(readResults().filter(e => e.id !== id))
}

export function getResults(type, sinceDays = null) {
  const minTs = sinceDays != null ? Date.now() - sinceDays * 86400000 : 0
  return readResults().filter(e => (!type || e.type === type) && e.ts >= minTs)
}

// Hook: lista wpisów danego typu, odświeżana po każdym zapisie (także z innej karty)
export function useResults(type, sinceDays = null) {
  const load = useCallback(() => getResults(type, sinceDays), [type, sinceDays])
  const [items, setItems] = useState(load)
  useEffect(() => {
    const refresh = () => setItems(load())
    refresh()
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [load])
  return items
}

// Ostatnie N dni jako lista kluczy dat (od najstarszego) — do wykresów
export function lastDays(n) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push(localDateKey(d))
  }
  return out
}
