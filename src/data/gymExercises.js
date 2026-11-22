// „Gimnastyka buzi i języka” — seria krótkich ćwiczeń w trzech etapach (zastępuje dawne „Tongue Up Position”).
// Źródło ćwiczeń: zestaw szkolnego logopedy (SP Mogielnica, 2024) + koszyczek (miseczkowanie).
// Pominięte: jedzenie paluszków i opłatka. Liczby powtórzeń i tempa to propozycja do uzgodnienia z logopedką.
//
// Każde ćwiczenie to klatki kluczowe dla animowanej twarzy (screens/gym/FaceRig.jsx): t = 0…1 w jednym powtórzeniu.
// Zapis w ćwiczeniu: params.gym = { stageOrder: [...], stations: [{ id, enabled, reps, tempo }], voice }

import { TOOTH_X } from '../screens/gym/FaceRig'

export const STAGES = [
  { id: 'lips',   name: 'Ćwiczenia warg' },
  { id: 'tongue', name: 'Ćwiczenia języka' },
  { id: 'palate', name: 'Ćwiczenia podniebienia miękkiego' },
]

export const TEMPOS = {
  slow:   { label: 'Wolno',     factor: 1.4 },
  normal: { label: 'Normalnie', factor: 1 },
  fast:   { label: 'Szybko',    factor: 0.75 },
}

const OPEN = { jaw: 1, lipGap: 0.6 }

// Liczenie zębów: z pozycji wyjściowej (buzia otwarta, czubek języka na środku) dotknięcie zęba i powrót na środek;
// 8 zębów u góry od lewej do prawej, potem 8 na dole od prawej do lewej.
function countTeethKeys() {
  const rest = { ...OPEN, tip: 1, tipX: 0, tipY: 0 }
  const touches = [...TOOTH_X.map(x => ({ tipX: x, tipY: -1 })), ...[...TOOTH_X].reverse().map(x => ({ tipX: x, tipY: 1 }))]
  const seg = 1 / touches.length, keys = []
  touches.forEach((tch, i) => {
    const t0 = i * seg
    keys.push({ t: t0, ...rest }, { t: t0 + seg * 0.35, ...rest, ...tch }, { t: t0 + seg * 0.55, ...rest, ...tch }, { t: t0 + seg * 0.9, ...rest })
  })
  keys.push({ t: 1, ...rest })
  return keys
}

