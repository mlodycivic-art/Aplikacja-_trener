// Podsumowanie ostatnich 7 dni — z zapisanych planów dni (stc_plan_RRRR-MM-DD)
// i ze wspólnego magazynu wyników. Używane przez panel rodzica i ekran Postępy.

import { calcDayStats, getLevel } from './defaultData'
import { getResults, lastDays, readResults } from './resultsStore'

const WEEKDAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb']

function readPlan(dateKey) {
  try {
    const raw = localStorage.getItem(`stc_plan_${dateKey}`)
    const plan = raw ? JSON.parse(raw) : null
    return Array.isArray(plan) ? plan : null
  } catch (e) { return null }
}

// todayPlan: bieżący plan z pamięci aplikacji (nowszy niż zapis, gdy dziś nic jeszcze nie zmieniono)
export function buildWeek(todayPlan) {
  const keys = lastDays(7)
  const todayKey = keys[keys.length - 1]
  const days = keys.map(key => {
    const plan = key === todayKey && todayPlan ? todayPlan : readPlan(key)
    const stats = plan ? calcDayStats(plan) : null
    const [y, m, d] = key.split('-').map(Number)
    return {
      key, label: `${d}.${m}`, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()],
      hasPlan: !!plan && plan.length > 0,
      total: stats?.total || 0, completed: stats?.completed || 0,
      missed: stats?.missed || 0, cancelled: stats?.cancelled || 0,
      minutes: stats?.minutes || 0, pct: stats?.pct || 0,
    }
  })

  const inWeek = (e) => keys.includes(e.date)
  const all = readResults().filter(inWeek)
  const of = (type) => all.filter(e => e.type === type)

  const nights  = getResults('night_log').filter(e => keys.includes(e.data.forDate))
  const checks  = of('tongue_check')
  const trials  = of('mix_trial')
  const throws  = of('bowling_throw')
  const balloons = of('balloon_game')
  const samples = getResults('weekly_sample')

  return {
    days,
    totals: {
      planned:   days.reduce((s, d) => s + d.total, 0),
      completed: days.reduce((s, d) => s + d.completed, 0),
      missed:    days.reduce((s, d) => s + d.missed, 0),
      cancelled: days.reduce((s, d) => s + d.cancelled, 0),
      minutes:   days.reduce((s, d) => s + d.minutes, 0),
      activeDays: days.filter(d => d.completed > 0).length,
    },
    nights: {
      count: nights.length,
      up: nights.filter(n => n.data.position === 'up').length,
      mid: nights.filter(n => n.data.position === 'mid').length,
      down: nights.filter(n => n.data.position === 'down').length,
      mouthClosed: nights.filter(n => n.data.mouth === 'closed').length,
    },
    checks: { count: checks.length, up: checks.filter(c => c.data.position === 'up').length },
    mix: {
      count: trials.length,
      good: trials.filter(t => t.data.selfRating === 'good').length,
      fixed: trials.filter(t => t.data.selfRating === 'good' && t.data.attempts > 1).length,
    },
    bowling: { throws: throws.length, strikes: throws.filter(t => t.data.pins === 10).length,
               pins: throws.reduce((s, t) => s + (t.data.pins || 0), 0) },
    balloon: { games: balloons.length, completed: balloons.filter(b => b.data.completed).length,
               cycles: balloons.reduce((s, b) => s + (b.data.cycles || 0), 0) },
    lastSample: samples.length ? samples[samples.length - 1] : null,
    prevSample: samples.length > 1 ? samples[samples.length - 2] : null,
  }
}

// Ile dni z rzędu (licząc od dziś lub od wczoraj) było co najmniej jedno ukończone ćwiczenie
export function currentStreak(todayPlan) {
  const keys = lastDays(60)
  const doneDates = new Set(getResults('exercise_done').map(e => e.date))
  const dayDone = (key, isToday) => {
    if (doneDates.has(key)) return true
    const plan = isToday && todayPlan ? todayPlan : readPlan(key)
    return !!plan && plan.some(e => e.status === 'completed')
  }
  let streak = 0
  for (let i = keys.length - 1; i >= 0; i--) {
    const isToday = i === keys.length - 1
    if (dayDone(keys[i], isToday)) streak++
    else if (isToday) continue        // dziś jeszcze nie ćwiczono — seria z wczoraj nadal trwa
    else break
  }
  return streak
}

