// Punkty zależne od wyniku (zasady uzgodnione 11.11.2026).
//
//   Kręgle          1 pkt za każde 2 przewrócone kręgle, 10 pkt za strike
//   Balon           1 pkt za 3 dzióbki, +10 pkt za napompowany balon
//   Mowa mieszana   1 pkt za słowo, 2 pkt za słowo poprawione po odsłuchu
//   Gdzie jest język?  1 pkt za każdą odpowiedź, niezależnie od treści
//                      (żeby nie opłacało się klikać "u góry" dla punktów)
//   Pozostałe ćwiczenia: jak dotąd (stała liczba punktów)
//
// Ukończone ćwiczenie zawsze daje co najmniej MIN_POINTS — samo dokończenie też się liczy.

import { readResults } from './resultsStore'

export const MIN_POINTS = 5
export const TONGUE_CHECK_POINTS = 1

export function pointsForEntry(entry) {
  const d = entry.data || {}
  switch (entry.type) {
    case 'bowling_throw': return d.pins === 10 ? 10 : Math.floor((d.pins || 0) / 2)
    case 'balloon_game':  return Math.floor((d.cycles || 0) / 3) + (d.completed ? 10 : 0)
    case 'mix_trial':     return d.selfRating === 'good' && d.attempts > 1 ? 2 : 1
    default:              return 0
  }
}

// Moduły, w których punkty wynikają z pomiaru, i typ wpisu, z którego się je liczy
const MODULE_RESULT_TYPE = {
  speech_rhythm: 'bowling_throw',
  sz_lip:        'balloon_game',
  mix_speech:    'mix_trial',
}

// Punkty za ćwiczenie zakończone teraz, na podstawie wpisów zapisanych od sinceTs.
// Zwraca null, gdy moduł nie ma punktacji z wyniku albo nic nie zmierzono
// (np. SZ Lip w trybie zwykłym, Speech Rhythm bez mikrofonu) — wtedy obowiązuje stała stawka.
export function performancePoints(module, sinceTs) {
  const type = MODULE_RESULT_TYPE[module]
  if (!type) return null
  const entries = readResults().filter(e => e.type === type && e.ts >= sinceTs)
  if (entries.length === 0) return null
  const sum = entries.reduce((s, e) => s + pointsForEntry(e), 0)
  return Math.max(MIN_POINTS, sum)
}
