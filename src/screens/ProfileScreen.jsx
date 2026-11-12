import { useEffect, useState } from 'react'
import { savePreset, fetchPreset, applyPreset, appliedPresetDate } from '../data/presets'
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

const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) } catch (e) { return '—' } }

// Ustawienia domyślne: zapis ustawień tego urządzenia do pliku w aplikacji i wczytanie ich na innym urządzeniu
function PresetCard() {
  const [inApp, setInApp] = useState(undefined)      // undefined = sprawdzam, null = brak pliku
  const [msg, setMsg] = useState(null)
  const applied = appliedPresetDate()
  useEffect(() => { let on = true; fetchPreset().then(p => { if (on) setInApp(p) }); return () => { on = false } }, [])

  const save = async () => {
    const how = await savePreset()
    setMsg(how)
    if (how === 'saved') fetchPreset().then(setInApp)
  }
  const load = () => {
    if (!inApp) return
    if (!window.confirm('Wczytać ustawienia domyślne? Zastąpią ćwiczenia, godziny, listę słów i wygląd na tym urządzeniu. Wyniki i kalibracje zostają. Dzisiejszy plan zbuduje się od nowa.')) return
    if (applyPreset(inApp)) window.location.reload()
  }
  const newer = inApp && inApp.savedAt !== applied

  return (
    <div className="card" data-card="preset">
      <h3 style={{ fontWeight: 800, marginBottom: 6 }}>Ustawienia domyślne</h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Ustaw aplikację na jednym urządzeniu i zapisz ustawienia do pliku w aplikacji. Każde nowe urządzenie zacznie od nich samo,
        a na używanym wczytasz je tym przyciskiem. Przenoszą się: ćwiczenia z godzinami, lista słów, wygląd, imię, wiek i cel.
        Nie przenoszą się: wyniki, punkty, „zdiagnozowany problem” i kalibracje.
      </p>
      <div className="row-list-item">
        <span className="rli-label">W aplikacji</span>
        <span className="rli-val" data-preset="inapp">{inApp === undefined ? 'sprawdzam…' : inApp ? fmtDate(inApp.savedAt) : 'brak pliku'}</span>
      </div>
      <div className="row-list-item" style={{ borderBottom: 'none', marginBottom: 10 }}>
        <span className="rli-label">Na tym urządzeniu</span>
        <span className="rli-val" data-preset="applied">{applied ? (newer ? `starsze (${fmtDate(applied)})` : 'aktualne') : 'nie wczytywano'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} data-act="preset-save">Zapisz jako ustawienia domyślne</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} disabled={!inApp} onClick={load} data-act="preset-load">Wczytaj ustawienia domyślne</button>
      </div>
      {msg === 'saved' && (
        <div style={{ fontSize: 13, marginTop: 10, lineHeight: 1.6 }} data-preset-msg="saved">
          <b style={{ color: 'var(--green)' }}>Zapisano w folderze aplikacji</b> (public/preset.json). Żeby trafiło na inne urządzenia, wyślij na GitHub:
          <pre style={{ fontSize: 12, background: 'var(--soft)', padding: 10, borderRadius: 10, marginTop: 6, overflowX: 'auto' }}>{'cd ~/Desktop/Karolek-mowa\ngit add -A\ngit commit -m "Ustawienia domyslne"\ngit push'}</pre>
        </div>
      )}
      {msg === 'downloaded' && (
        <div style={{ fontSize: 13, marginTop: 10, lineHeight: 1.6 }} data-preset-msg="downloaded">
          <b>Plik preset.json został pobrany.</b> Żeby stał się ustawieniami domyślnymi, musi trafić do folderu <b>public</b> w aplikacji
          na komputerze i pójść na GitHub. Najprościej zapisywać ustawienia na komputerze, na którym działa „npm run dev”: tam zapis jest automatyczny.
        </div>
      )}
    </div>
  )
}

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
      <p className="section-title">Profil użytkownika</p>
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
              {{ child: 'Dziecko', teen: 'Nastolatek', adult: 'Dorosły' }[t]}
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

      <PresetCard />

      {/* Stats summary */}
      <div className="card">
        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Twoje statystyki</h3>
        <div className="row-list-item">
          <span className="rli-label">Punkty łącznie</span>
          <span className="rli-val">{user.points} pkt</span>
        </div>
        <div className="row-list-item">
          <span className="rli-label">Odznaki</span>
          <span className="rli-val">{(user.badges || []).length}</span>
        </div>
        <div className="row-list-item" style={{ borderBottom: 'none' }}>
          <span className="rli-label">Konto od</span>
          <span className="rli-val">{new Date(user.createdAt).toLocaleDateString('pl-PL')}</span>
        </div>
      </div>

      {/* Reset */}
      <div className="card" style={{ border: '1.5px solid #FEE2E2' }}>
        <h3 style={{ fontWeight: 800, marginBottom: 6, color: 'var(--red)' }}>Strefa niebezpieczna</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Resetuje wszystkie dane i przywraca dane demonstracyjne. Tej operacji nie można cofnąć.
        </p>
        <button className="btn btn-full" style={{ background: '#FEF2F2', color: 'var(--red)', fontWeight: 800 }} onClick={reset}>
          Reset demo data
        </button>
      </div>
    </div>
  )
}