export function buildWeeklyReportText(user, todayPlan) {
  const w = buildWeek(todayPlan)
  const lvl = getLevel(user.points)
  const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : 'brak danych')
  const L = []
  L.push('RAPORT TYGODNIOWY — Speech Training Coach')
  L.push(`Okres: ${w.days[0].label} – ${w.days[6].label} · wygenerowano ${new Date().toLocaleDateString('pl-PL')}`)
  L.push(`Użytkownik: ${user.name} (wiek: ${user.age})`)
  if (user.goal) L.push(`Cel: ${user.goal}`)
  L.push('')
  L.push('ĆWICZENIA')
  L.push(`• Ukończone: ${w.totals.completed} z ${w.totals.planned} zaplanowanych (${pct(w.totals.completed, w.totals.planned)})`)
  L.push(`• Dni z ćwiczeniami: ${w.totals.activeDays} z 7 · czas: ${w.totals.minutes} min`)
  L.push(`• Nie wykonane: ${w.totals.missed} · anulowane: ${w.totals.cancelled}`)
  w.days.forEach(d => L.push(`  ${d.weekday} ${d.label}: ${d.hasPlan ? `${d.completed}/${d.total} (${d.minutes} min)` : 'brak planu'}`))
  L.push('')
  L.push('MOWA SWOBODNA (główna miara)')
  if (w.lastSample) {
    const s = w.lastSample
    L.push(`• Ostatnia próbka (${s.date}): ${s.data.pct}% poprawnych głosek (${s.data.good} dobrze, ${s.data.bad} błąd)`)
    if (w.prevSample) L.push(`• Poprzednia (${w.prevSample.date}): ${w.prevSample.data.pct}%`)
  } else L.push('• Brak próbki. Panel rodzica → Próbka swobodnej mowy.')
  L.push('')
  L.push('POZYCJA SPOCZYNKOWA JĘZYKA')
  L.push(w.nights.count
    ? `• Noce (${w.nights.count} wpisów): u góry ${w.nights.up}, pośrodku ${w.nights.mid}, na dole ${w.nights.down} · usta zamknięte ${w.nights.mouthClosed}`
    : '• Dziennik nocny: brak wpisów')
  L.push(w.checks.count
    ? `• „Gdzie jest język?”: u góry ${w.checks.up} z ${w.checks.count} odpowiedzi dziecka (${pct(w.checks.up, w.checks.count)})`
    : '• „Gdzie jest język?”: brak odpowiedzi')
  L.push('')
  L.push('ĆWICZENIA Z POMIAREM')
  L.push(w.mix.count
    ? `• Mowa mieszana: ${w.mix.good}/${w.mix.count} słów ocenionych przez dziecko jako dobre, ${w.mix.fixed} po poprawce`
    : '• Mowa mieszana: brak prób')
  L.push(w.balloon.games
    ? `• Balon (dzióbek): ukończone gry: ${w.balloon.completed}, dzióbki łącznie: ${w.balloon.cycles}`
    : '• Balon: brak gier')
  L.push(w.bowling.throws
    ? `• Kręgle (rytm mowy): rzuty: ${w.bowling.throws}, strike: ${w.bowling.strikes}, średnio ${(w.bowling.pins / w.bowling.throws).toFixed(1)} kręgla na rzut`
    : '• Kręgle: brak rzutów')
  L.push('')
  L.push(`Punkty: ${user.points} · poziom ${lvl.level} (${lvl.label})`)
  L.push('Samoocena dziecka i odpowiedzi „Gdzie jest język?” to nie pomiar — pokazują uważność, nie poprawność.')
  return L.join('\n')
}
