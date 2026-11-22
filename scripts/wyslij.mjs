// npm run wyslij — wysyła aplikację na GitHub (a stamtąd na Vercel).
//
// Jeśli „Zapisz jako ustawienia domyślne” pobrało plik do folderu Pobrane (preset.json, preset (1).json…),
// skrypt najpierw przenosi najnowszy z nich do public/preset.json — wtedy telefon i tablet go zobaczą.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'public', 'preset.json')
const downloads = path.join(os.homedir(), 'Downloads')

function readPreset(file) {
  try {
    const p = JSON.parse(fs.readFileSync(file, 'utf8'))
    return p && p.app === 'speech-training-coach' && p.kind === 'preset' ? p : null
  } catch (e) { return null }
}

// 1. Najnowszy plik ustawień z Pobranych
let best = null
try {
  for (const name of fs.readdirSync(downloads)) {
    if (!/^preset.*\.json$/i.test(name)) continue
    const file = path.join(downloads, name)
    const p = readPreset(file)
    if (p && (!best || new Date(p.savedAt) > new Date(best.p.savedAt))) best = { file, p }
  }
} catch (e) { /* brak dostępu do Pobranych — pomijamy */ }

const current = readPreset(target)
if (best && (!current || new Date(best.p.savedAt) > new Date(current.savedAt))) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(best.p, null, 2))
  // posprzątaj Pobrane, żeby stary plik nie wrócił przy następnym wysyłaniu
  for (const name of fs.readdirSync(downloads)) {
    if (/^preset.*\.json$/i.test(name) && readPreset(path.join(downloads, name))) fs.rmSync(path.join(downloads, name))
  }
  console.log(`✔ Ustawienia z Pobranych (${new Date(best.p.savedAt).toLocaleString('pl-PL')}) przeniesione do aplikacji.`)
} else if (current) {
  console.log(`• Ustawienia w aplikacji: ${new Date(current.savedAt).toLocaleString('pl-PL')} (w Pobranych nie ma nowszych).`)
}

// 2. Wysyłka na GitHub
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' })
run('git add -A')
let changed = true
try { execSync('git diff --cached --quiet', { cwd: root }) ; changed = false } catch (e) { changed = true }
if (changed) run('git commit -m "Aktualizacja ustawien"')
else console.log('• Nowych zmian brak — sprawdzam tylko, czy wszystko jest już na GitHubie.')
try {
  run('git push')   // wypycha też to, czego poprzednim razem nie udało się wysłać
  console.log('✔ Gotowe. Za ok. minutę telefon i tablet wczytają nowe ustawienia przy następnym otwarciu aplikacji.')
} catch (e) {
  console.log('✘ Nie udało się wysłać na GitHub (brak internetu albo logowania). Zmiany są zapisane — uruchom „npm run wyslij” jeszcze raz.')
  process.exitCode = 1
}
