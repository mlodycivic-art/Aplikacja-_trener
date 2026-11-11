// Kopia zapasowa — wszystkie dane aplikacji żyją w localStorage tej jednej przeglądarki.
// Eksport zbiera każdy klucz zaczynający się od "stc_" do jednego pliku JSON;
// import przywraca je (zastępując obecne) i przeładowuje aplikację.
// Służy też do przeniesienia danych na inne urządzenie (np. z komputera na tablet).

const PREFIX = 'stc_'
const APP_ID = 'speech-training-coach'

export function collectBackup() {
  const data = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(PREFIX)) data[key] = localStorage.getItem(key)
  }
  return { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), data }
}

export function downloadBackup() {
  const backup = collectBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `karolek-mowa-kopia-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return Object.keys(backup.data).length
}

// Sprawdza plik bez zapisywania czegokolwiek. Zwraca { ok, error?, backup?, keys? }
export function parseBackup(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch (e) { return { ok: false, error: 'To nie jest poprawny plik kopii (błąd odczytu JSON).' } }
  if (!parsed || parsed.app !== APP_ID || typeof parsed.data !== 'object' || parsed.data === null) {
    return { ok: false, error: 'Ten plik nie jest kopią zapasową tej aplikacji.' }
  }
  const keys = Object.keys(parsed.data).filter(k => k.startsWith(PREFIX) && typeof parsed.data[k] === 'string')
  if (keys.length === 0) return { ok: false, error: 'Kopia jest pusta.' }
  return { ok: true, backup: parsed, keys }
}

// Zastępuje obecne dane aplikacji danymi z kopii. Wywołujący powinien potem przeładować stronę.
export function restoreBackup(backup) {
  const keys = Object.keys(backup.data).filter(k => k.startsWith(PREFIX) && typeof backup.data[k] === 'string')
  const existing = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(PREFIX)) existing.push(key)
  }
  existing.forEach(k => localStorage.removeItem(k))
  keys.forEach(k => localStorage.setItem(k, backup.data[k]))
  return keys.length
}
