// npm run lektor — sprawdza na tym Macu, które słowa/sylaby polski lektor LITERUJE („ysz” → „igrek es zet”)
// zamiast przeczytać, i dobiera dla nich zapis, który czyta poprawnie. Wynik: src/data/spokenForms.json
// (aplikacja pokazuje dalej zwykłe słowo, a lektorowi podaje zapis z tego pliku).
//
// Jak to działa: lektor systemowy (ten sam, którego używa Safari) nagrywa słowo do pliku; jeśli nagranie
// jest prawie tak długie jak celowo przeliterowane słowo, to znaczy, że lektor je literuje.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.join(root, 'src', 'data', 'spokenForms.json')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lektor-'))

if (process.platform !== 'darwin') { console.log('Ten test działa tylko na Macu (używa systemowego lektora).'); process.exit(0) }

// Polski głos
let voice = null
try {
  const list = execFileSync('say', ['-v', '?'], { encoding: 'utf8' }).split('\n').filter(l => /pl_PL/.test(l))
  const names = list.map(l => l.split(/\s{2,}|\s+pl_PL/)[0].trim())
  voice = names.find(n => /^Zosia/.test(n)) || names[0] || null
} catch (e) {}
if (!voice) { console.log('Nie znalazłem polskiego głosu w systemie (Ustawienia → Dostępność → Zawartość mówiona).'); process.exit(1) }
console.log(`Lektor: ${voice}`)

let n = 0
function seconds(text) {
  const f = path.join(tmp, `w${n++}.wav`)
  execFileSync('say', ['-v', voice, '-o', f, '--data-format=LEI16@22050', text])
  const sec = Math.max(0, fs.statSync(f).size - 4096) / 44100
  fs.rmSync(f, { force: true })
  return sec
}

// Słowa: z zestawów w kodzie + z zapisanych ustawień domyślnych (jeśli są)
const words = new Set()
const add = (str) => String(str || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).forEach(w => words.add(w))
const src = fs.readFileSync(path.join(root, 'src', 'data', 'defaultData.js'), 'utf8')
const block = src.match(/SZ_LIP_WORD_SETS = \[([\s\S]*?)\n\]/)
if (block) for (const m of block[1].matchAll(/'([^']*)'/g)) add(m[1])
try {
  const preset = JSON.parse(fs.readFileSync(path.join(root, 'public', 'preset.json'), 'utf8'))
  for (const ex of JSON.parse(preset.data.stc_exercises)) {
    if (ex.module !== 'sz_lip') continue
    add(ex.params?.words)
    for (const s of ex.params?.wordSets || []) add(typeof s === 'string' ? s : s?.words)
  }
} catch (e) {}

const VOWELS = 'aeiouyąęó'
const variants = (w) => {
  const i = [...w].findIndex(c => VOWELS.includes(c))
  const longV = i >= 0 ? w.slice(0, i + 1) + w[i] + w.slice(i + 1) : null
  const cap = w[0].toUpperCase() + w.slice(1)
  return [`${w}.`, `${cap}.`, `${w}!`, cap, longV, longV && `${longV}.`].filter(Boolean)
}
// Wzorzec „przeliterowane”: litery oddzielone spacją (bez przecinków — te dodają długie pauzy i fałszują porównanie)
const spelled = (w) => [...w].join(' ')
const report = []
const refCache = {}
const ratio = (w, text) => {
  const ref = refCache[w] ?? (refCache[w] = seconds(spelled(w)))
  const sec = seconds(text)
  report.push({ slowo: w, zapis: text, sek: +sec.toFixed(2), literowane_sek: +ref.toFixed(2), stosunek: +(sec / ref).toFixed(2) })
  return sec / ref
}
// Pomiar na iMacu (Zosia): zwykłe słowo trwa ok. 0,1–0,19 s na literę, literowane „ysz” — 0,35 s na literę.
// Samo porównanie z wzorcem „y s z” myliło się przy krótkich sylabach, więc decyduje czas na literę.
const isSpelledOut = (w, text) => { ratio(w, text); const sec = report[report.length - 1].sek; return sec > 0.22 * [...w].length + 0.15 }

const result = {}
const failed = []
let checked = 0
for (const w of [...words].sort()) {
  if (/\s/.test(w) || w.length > 9) continue      // literowane bywają tylko krótkie sylaby
  checked++
  process.stdout.write(`\r  sprawdzam ${checked}: ${w}            `)
  if (!isSpelledOut(w, w)) continue
  process.stdout.write('\r')
  const fix = variants(w).find(v => !isSpelledOut(w, v))
  if (fix) { result[w] = fix; console.log(`  „${w}” było literowane → lektor dostanie „${fix}”`) }
  else { failed.push(w); console.log(`  „${w}” jest literowane i nie znalazłem zapisu, który to naprawia`) }
}
process.stdout.write('\r                                        \r')
fs.rmSync(tmp, { recursive: true, force: true })
fs.writeFileSync(path.join(root, 'scripts', 'lektor-raport.json'), JSON.stringify(report, null, 1))
fs.writeFileSync(outFile, JSON.stringify({ ...result, __nierozwiazane: failed.length ? failed : undefined }, null, 2) + '\n')
console.log(`\nSprawdzone: ${checked} słów. Poprawione: ${Object.keys(result).length}. Bez rozwiązania: ${failed.length}.`)
console.log('Wynik zapisany w src/data/spokenForms.json. Teraz: npm run wyslij')
