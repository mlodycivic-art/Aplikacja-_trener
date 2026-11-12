// Ustawienia domyślne — sposób na przeniesienie USTAWIEŃ między urządzeniami bez logowania.
//
// Dorosły ustawia aplikację na jednym urządzeniu i zapisuje ustawienia do pliku public/preset.json.
// Plik jest częścią aplikacji (idzie z `git push`), więc każde nowe urządzenie przy pierwszym
// uruchomieniu startuje z tymi ustawieniami. W Profilu można je też wczytać ręcznie.
//
// DO PLIKU WCHODZI: ćwiczenia z godzinami i parametrami, lista słów, wygląd, tryb stanowiska,
//                   przypomnienie o języku, z profilu tylko: imię, wiek, typ, cel.
// NIE WCHODZI NIGDY: wyniki, punkty, „zdiagnozowany problem”, kalibracje mikrofonu i kamery,
//                   nagrane wzorce — to dane osoby albo rzeczy przypisane do urządzenia,
//                   a plik leży razem z kodem (w publicznym repozytorium widzi go każdy).

import { DEFAULT_USER } from './defaultData'

const APP_ID = 'speech-training-coach'
const SETTING_KEYS = ['stc_exercises', 'stc_words', 'stc_theme', 'stc_setup_mode', 'stc_tongue_check_on']
const USER_FIELDS = ['name', 'age', 'type', 'goal']
const APPLIED_KEY = 'stc_preset_applied'     // data pliku, z którego to urządzenie ostatnio brało ustawienia
const CHECKED_KEY = 'stc_preset_checked'     // pierwsze uruchomienie już sprawdziło, czy plik istnieje
const PRESET_URL = `${import.meta.env.BASE_URL}preset.json`
export const PRESET_FILE = 'preset.json'

const get = (k) => { try { return localStorage.getItem(k) } catch (e) { return null } }
const set = (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} }

export function collectPreset() {
  const data = {}
  for (const k of SETTING_KEYS) { const v = get(k); if (v != null) data[k] = v }
  let user = {}
  try { user = JSON.parse(get('stc_user') || 'null') || DEFAULT_USER } catch (e) { user = DEFAULT_USER }
  const profile = {}
  for (const f of USER_FIELDS) if (user[f] != null && user[f] !== '') profile[f] = user[f]
  return { app: APP_ID, kind: 'preset', version: 1, savedAt: new Date().toISOString(), profile, data }
}

export function isPreset(p) {
  return !!p && p.app === APP_ID && p.kind === 'preset' && typeof p.data === 'object' && p.data !== null
}

// Zapis: na komputerze z uruchomionym `npm run dev` plik trafia prosto do folderu aplikacji
// (public/preset.json); w każdym innym przypadku przeglądarka pobiera go do Pobranych.
// Zwraca 'saved' | 'downloaded'.
export async function savePreset() {
  const preset = collectPreset()
  const body = JSON.stringify(preset, null, 2)
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}__save-preset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    if (r.ok && (await r.json()).ok) { set(APPLIED_KEY, preset.savedAt); return 'saved' }
  } catch (e) {}
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = PRESET_FILE
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

// Plik z aplikacji albo null (brak pliku, brak sieci, zły format)
export async function fetchPreset(timeoutMs = 4000) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const r = await fetch(`${PRESET_URL}?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal })
    clearTimeout(t)
    if (!r.ok) return null
    const p = JSON.parse(await r.text())
    return isPreset(p) ? p : null
  } catch (e) { return null }
}

// Wpisuje ustawienia z pliku na to urządzenie. Wyniki i kalibracje zostają nietknięte.
// Dzisiejszy plan jest kasowany, żeby zbudował się od nowa z wczytanych godzin. Potem trzeba przeładować stronę.
export function applyPreset(preset) {
  if (!isPreset(preset)) return false
  for (const k of SETTING_KEYS) if (typeof preset.data[k] === 'string') set(k, preset.data[k])
  let user
  try { user = JSON.parse(get('stc_user') || 'null') } catch (e) { user = null }
  user = { ...(user || DEFAULT_USER) }
  for (const f of USER_FIELDS) if (preset.profile && preset.profile[f] != null) user[f] = preset.profile[f]
  set('stc_user', JSON.stringify(user))
  try {
    const drop = []
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('stc_plan_')) drop.push(k) }
    drop.forEach(k => localStorage.removeItem(k))
    // ćwiczenia z pliku mogą pochodzić ze starszej wersji aplikacji: migracja dopisze brakujące przy starcie
    localStorage.removeItem('stc_data_version')
  } catch (e) {}
  set(APPLIED_KEY, preset.savedAt || new Date().toISOString())
  set(CHECKED_KEY, '1')
  return true
}

export const appliedPresetDate = () => get(APPLIED_KEY)

// Nowe urządzenie = nikt tu jeszcze niczego nie ustawił ani nie ćwiczył
function isFreshDevice() {
  return !get(CHECKED_KEY) && !get('stc_exercises') && !get('stc_user') && !get('stc_results_v1')
}

// Wywoływane raz przed narysowaniem aplikacji. Na używanym urządzeniu kończy się od razu.
export async function bootstrapPreset() {
  if (!isFreshDevice()) return false
  const preset = await fetchPreset(2500)
  if (!preset) return false          // brak sieci albo pliku: spróbujemy przy następnym uruchomieniu
  return applyPreset(preset)
}