export const STATIONS = [
  // ── Wargi ──
  { id: 'smile_teeth', stage: 'lips', name: 'Uśmiech z zębami', reps: 5, cycleMs: 3000,
    hint: 'Uśmiechnij się szeroko, tak żeby było widać wszystkie zęby. Zęby zostają złączone. Przytrzymaj i rozluźnij.',
    keys: [{ t: 0 }, { t: 0.25, smile: 1, lipGap: 0.9 }, { t: 0.7, smile: 1, lipGap: 0.9 }, { t: 1 }] },
  { id: 'smile_closed', stage: 'lips', name: 'Uśmiech z zamkniętymi ustami', reps: 5, cycleMs: 3000,
    hint: 'Uśmiechnij się szeroko, ale usta zostają zamknięte. Przytrzymaj i rozluźnij.',
    keys: [{ t: 0 }, { t: 0.25, smile: 1 }, { t: 0.7, smile: 1 }, { t: 1 }] },
  { id: 'pucker_smile', stage: 'lips', name: 'Dzióbek i uśmiech', reps: 6, cycleMs: 3600,
    hint: 'Na zmianę: usta w dzióbek, potem szeroki uśmiech z widocznymi zębami. Spokojnie, dokładnie.',
    keys: [{ t: 0 }, { t: 0.18, pucker: 1 }, { t: 0.42, pucker: 1 }, { t: 0.58, smile: 1, lipGap: 0.9 }, { t: 0.84, smile: 1, lipGap: 0.9 }, { t: 1 }] },
  { id: 'kiss', stage: 'lips', name: 'Całuski', reps: 5, cycleMs: 2600,
    hint: 'Ściągnij usta mocno do przodu i wyślij całusa.',
    keys: [{ t: 0 }, { t: 0.3, pucker: 1 }, { t: 0.5, pucker: 1, heart: 0 }, { t: 0.62, pucker: 0.3, heart: 0.3 }, { t: 0.95, heart: 1 }, { t: 1 }] },
  { id: 'cheeks', stage: 'lips', name: 'Nadymanie policzków', reps: 5, cycleMs: 3200,
    hint: 'Usta zamknięte, nadmuchaj oba policzki i oddychaj nosem. Przytrzymaj i wypuść powietrze.',
    keys: [{ t: 0 }, { t: 0.3, cheek: 1 }, { t: 0.75, cheek: 1 }, { t: 1 }] },
  { id: 'straw', stage: 'lips', name: 'Wąsy z rurki', reps: 3, cycleMs: 6000,
    hint: 'Połóż rurkę (słomkę albo ołówek) na górnej wardze pod nosem. Zrób dzióbek i trzymaj rurkę jak najdłużej, bez rąk.',
    keys: [{ t: 0, straw: 1 }, { t: 0.2, straw: 1, pucker: 1 }, { t: 0.85, straw: 1, pucker: 1 }, { t: 1, straw: 1 }] },
  // ── Język ──
  { id: 'lift', stage: 'tongue', name: 'Winda', reps: 6, cycleMs: 3000,
    hint: 'Otwórz szeroko buzię. Szeroki język unieś za górne zęby, przytrzymaj i opuść. Żuchwa się nie rusza.',
    keys: [{ t: 0, ...OPEN }, { t: 0.15, ...OPEN }, { t: 0.45, ...OPEN, tongueUp: 1 }, { t: 0.8, ...OPEN, tongueUp: 1 }, { t: 1, ...OPEN }] },
  { id: 'count_teeth', stage: 'tongue', name: 'Liczenie zębów', reps: 1, cycleMs: 22400,
    hint: 'Buzia otwarta, czubek języka na środku. Dotknij czubkiem języka jednego zęba i wróć na środek. Tak po kolei: osiem zębów na górze i osiem na dole.',
    keys: countTeethKeys() },
  { id: 'cup', stage: 'tongue', name: 'Koszyczek', reps: 5, cycleMs: 3600,
    hint: 'Buzia szeroko otwarta. Unieś szeroki język za górne zęby i zawiń jego brzegi do góry, żeby powstał koszyczek. Przytrzymaj.',
    keys: [{ t: 0, ...OPEN }, { t: 0.15, ...OPEN }, { t: 0.45, ...OPEN, tongueUp: 0.9, tongueCup: 1 }, { t: 0.82, ...OPEN, tongueUp: 0.9, tongueCup: 1 }, { t: 1, ...OPEN }] },
  // ── Podniebienie miękkie ──
  { id: 'yawn', stage: 'palate', name: 'Ziewanie', reps: 3, cycleMs: 4500,
    hint: 'Ziewnij szeroko z nisko opuszczoną żuchwą. Język leży swobodnie na dnie buzi.',
    keys: [{ t: 0 }, { t: 0.4, jaw: 1, lipGap: 1, palateUp: 1 }, { t: 0.75, jaw: 1, lipGap: 1, palateUp: 1 }, { t: 1 }] },
  { id: 'huff', stage: 'palate', name: 'Chuchanie', reps: 5, cycleMs: 2600,
    hint: 'Otwórz buzię i chuchnij ciepłym powietrzem na dłonie, jakby było zimno.',
    keys: [{ t: 0, jaw: 0.5, lipGap: 0.8 }, { t: 0.15, jaw: 0.5, lipGap: 0.8, breath: 0.05 }, { t: 0.85, jaw: 0.5, lipGap: 0.8, breath: 1 }, { t: 1, jaw: 0.5, lipGap: 0.8 }] },
  { id: 'laugh', stage: 'palate', name: 'Śmiech', reps: 2, cycleMs: 6000,
    hint: 'Pośmiej się na różne sposoby: ha ha, hi hi, he he, ho ho.',
    keys: [
      { t: 0, say: 'ha ha' }, { t: 0.06, jaw: 0.7, lipGap: 0.9, say: 'ha ha' }, { t: 0.12, jaw: 0.15, say: 'ha ha' }, { t: 0.18, jaw: 0.7, lipGap: 0.9, say: 'ha ha' },
      { t: 0.25, jaw: 0.1, say: 'hi hi' }, { t: 0.31, jaw: 0.2, smile: 0.9, lipGap: 0.8, say: 'hi hi' }, { t: 0.37, smile: 0.4, say: 'hi hi' }, { t: 0.43, jaw: 0.2, smile: 0.9, lipGap: 0.8, say: 'hi hi' },
      { t: 0.5, say: 'he he' }, { t: 0.56, jaw: 0.45, smile: 0.4, lipGap: 0.8, say: 'he he' }, { t: 0.62, jaw: 0.1, say: 'he he' }, { t: 0.68, jaw: 0.45, smile: 0.4, lipGap: 0.8, say: 'he he' },
      { t: 0.75, say: 'ho ho' }, { t: 0.81, jaw: 0.5, pucker: 0.7, lipGap: 0.6, say: 'ho ho' }, { t: 0.87, pucker: 0.3, say: 'ho ho' }, { t: 0.93, jaw: 0.5, pucker: 0.7, lipGap: 0.6, say: 'ho ho' },
      { t: 1, say: 'ho ho' },
    ] },
]

