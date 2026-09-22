import { useState } from 'react'
import { useStorage } from '../hooks/useStorage'
import VisionWizard from './vision/VisionWizard'
import { AGE_GROUPS } from './vision/ageProfiles'

// Hasło testowe logopedy — WYŁĄCZNIE na potrzeby wersji deweloperskiej.
// W wersji produkcyjnej zastąpić kontem logopedy / PIN-em / kodem sesji.
const THERAPIST_PASSWORD_TEST = '1234'

// ── Walidacja pola "Słowo do kalibracji" ──────────────────────────────────────
function validateWord(raw) {
  const word = raw || ''
  if (word.trim().length === 0) return 'Wpisz słowo do kalibracji.'
  if (/\s/.test(word)) return 'Wpisz tylko jedno słowo bez spacji.'
  if (word.length > 15) return 'Słowo może mieć maksymalnie 15 znaków.'
  if (/[,;.!?]/.test(word)) return 'Pole może zawierać tylko jedno słowo.'
  return null
}

export default function VisionCalibrationScreen({ exercises }) {
  // Profile kalibracyjne per ćwiczenie — { [exerciseId]: { status, word, date, ageGroup } }
  const [calibrations, setCalibrations] = useStorage('stc_vision_calibrations', {})

  const [passwordInput, setPasswordInput] = useState('')
  const [isTherapist,   setIsTherapist]   = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const [selectedId, setSelectedId] = useState('')
  const [word,       setWord]       = useState('')
  const [wordError,  setWordError]  = useState('')
  const [ageGroup,   setAgeGroup]   = useState('child')
  const [wizardStep, setWizardStep] = useState('idle') // 'idle' | 'running'

  const visionExercises  = (exercises || []).filter(ex => ex.visionEnabled)
  const calibratedList   = visionExercises.filter(ex => calibrations[ex.id]?.status === 'calibrated')
  const uncalibratedList = visionExercises.filter(ex => calibrations[ex.id]?.status !== 'calibrated')

  const selectedEx  = visionExercises.find(ex => ex.id === selectedId)
  const calibration = selectedEx ? calibrations[selectedEx.id] : null
  const selectedIsCalibrated = calibration?.status === 'calibrated'

  const handleSelectExercise = (id) => {
    setSelectedId(id)
    setWord('')
    setWordError('')
    setPasswordInput('')
    setPasswordError('')
  }

  const handleBackToList = () => {
    setSelectedId('')
    setWord('')
    setWordError('')
  }

  const checkPassword = () => {
    if (passwordInput === THERAPIST_PASSWORD_TEST) {
      setIsTherapist(true)
      setPasswordError('')
    } else {
      setPasswordError('Nieprawidłowe hasło logopedy.')
    }
  }

  const handleWordChange = (val) => {
    setWord(val)
    setWordError('')
  }

  const canStart = isTherapist && !!selectedEx && !validateWord(word)

  const handleStart = () => {
    const err = validateWord(word)
    if (err) { setWordError(err); return }
    if (!selectedEx) return
    setWizardStep('running')
  }

  const handleWizardCancel = () => {
    setWizardStep('idle')
  }

  // Wywoływane po zaakceptowaniu Kroku 3 — cała kalibracja zakończona sukcesem.
  const handleWizardComplete = () => {
    if (selectedEx) {
      setCalibrations(prev => ({
        ...prev,
        [selectedEx.id]: {
          status: 'calibrated',
          word,
          ageGroup,
          date: new Date().toISOString(),
        },
      }))
    }
    setWizardStep('idle')
    handleBackToList()
  }

  // ── Ekran w trakcie kalibracji (Kroki 0-3) ──────────────────────────────────
  if (wizardStep === 'running') {
    return (
      <div>
        <p className="section-title">📷 Kalibracja systemu wizyjnego i mikrofonowego</p>
        <VisionWizard
          onCancel={handleWizardCancel}
          onComplete={handleWizardComplete}
          ageGroupId={ageGroup}
        />
      </div>
    )
  }

  return (
    <div>
      <p className="section-title">📷 Kalibracja systemu wizyjnego i mikrofonowego</p>
      <p className="section-sub" style={{ marginBottom: 12 }}>
        Kalibracja ćwiczeń korzystających z kamery i mikrofonu — wykonuje ją wyłącznie logopeda.
      </p>

      {!selectedId && (
        <>
          {visionExercises.length === 0 ? (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Żadne ćwiczenie nie ma jeszcze włączonego systemu wizyjnego. Włącz opcję „System wizyjny”
                dla wybranego ćwiczenia w zakładce Trener.
              </div>
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                <label className="form-label">Skalibrowane</label>
                {calibratedList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Brak.</div>
                ) : (
                  calibratedList.map(ex => (
                    <button
                      key={ex.id}
                      onClick={() => handleSelectExercise(ex.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', padding: '10px 12px', marginBottom: 8, borderRadius: 10,
                        border: '1.5px solid #BBF7D0', background: '#F0FDF4', cursor: 'pointer',
                        fontSize: 13, fontWeight: 700,
                      }}
                    >
                      <span>{ex.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--green)' }}>✓ Skalibrowano</span>
                    </button>
                  ))
                )}
              </div>

              <div className="card" style={{ marginBottom: 12 }}>
                <label className="form-label">Nieskalibrowane</label>
                {uncalibratedList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Brak — wszystko skalibrowane.</div>
                ) : (
                  uncalibratedList.map(ex => (
                    <button
                      key={ex.id}
                      onClick={() => handleSelectExercise(ex.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', padding: '10px 12px', marginBottom: 8, borderRadius: 10,
                        border: '1.5px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer',
                        fontSize: 13, fontWeight: 700,
                      }}
                    >
                      <span>{ex.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Nie skalibrowano</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}

      {selectedId && selectedIsCalibrated && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 14 }}>{selectedEx.name}</span>
            <span style={{
              fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 999,
              background: '#DCFCE7', color: 'var(--green)',
            }}>
              Skalibrowano przez logopedę
            </span>
          </div>
          {calibration?.word && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              Słowo kalibracyjne: „{calibration.word}”
            </div>
          )}
          {calibration?.ageGroup && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              Grupa wiekowa: {AGE_GROUPS.find(g => g.id === calibration.ageGroup)?.label || calibration.ageGroup}
            </div>
          )}
          {calibration?.date && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              Data: {new Date(calibration.date).toLocaleString('pl-PL')}
            </div>
          )}
          <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={handleBackToList}>
            Wróć do listy
          </button>
        </div>
      )}

      {selectedId && !selectedIsCalibrated && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{selectedEx.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Status: Nie skalibrowano</div>
          </div>

          {!isTherapist ? (
            <div className="card" style={{ marginBottom: 12 }}>
              <label className="form-label">Hasło logopedy</label>
              <input
                className="form-input"
                type="password"
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordError('') }}
                onKeyDown={e => { if (e.key === 'Enter') checkPassword() }}
                placeholder="Wpisz hasło"
              />
              {passwordError && (
                <div style={{ color: 'var(--red)', fontSize: 12, marginTop: -8, marginBottom: 10 }}>
                  {passwordError}
                </div>
              )}
              <button className="btn btn-primary btn-full" onClick={checkPassword}>
                Zaloguj jako logopeda
              </button>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                Rozpoczęcie, zatwierdzenie i zapis kalibracji wymaga dostępu logopedy.
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 12 }}>
              <label className="form-label">Grupa wiekowa</label>
              <select
                className="form-input"
                style={{ appearance: 'auto', marginBottom: 12 }}
                value={ageGroup}
                onChange={e => setAgeGroup(e.target.value)}
              >
                {AGE_GROUPS.map(g => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
                Dobiera zestaw progów wykrywania dopasowany do proporcji twarzy w danym wieku.
              </div>

              <label className="form-label">Słowo do kalibracji</label>
              <input
                className="form-input"
                value={word}
                onChange={e => handleWordChange(e.target.value)}
                placeholder="np. szafa"
                maxLength={20}
              />
              {wordError && (
                <div style={{ color: 'var(--red)', fontSize: 12, marginTop: -8, marginBottom: 10 }}>
                  {wordError}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6, marginBottom: 12 }}>
                Jedno słowo, bez spacji, maksymalnie 15 znaków (np. sza, szafa, koszyk).
              </div>

              <button
                className={`btn btn-full ${canStart ? 'btn-primary' : 'btn-ghost'}`}
                disabled={!canStart}
                onClick={handleStart}
              >
                Rozpocznij kalibrację
              </button>
            </div>
          )}

          <button className="btn btn-ghost btn-full" onClick={handleBackToList}>
            Wróć do listy
          </button>
        </>
      )}
    </div>
  )
}
