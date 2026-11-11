// Skiny aplikacji: styl (jasny / ciemny charakter) + kolor akcentu wybierany osobno.
// Styl ustawia atrybut data-skin na <html> (zmienne w styles/main.css), akcent nadpisuje --primary.
// Wybór należy do ćwiczącego (ekran Postępy → Wygląd) i jest zapisany na tym urządzeniu.

const KEY = 'stc_theme'

export const SKINS = [
  { id: 'modern', name: 'Nowoczesny',    desc: 'Jasny, spokojny, czytelny',                 preview: ['#F3F4F6', '#FFFFFF', '#0F172A'], accent: 'indigo' },
  { id: 'future', name: 'Futurystyczny', desc: 'Ciemny, neonowe krawędzie',                 preview: ['#05070F', '#0E1525', '#22D3EE'], accent: 'cyan' },
  { id: 'arena',  name: 'Arena',         desc: 'Ciemny granat, sportowa energia',           preview: ['#0B1220', '#162238', '#F97316'], accent: 'orange' },
  { id: 'aurora', name: 'Aurora',        desc: 'Jasny z głębokim fioletem i mocnym różem',  preview: ['#F5F1FA', '#FFFFFF', '#3B0764'], accent: 'magenta' },
  { id: 'studio', name: 'Studio',        desc: 'Czarno-biały, dla nastolatków',             preview: ['#FAFAFA', '#FFFFFF', '#111111'], accent: 'lime' },
]

// Akcenty: pełne, niepastelowe. "on" = kolor tekstu na przycisku w tym akcencie.
export const ACCENTS = [
  { id: 'indigo',  name: 'Indygo',     hex: '#4F46E5', on: '#FFFFFF' },
  { id: 'blue',    name: 'Niebieski',  hex: '#2563EB', on: '#FFFFFF' },
  { id: 'cyan',    name: 'Cyjan',      hex: '#06B6D4', on: '#06202A' },
  { id: 'green',   name: 'Zielony',    hex: '#16A34A', on: '#FFFFFF' },
  { id: 'lime',    name: 'Limonka',    hex: '#84CC16', on: '#16240A' },
  { id: 'orange',  name: 'Pomarańcz',  hex: '#F97316', on: '#2A1200' },
  { id: 'red',     name: 'Czerwony',   hex: '#DC2626', on: '#FFFFFF' },
  { id: 'magenta', name: 'Magenta',    hex: '#DB2777', on: '#FFFFFF' },
  { id: 'violet',  name: 'Fiolet',     hex: '#7C3AED', on: '#FFFFFF' },
]

export function getTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null')
    const skin = SKINS.find(s => s.id === t?.skin) || SKINS[0]
    const accent = ACCENTS.find(a => a.id === t?.accent) || ACCENTS.find(a => a.id === skin.accent)
    return { skin: skin.id, accent: accent.id }
  } catch (e) { return { skin: 'modern', accent: 'indigo' } }
}

export function applyTheme(theme = getTheme()) {
  const root = document.documentElement
  const accent = ACCENTS.find(a => a.id === theme.accent) || ACCENTS[0]
  root.setAttribute('data-skin', theme.skin)
  root.style.setProperty('--primary', accent.hex)
  root.style.setProperty('--primary2', accent.hex)
  root.style.setProperty('--on-primary', accent.on)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--ink').trim() || '#0F172A')
}

export function saveTheme(theme) {
  try { localStorage.setItem(KEY, JSON.stringify(theme)) } catch (e) {}
  applyTheme(theme)
}
