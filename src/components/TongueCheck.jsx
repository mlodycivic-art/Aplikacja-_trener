// "Gdzie jest język?" — krótkie, losowe sprawdzenia pozycji spoczynkowej w ciągu dnia.
//
// Po co: pozycja spoczynkowa języka to nawyk na cały dzień, a nie na 2 minuty ćwiczenia.
// Pytanie uczy dziecko ZAUWAŻAĆ, gdzie ma język; odpowiedzi trafiają do magazynu wyników
// i rodzic widzi je w panelu.
//
// Ograniczenie: działa tylko, gdy aplikacja jest otwarta na ekranie.

import { useEffect, useState } from 'react'
import { addResult } from '../data/resultsStore'

const NEXT_KEY = 'stc_tongue_next'
export const TONGUE_CHECK_ENABLED_KEY = 'stc_tongue_check_on'
const DAY_START_H = 8
const DAY_END_H   = 20
const MIN_GAP_MIN = 40
const MAX_GAP_MIN = 90

const randomGapMs = (minMin, maxMin) => (minMin + Math.random() * (maxMin - minMin)) * 60000

function readNext() {
  try { return Number(localStorage.getItem(NEXT_KEY) || 0) } catch (e) { return 0 }
}
function scheduleNext(minMin = MIN_GAP_MIN, maxMin = MAX_GAP_MIN) {
  try { localStorage.setItem(NEXT_KEY, String(Date.now() + randomGapMs(minMin, maxMin))) } catch (e) {}
}
export function isTongueCheckEnabled() {
  try { return localStorage.getItem(TONGUE_CHECK_ENABLED_KEY) !== '0' } catch (e) { return true }
}

export default function TongueCheck({ active, onAnswer }) {
  const [open, setOpen]     = useState(false)
  const [answer, setAnswer] = useState(null)

  useEffect(() => {
    if (!readNext()) scheduleNext(10, 30)   // pierwsze pytanie 10–30 min po pierwszym uruchomieniu
    const check = () => {
      if (!active || open || !isTongueCheckEnabled()) return
      const h = new Date().getHours()
      if (h < DAY_START_H || h >= DAY_END_H) return
      if (Date.now() >= readNext()) setOpen(true)
    }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [active, open])

  if (!open || !active) return null

  const close = () => { setOpen(false); setAnswer(null); scheduleNext() }

  const choose = (position) => {
    addResult('tongue_check', { position })
    if (onAnswer) onAnswer(position)   // punkt za samą odpowiedź, niezależnie od treści
    setAnswer(position)
    setTimeout(close, position === 'up' ? 1400 : 3200)
  }

  return (
    <div role="dialog" aria-label="Gdzie jest język" style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 84, zIndex: 150,
      width: 'calc(100% - 24px)', maxWidth: 'calc(var(--app-width) - 24px)',
      background: 'var(--ink)', color: '#fff', borderRadius: 18, padding: 16, boxShadow: 'var(--shadow)',
    }}>
      {answer == null ? (<>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Gdzie jest teraz Twój język?</div>
          <button onClick={close} aria-label="Zamknij" style={{ background: 'none', color: '#94A3B8', fontSize: 18, fontWeight: 800, padding: 4 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1, background: 'var(--green)', color: '#fff' }} onClick={() => choose('up')}>U góry</button>
          <button className="btn" style={{ flex: 1, background: 'var(--yellow)', color: '#451A03' }} onClick={() => choose('mid')}>Pośrodku</button>
          <button className="btn" style={{ flex: 1, background: 'var(--red)', color: '#fff' }} onClick={() => choose('down')}>Na dole</button>
        </div>
      </>) : answer === 'up' ? (
        <div style={{ fontWeight: 800, fontSize: 17 }}>Dobrze. Tak trzymaj.</div>
      ) : (
        <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.4 }}>
          Unieś język do podniebienia i zamknij usta. Dobrze, że to widzisz.
        </div>
      )}
    </div>
  )
}
