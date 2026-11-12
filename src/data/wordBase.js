// Baza własnych słów — lista słów, które aplikacja wyłapuje w oknie starannej mowy,
// oraz ich wzorce nagrane głosem ćwiczącego (kształt słowa, nie dźwięk; patrz wordSpotter.js).
//
// Klucze w localStorage (wchodzą do kopii zapasowej):
//   stc_words          lista słów: [{ word, group: 'sz'|'cz'|'zh', enabled }]
//   stc_word_models    wzorce: { [word]: { takes: [base64], intra, inter, threshold, reliable, test, date } }
//   stc_careful_base   wzorzec proporcji głosek szumiących ze starannie czytanych zdań
// Wzorce dotyczą tej osoby i tego urządzenia: inny mikrofon albo inna osoba = nowe nagranie.

import { useEffect, useState } from 'react'
import { decodeFeat, encodeFeat, expectedFor, calibrateThresholds } from './wordSpotter'
import { getThreshold } from './patternStore'

const WORDS_KEY = 'stc_words'
const MODELS_KEY = 'stc_word_models'
const BASE_KEY = 'stc_careful_base'
const EVENT = 'stc-words-changed'

export const TAKES_PER_WORD = 3
export const TEST_TRIALS = 2          // tyle zdań testowych na słowo
export const MIN_TEST_HITS = 2        // tyle trafień w teście, żeby słowo monitorować

export const GROUPS = [
  { id: 'sz', label: '„sz”' },
  { id: 'cz', label: '„cz”' },
  { id: 'zh', label: '„ż / rz”' },
]

// Lista startowa: słowa z codziennych sytuacji w domu i w szkole, co najmniej dwusylabowe
// (krótsze, jak „już” czy „że”, są zbyt łatwe do pomylenia z kawałkiem innego słowa).
// Propozycja do sprawdzenia przez rodzica i logopedę; listę edytuje się w zakładce Mikrofon → Słowa.
export const DEFAULT_WORDS = [
  ...['proszę', 'muszę', 'szkoła', 'szybko', 'jeszcze', 'koszulka', 'zeszyt', 'przepraszam', 'przerwa', 'trzeba',
      'pierwszy', 'łóżko', 'szukam', 'pokaż', 'wszystko'].map(word => ({ word, group: 'sz', enabled: true })),
  ...['czemu', 'dlaczego', 'poczekaj', 'czytam', 'cztery', 'czwartek', 'wieczorem', 'soczek', 'zobacz', 'zaczynam',
      'skończyłem', 'klucze', 'ręcznik', 'wycieczka', 'nauczyciel'].map(word => ({ word, group: 'cz', enabled: true })),
  // „ż / rz” dźwięczne mikrofon słyszy najsłabiej — domyślnie wyłączone, do włączenia jako drugi etap
  ...['może', 'możesz', 'żeby', 'dobrze', 'każdy', 'dużo', 'można', 'jeżeli', 'ważne', 'rzeczy']
      .map(word => ({ word, group: 'zh', enabled: false })),
]

// Zdania-nośniki do testu trafności: słowo trafia w środek zwykłego zdania, tak jak w rozmowie.
// W nośnikach nie ma głosek syczących ani szumiących, żeby nie mieszały pomiaru.
export const CARRIERS = ['Mama mówi {w} do taty.', 'Tu było {w} i nikt nie wie.', 'Ala woła {w} dwa razy.']

// Tekst do wzorca proporcji: zwykłe zdania z głoskami szumiącymi i syczącymi w naturalnej mieszance.
export const BASELINE_SENTENCES = [
  'Rano wstaję i idę do szkoły z plecakiem.',
  'Na przerwie jem kanapkę i piję sok.',
  'Po lekcjach odrabiam zadania, a potem gram.',
  'Wieczorem czytam książkę i szykuję rzeczy na jutro.',
  'W sobotę jeżdżę na rowerze albo oglądam mecz.',
  'Czasem pomagam w kuchni i sprzątam swój pokój.',
]

