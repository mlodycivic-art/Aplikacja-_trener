// Baza wzorców mikrofonu — nagrania Karolka "błędnie / poprawnie", oceniane przez logopedę.
//
// Z zaakceptowanych nagrań wyliczamy OSOBISTY próg: wartość pomiaru szumu (Hz), poniżej
// której głoskę uznajemy za szumiącą (sz, cz), a powyżej — za syczącą (s, c).
// Próg dotyczy tego urządzenia: inny mikrofon = inna baza.
//
// Opisy nagrań (słowo, pomiar, decyzja) leżą w localStorage i wchodzą do kopii zapasowej.
// Sam dźwięk leży w IndexedDB przeglądarki (za duży na localStorage) i do kopii NIE wchodzi.

import { useEffect, useState, useCallback } from 'react'

const KEY = 'stc_sz_patterns'
const THRESHOLD_KEY = 'stc_sz_threshold'
const EVENT = 'stc-patterns-changed'
const DB_NAME = 'stc_audio'
const STORE = 'patterns'
export const MIN_APPROVED_PER_SIDE = 3   // tyle zaakceptowanych nagrań z każdej strony, żeby liczyć próg
export const MIN_GAP_HZ = 400            // minimalny odstęp między stronami, żeby próg uznać za pewny

// ── Opisy nagrań ─────────────────────────────────────────────────────────────
// { id, ts, pair: 'socek|soczek', word, side: 'wrong'|'right', value (Hz|null), segments, status: 'pending'|'approved'|'rejected' }
export function readPatterns() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch (e) { return [] }
}

function writePatterns(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr)) } catch (e) {}
  saveThreshold(computeThreshold(arr))
  window.dispatchEvent(new Event(EVENT))
}

export function addPattern(p) {
  const entry = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), status: 'pending', ...p }
  writePatterns([...readPatterns(), entry])
  return entry
}

export function setPatternStatus(id, status) {
  writePatterns(readPatterns().map(p => (p.id === id ? { ...p, status } : p)))
}

export function removePattern(id) {
  writePatterns(readPatterns().filter(p => p.id !== id))
  deleteAudio(id)
}

export function usePatterns() {
  const [items, setItems] = useState(readPatterns)
  useEffect(() => {
    const refresh = () => setItems(readPatterns())
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('storage', refresh) }
  }, [])
  return items
}

// ── Próg ─────────────────────────────────────────────────────────────────────
// Liczymy tylko z nagrań ZAAKCEPTOWANYCH przez logopedę i z pomiarem (value != null).
// "right" = poprawnie (głoska szumiąca, pomiar nisko), "wrong" = błędnie (sycząca, pomiar wysoko).
export function computeThreshold(patterns) {
  const ok = patterns.filter(p => p.status === 'approved' && p.value != null)
  const right = ok.filter(p => p.side === 'right').map(p => p.value)
  const wrong = ok.filter(p => p.side === 'wrong').map(p => p.value)
  const base = { nRight: right.length, nWrong: wrong.length, hz: null, gap: null, quality: 'none' }
  if (right.length < MIN_APPROVED_PER_SIDE || wrong.length < MIN_APPROVED_PER_SIDE) return base
  const maxRight = Math.max(...right)
  const minWrong = Math.min(...wrong)
  const gap = Math.round(minWrong - maxRight)
  if (gap <= 0) return { ...base, gap, quality: 'overlap' }   // nagrania się nakładają — progu nie da się wyznaczyć
  return { ...base, hz: Math.round((maxRight + minWrong) / 2), gap, quality: gap >= MIN_GAP_HZ ? 'good' : 'narrow' }
}

function saveThreshold(t) {
  try {
    if (t.hz == null) localStorage.removeItem(THRESHOLD_KEY)
    else localStorage.setItem(THRESHOLD_KEY, JSON.stringify({ ...t, date: new Date().toISOString(), device: navigator.userAgent }))
  } catch (e) {}
}

// Próg zapisany dla tego urządzenia albo null. Tylko jakość 'good' nadaje się do oceniania.
export function getThreshold() {
  try {
    const t = JSON.parse(localStorage.getItem(THRESHOLD_KEY) || 'null')
    return t && typeof t.hz === 'number' ? t : null
  } catch (e) { return null }
}

// Ocena pojedynczego pomiaru względem progu: 'sz' (szumiąca) | 's' (sycząca) | null (nie wiadomo).
// Pomiary bliżej progu niż 1/4 odstępu zostawiamy bez oceny — lepiej nie ocenić niż ocenić źle.
export function classifyValue(value, threshold = getThreshold()) {
  if (value == null || !threshold || threshold.quality !== 'good') return null
  const dead = threshold.gap / 4
  if (value <= threshold.hz - dead) return 'sz'
  if (value >= threshold.hz + dead) return 's'
  return null
}

// ── Dźwięk w IndexedDB ───────────────────────────────────────────────────────
function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    } catch (e) { reject(e) }
  })
}

export async function saveAudio(id, blob) {
  if (!blob) return false
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blob, id)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    return true
  } catch (e) { return false }
}

export async function loadAudio(id) {
  try {
    const db = await openDb()
    const blob = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return blob
  } catch (e) { return null }
}

export async function deleteAudio(id) {
  try {
    const db = await openDb()
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = resolve
      tx.onerror = resolve
    })
    db.close()
  } catch (e) {}
}

export function usePlayPattern() {
  return useCallback(async (id) => {
    const blob = await loadAudio(id)
    if (!blob) return false
    try {
      const url = URL.createObjectURL(blob)
      const a = new Audio(url)
      a.onended = () => URL.revokeObjectURL(url)
      await a.play()
      return true
    } catch (e) { return false }
  }, [])
}
