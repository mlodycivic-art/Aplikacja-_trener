import { useState } from 'react'
import { DEFAULT_USER, DEFAULT_EXERCISES, generateTodayPlan } from '../data/defaultData'

const DIAGNOSED_PROBLEMS = [
  { value: '', label: '— wybierz problem —' },
  { value: 'articulatory_difficulties', label: 'Trudności artykulacyjne u dzieci' },
  { value: 'weak_tongue_motor', label: 'Słaba motoryka języka' },
  { value: 'low_muscle_tone', label: 'Obniżone napięcie mięśniowe aparatu mowy' },
  { value: 'wrong_tongue_position', label: 'Nieprawidłowa pozycja spoczynkowa języka' },
  { value: 'tempo_rhythm', label: 'Problem z tempem i rytmem mowy' },
  { value: 'no_automatization', label: 'Brak automatyzacji poprawnego wzorca mowy' },
  { value: 'aphasia', label: 'Afazja / trudności neurologiczne z mową' },
  { value: 'post_accident', label: 'Osoby po wypadkach / urazach' },
  { value: 'post_stroke', label: 'Osoby po udarach' },
  { value: 'coordination_disorders', label: 'Zaburzenia koordynacji języka, ust i twarzy' },
  { value: 'motivation_regularity', label: 'Problemy z motywacją i regularnością ćwiczeń' },
  { value: 'face_fitness', label: 'Dbanie o wygląd twarzy / face fitness' },
]

export default function ProfileScreen({ user, setUser, setPlan, setExercises }) {
  const [form, setForm]   = useState(user)
  const [saved, setSaved] = useState(false)

  const save = () => {
    setUser(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const reset = () => {
    if (!window.confirm('Czy na pewno chcesz zresetować wszystkie dane demo? Tego nie można cofnąć.')) return
    try { window.speechSynthesis?.cancel() } catch (e) {}
    localStorage.clear()
    setUser({ ...DEFAULT_USER })
    setForm({ ...DEFAULT_USER })
    if (setExercises) setExercises([...DEFAULT_EXERCISES])
    setPlan(generateTodayPlan(DEFAULT_EXERCISES))
  }

  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <div>
      <p className="section-title">👤 Profil użytkownika</p>
      <p className="section-sub">Dane i ustawienia konta</p>

      <div className="card">
        <label className="form-label">Imię</label>
        <input className="form-input" value={form.name} onChange={f('name')} placeholder="Imię użytkownika..." />

        <label className="form-label">Wiek</label>
        <input className="form-input" type="number" value={form.age} onChange={f('age')} min={3} max={99} />

        <label className="form-label">Typ profilu</label>
        <div className="type-selector">
          {['child', 'teen', 'adult'].map(t => (
            <button
              key={t}
              className={`type-btn ${form.type === t ? 'active' : ''}`}
              onClick={() => setForm(prev => ({ ...prev, type: t }))}
            >
              {{ child: '🧒 Dziecko', teen: '🧑 Nastolatek', adult: '👨 Dorosły' }[t]}
            </button>
          ))}
        </div>

        <label className="form-label">Zdiagnozowany problem</label>
        <select
          className="form-input"
          value={form.diagnosedProblem || ''}
          onChange={f('diagnosedProblem')}
          style={{ appearance: 'auto' }}
        >
          {DIAGNOSED_PROBLEMS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        <label className="form-label">Cel treningowy</label>
        <input className="form-input" value={form.goal} onChange={f('goal')} placeholder="np. Poprawa wymowy głoski sz..." />

        <button className="btn btn-primary btn-full" onClick={save}>
          {saved ? '✓ Zapisano!' : 'Zapisz profil'}
        </button>
      </div>

      {/* Stats summary */}
      <div className="card">
        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>📈 Twoje statystyki</h3>
        <div className="row-list-item">
          <span className="rli-label">Punkty łącznie</span>
          <span className="rli-val">🏆 {user.points} pkt</span>
        </div>
        <div className="row-list-item">
          <span className="rli-label">Odznaki</span>
          <span className="rli-val">🎖 {(user.badges || []).length}</span>
        </div>
        <div className="row-list-item" style={{ borderBottom: 'none' }}>
          <span className="rli-label">Konto od</span>
          <span className="rli-val">{new Date(user.createdAt).toLocaleDateString('pl-PL')}</span>
        </div>
      </div>

      {/* Reset */}
      <div className="card" style={{ border: '1.5px solid #FEE2E2' }}>
        <h3 style={{ fontWeight: 800, marginBottom: 6, color: 'var(--red)' }}>⚠️ Strefa niebezpieczna</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Resetuje wszystkie dane i przywraca dane demonstracyjne. Tej operacji nie można cofnąć.
        </p>
        <button className="btn btn-full" style={{ background: '#FEF2F2', color: 'var(--red)', fontWeight: 800 }} onClick={reset}>
          🔄 Reset demo data
        </button>
      </div>
    </div>
  )
}