// ── Rdzeń słowa: łapanie odmian bez dopisywania ich do listy ─────────────────
// Rdzeń = słowo bez ostatniej sylaby od samogłoski („szkoł|a”, „koszulk|a”, „czyt|am”, „socz|ek”).
// Jeśli trudna głoska leży w tej końcówce („pokaż”, „zobacz”), rdzeniem jest całe słowo.
// frac: jaka część NAGRANIA odpowiada rdzeniowi. Ostatnia sylaba słowa mówionego osobno jest
// wydłużona, więc bierzemy nieco mniej, niż wynikałoby z liczby liter.
const HARD = /dż|sz|cz|rz|ż/gu
export function stemOf(raw) {
  const w = (raw || '').toLowerCase().trim()
  let lastVowelRun = -1
  for (const m of w.matchAll(/[aąeęioóuy]+/gu)) lastVowelRun = m.index
  let hardEnd = 0
  for (const m of w.matchAll(HARD)) hardEnd = m.index + m[0].length
  const firstVowel = w.search(/[aąeęioóuy]/u)
  if (lastVowelRun <= 0 || lastVowelRun <= firstVowel || lastVowelRun < hardEnd) return { text: w, frac: 1 }
  return { text: w.slice(0, lastVowelRun), frac: Math.max(0.5, (lastVowelRun / w.length) * 0.92) }
}
// Słowa nieodmienne oraz takie, w których głoska zmienia się w odmianie („muszę” → „musisz”, „proszę” → „prosisz”):
// tu rdzeń nic nie daje albo wprowadzałby w błąd, więc dopasowujemy całe słowo.
const WHOLE_ONLY = ['proszę', 'muszę', 'jeszcze', 'trzeba', 'czemu', 'dlaczego', 'może', 'żeby', 'dobrze', 'dużo', 'można', 'jeżeli']
const syllablesOf = (w) => (w.match(/[aąeęioóuy]+/gu) || []).length
export function defaultMode(word, custom = false) {
  if (WHOLE_ONLY.includes(word) || stemOf(word).frac >= 1) return 'whole'
  return custom && syllablesOf(word) < 3 ? 'whole' : 'stem'
}
export const canStem = (word) => stemOf(word).frac < 1
export const modeOf = (entry) => entry.mode || defaultMode(entry.word, entry.custom)

// Odmiana do testu trafności (jedno zdanie na słowo): sprawdza, czy rdzeń rzeczywiście łapie inną formę.
export const TEST_FORMS = {
  szkoła: 'szkoły', szybko: 'szybki', koszulka: 'koszulkę', zeszyt: 'zeszyty', przepraszam: 'przepraszasz', przerwa: 'przerwy',
  pierwszy: 'pierwsza', łóżko: 'łóżka', szukam: 'szukasz', wszystko: 'wszystkie', poczekaj: 'poczekam', czytam: 'czytasz',
  cztery: 'czterech', czwartek: 'czwartku', wieczorem: 'wieczory', soczek: 'soczku', zaczynam: 'zaczynasz', skończyłem: 'skończyłeś',
  klucze: 'kluczy', ręcznik: 'ręczniki', wycieczka: 'wycieczki', nauczyciel: 'nauczyciela', każdy: 'każda', ważne: 'ważny', rzeczy: 'rzeczach',
}

const normalize = (w) => (w || '').toLowerCase().trim().replace(/[^a-ząćęłńóśźż]/gu, '')

// ── Lista słów ───────────────────────────────────────────────────────────────
export function readWords() {
  try {
    const arr = JSON.parse(localStorage.getItem(WORDS_KEY) || 'null')
    if (Array.isArray(arr)) return arr
  } catch (e) {}
  return DEFAULT_WORDS
}
function emit() { window.dispatchEvent(new Event(EVENT)) }
export function saveWords(list) {
  try { localStorage.setItem(WORDS_KEY, JSON.stringify(list)) } catch (e) {}
  emit()
}
export function groupFor(word) {
  const w = normalize(word)
  if (w.includes('cz')) return 'cz'
  const e = expectedFor(w)
  return e.L > 0 ? 'sz' : 'zh'
}
// Zwraca { ok, error? }. Słowo musi mieć głoskę szumiącą i co najmniej dwie sylaby.
export function addWord(raw) {
  const word = normalize(raw)
  if (!word) return { ok: false, error: 'Wpisz słowo.' }
  const list = readWords()
  if (list.some(x => x.word === word)) return { ok: false, error: 'To słowo już jest na liście.' }
  const e = expectedFor(word)
  if (e.L + e.Lv === 0) return { ok: false, error: 'W tym słowie nie ma głoski szumiącej (sz, cz, ż, rz, dż).' }
  const syllables = (word.match(/[aąeęioóuy]+/gu) || []).length
  if (syllables < 2) return { ok: false, error: 'Za krótkie: jednosylabowych słów nie da się pewnie wyłapać w rozmowie.' }
  saveWords([...list, { word, group: groupFor(word), enabled: true, custom: true }])
  return { ok: true }
}
export function removeWord(word) {
  saveWords(readWords().filter(x => x.word !== word))
  const models = readModels()
  if (models[word]) { delete models[word]; saveModels(models) }
}
// Zmiana trybu („całe słowo” ↔ „rdzeń”) unieważnia test trafności tego słowa: próg i wzorce z testu były dla starego trybu.
export function setWordMode(word, mode) {
  saveWords(readWords().map(x => (x.word === word ? { ...x, mode } : x)))
  const all = loadAllModels()
  if (all[word]) {
    const m = all[word]
    m.takes = m.takes.slice(0, m.takes.length - (m.extra || 0))
    m.extra = 0; delete m.test
    applyMode(m, word, mode)
    recalibrateUntested(all)
    storeModels(all)
  }
}
export function applyMode(model, word, mode) {
  const st = stemOf(word)
  model.mode = mode
  model.frac = mode === 'stem' ? st.frac : 1
  model.stemText = mode === 'stem' ? st.text : null
  return model
}
export function setWordEnabled(word, enabled) {
  saveWords(readWords().map(x => (x.word === word ? { ...x, enabled } : x)))
}