export const stationById = Object.fromEntries(STATIONS.map(s => [s.id, s]))

// Proponowana kolejność: rozgrzewka warg, potem język, na koniec podniebienie miękkie.
export const DEFAULT_GYM = {
  stageOrder: STAGES.map(s => s.id),
  stations: STATIONS.map(s => ({ id: s.id, enabled: true, reps: s.reps, tempo: 'normal' })),
  voice: true,
}

// Uzupełnia zapisane ustawienia o nowe ćwiczenia i usuwa nieznane (po aktualizacji aplikacji).
export function normalizeGym(gym) {
  const g = gym && typeof gym === 'object' ? gym : {}
  const stageOrder = [...(g.stageOrder || []).filter(id => STAGES.some(s => s.id === id))]
  for (const s of STAGES) if (!stageOrder.includes(s.id)) stageOrder.push(s.id)
  const stations = (g.stations || []).filter(s => stationById[s.id]).map(s => ({
    id: s.id, enabled: s.enabled !== false,
    reps: Math.max(1, Math.min(30, Number(s.reps) || stationById[s.id].reps)),
    tempo: TEMPOS[s.tempo] ? s.tempo : 'normal',
  }))
  for (const s of STATIONS) if (!stations.some(x => x.id === s.id)) stations.push({ id: s.id, enabled: true, reps: s.reps, tempo: 'normal' })
  return { stageOrder, stations, voice: g.voice !== false }
}

// Lista do wykonania: etapy w ustawionej kolejności, w każdym włączone ćwiczenia w ustawionej kolejności.
export function buildRun(gym) {
  const g = normalizeGym(gym)
  const out = []
  for (const stage of g.stageOrder) {
    for (const s of g.stations) {
      const def = stationById[s.id]
      if (!s.enabled || def.stage !== stage) continue
      out.push({ ...def, reps: s.reps, tempo: s.tempo, cycle: Math.round(def.cycleMs * TEMPOS[s.tempo].factor) })
    }
  }
  return out
}

export const estimateSec = (gym) => Math.round(buildRun(gym).reduce((sum, s) => sum + (s.cycle * s.reps) / 1000 + 4, 0))
export const stageName = (id) => STAGES.find(s => s.id === id)?.name || id
