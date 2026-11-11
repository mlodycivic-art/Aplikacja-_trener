import { useState } from 'react'

// Wejście do strefy dorosłego. PIN testowy — WYŁĄCZNIE na potrzeby wersji deweloperskiej
// (ten sam co hasło logopedy w kalibracji). W wersji produkcyjnej zastąpić kontem / własnym PIN-em.
export const ADULT_PIN_TEST = '1234'

export default function PinGate({ onUnlock, onClose }) {
  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')

  const submit = (value) => {
    if (value === ADULT_PIN_TEST) { onUnlock(); return }
    setError('Nieprawidłowy PIN.')
    setPin('')
  }

  const handleChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(v)
    setError('')
    if (v.length === 4) submit(v)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Strefa dorosłego</h3>
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>
          Trener, kalibracja, raporty i ustawienia. Podaj PIN.
        </p>
        <input className="pin-input" type="password" inputMode="numeric" autoFocus
          autoComplete="off" aria-label="PIN" value={pin} onChange={handleChange} />
        {error && <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{error}</div>}
        <button className="btn btn-ghost btn-full" onClick={onClose}>Anuluj</button>
      </div>
    </div>
  )
}