// ── Wzorce ───────────────────────────────────────────────────────────────────
export function readModels() {
  try {
    const obj = JSON.parse(localStorage.getItem(MODELS_KEY) || '{}')
    return obj && typeof obj === 'object' ? obj : {}
  } catch (e) { return {} }
}
export function saveModels(models) {
  try { localStorage.setItem(MODELS_KEY, JSON.stringify(models)); emit(); return true }
  catch (e) { return false }
}

// Stan słowa do wyświetlenia i do decyzji, czy je monitorować:
//   'none'      brak nagrań
//   'weak'      nagrania są, ale wzorzec myli się z innymi słowami albo test trafności wypadł słabo
//   'untested'  wzorzec wygląda dobrze, test trafności jeszcze nie zrobiony
//   'ok'        wzorzec dobry i test trafności zaliczony
export function wordState(model) {
  if (!model || !model.takes?.length) return 'none'
  if (model.reliable === false) return 'weak'
  if (model.test) return model.test.hits >= Math.min(MIN_TEST_HITS, model.test.trials) && model.test.falseAlarms <= 1 ? 'ok' : 'weak'
  return 'untested'
}
export const STATE_LABEL = { none: 'brak nagrań', weak: 'niepewne', untested: 'bez testu', ok: 'pewne' }

// Modele gotowe do szukania: tylko słowa włączone i niebędące "niepewne".
// includeUntested: przed testem trafności też szukamy (wynik okna jest wtedy oznaczony jako orientacyjny).
export function loadActiveModels({ includeUntested = true } = {}) {
  const all = loadAllModels()
  const out = {}
  for (const w of readWords()) {
    const m = all[w.word]
    const st = wordState(m)
    if (!w.enabled || st === 'none' || st === 'weak' || (st === 'untested' && !includeUntested)) continue
    if (!m.threshold) continue
    out[w.word] = m
  }
  return out
}

export function summarizeBase() {
  const words = readWords(), models = readModels()
  const c = { total: words.length, enabled: 0, recorded: 0, ok: 0, untested: 0, weak: 0 }
  for (const w of words) {
    if (!w.enabled) continue
    c.enabled++
    const st = wordState(models[w.word])
    if (st !== 'none') c.recorded++
    if (st === 'ok') c.ok++; else if (st === 'untested') c.untested++; else if (st === 'weak') c.weak++
  }
  return c
}

// ── Wzorzec proporcji ────────────────────────────────────────────────────────
export function getBaseline() {
  try { const b = JSON.parse(localStorage.getItem(BASE_KEY) || 'null'); return b && typeof b.share === 'number' ? b : null } catch (e) { return null }
}
export function saveBaseline(sz, s) {
  if (sz + s < 8) return null
  const b = { share: sz / (sz + s), sz, s, date: new Date().toISOString() }
  try { localStorage.setItem(BASE_KEY, JSON.stringify(b)) } catch (e) {}
  emit()
  return b
}

export function useWordBase() {
  const [state, setState] = useState(() => ({ words: readWords(), models: readModels(), baseline: getBaseline() }))
  useEffect(() => {
    const refresh = () => setState({ words: readWords(), models: readModels(), baseline: getBaseline() })
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('storage', refresh) }
  }, [])
  return state
}

// Próg mikrofonu nadający się do oceniania głosek (pewny i, jeśli był test na słowach, trafny w ≥ 70%)
export function getUsableThreshold() {
  const th = getThreshold()
  return th && th.quality === 'good' && (th.accuracy == null || th.accuracy >= 0.7) ? th : null
}

// Wszystkie zapisane wzorce w postaci do obliczeń (cechy rozpakowane)
export function loadAllModels() {
  const stored = readModels(), out = {}
  for (const [word, m] of Object.entries(stored)) {
    try { if (m.takes?.length) out[word] = { ...m, takes: m.takes.map(decodeFeat) } } catch (e) {}
  }
  // wzorce nagrane przed wprowadzeniem trybu „rdzeń” albo z innym trybem niż na liście: ustawiamy tryb z listy
  for (const entry of readWords()) {
    const m = out[entry.word]
    if (!m || m.mode === modeOf(entry)) continue
    m.takes = m.takes.slice(0, m.takes.length - (m.extra || 0)); m.extra = 0; delete m.test
    applyMode(m, entry.word, modeOf(entry))
  }
  return out
}
// Zapis wzorców po obliczeniach (cechy z powrotem do base64)
export function storeModels(models) {
  const out = {}
  for (const [word, m] of Object.entries(models)) out[word] = { ...m, takes: m.takes.map(encodeFeat) }
  return saveModels(out)
}

// Po nagraniu nowych wzorców: progi wstępne dla słów BEZ testu trafności.
// Słowa po teście zachowują próg dostrojony na zdaniach (jest lepszy niż wstępny).
export function recalibrateUntested(models) {
  const keep = {}
  for (const [w, m] of Object.entries(models)) if (m.test) keep[w] = { threshold: m.threshold, inter: m.inter, reliable: m.reliable }
  calibrateThresholds(models)
  for (const [w, k] of Object.entries(keep)) Object.assign(models[w], k)
  return models
}
