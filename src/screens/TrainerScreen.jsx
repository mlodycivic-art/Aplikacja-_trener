import { useState, useRef, useEffect } from 'react'
import { playSound } from '../components/useAlarm'
import { DEFAULT_SOUND_SETS, generateTodayPlan } from '../data/defaultData'

const MODULE_LABELS = {
  tongue_position: '👅 Tongue Up Position',
  sz_lip:          '👄 SZ Lip Shape',
  speech_rhythm:   '🎵 Speech Rhythm',
  mechanical:      '⚙️ Mechanical Tongue Trainer',
  froggy_mouth:    '🐸 Froggy Mouth',
}

const DAYS_PL = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd']

const SOUND_OPTIONS = [
  { value: 'bell',      label: '🔔 Klasyczny dzwonek' },
  { value: 'phone',     label: '📞 Stary telefon' },
  { value: 'soft',      label: '🎵 Miękki ton' },
  { value: 'beep',      label: '🔊 Podwójne piknięcie' },
  { value: 'alarm',     label: '🚨 Głośny alarm' },
  { value: 'chime',     label: '🎐 Delikatny czime' },
  { value: 'siren',     label: '🚓 Syrena' },
  { value: 'xylophone', label: '🎶 Ksylofon' },
  { value: 'digital',   label: '📟 Cyfrowy puls' },
  { value: 'whistle',   label: '📢 Gwizdek' },
]

const ADVANCE_OPTIONS = [
  { value: 0,   label: 'Dokładnie o czasie' },
  { value: 30,  label: '30 sekund wcześniej' },
  { value: 60,  label: '1 minutę wcześniej' },
  { value: 120, label: '2 minuty wcześniej' },
  { value: 300, label: '5 minut wcześniej' },
  { value: 600, label: '10 minut wcześniej' },
]

// ── Poziomy trudności — etykiety zależne od głoski aktywnego zestawu ─────────
const LEVELS_WITH_LINES = ['short', 'medium', 'zsounds', 'harder', 'twisters']

function rhythmLevels(phoneme) {
  const p = phoneme || '?'
  return [
    { id: 'short',    label: 'Krótkie zdania' },
    { id: 'medium',   label: 'Zdania średniej długości' },
    { id: 'zsounds',  label: `Zdania z dużą liczbą głosek „${p}”` },
    { id: 'harder',   label: `Trudniejsze zdania logopedyczne z „${p}”` },
    { id: 'twisters', label: `Łamańce językowe z „${p}”` },
    { id: 'poem',     label: `Wierszyk z „${p}”` },
  ]
}

// ── Treść aktualnie wybranego zestawu + poziomu → tekst dla ćwiczenia ────────
function deriveSentences(p = {}) {
  const setId = p.activeSetId
  const level = p.activeLevel || 'short'
  if (!setId) return ''
  if (level === 'poem') return p[`content_${setId}_poem_text`] || ''
  const lines = p[`content_${setId}_${level}_lines`] || []
  return lines.filter(Boolean).join(' ')
}

// ── To samo, ale jako LISTA pojedynczych zdań (do odtwarzania zdanie po zdaniu) ──
function deriveSentenceList(p = {}) {
  const setId = p.activeSetId
  const level = p.activeLevel || 'short'
  if (!setId) return []
  if (level === 'poem') {
    const text = p[`content_${setId}_poem_text`] || ''
    return text.split('\n').map(s => s.trim()).filter(Boolean)
  }
  const lines = p[`content_${setId}_${level}_lines`] || []
  return lines.map(s => s.trim()).filter(Boolean)
}

// ── Szacowanie czasu odczytu wyrazu (ms) — ta sama logika co w ExerciseScreen ──
function estimateWordMs(word, rate = 1) {
  const len = (word || '').replace(/[.,!?]/g, '').length || 1
  const base = len * 110 + 150
  return base / Math.max(0.01, rate)
}

// ── Pole godziny HH:MM — czyści się po kliknięciu, bez przeskoków w trakcie wpisywania ──
function TimeInput({ value, onChange }) {
  const [hh, mm] = (value || '00:00').split(':')
  const [localH, setLocalH] = useState(hh)
  const [localM, setLocalM] = useState(mm)
  const hFocusedRef = useRef(false)
  const mFocusedRef = useRef(false)
  const minRef  = useRef(null)
  const hourRef = useRef(null)

  useEffect(() => { if (!hFocusedRef.current) setLocalH(hh) }, [hh])
  useEffect(() => { if (!mFocusedRef.current) setLocalM(mm) }, [mm])

  const inputStyle = {
    width: 64, padding: '11px 10px', borderRadius: 10,
    border: '2px solid var(--border)', fontSize: 20,
    fontFamily: "'Space Mono', monospace", fontWeight: 700,
    textAlign: 'center', outline: 'none', background: '#fff', color: 'var(--text)',
  }

  const commitHour = (raw) => {
    let n = parseInt(raw, 10)
    if (isNaN(n)) n = 0
    n = Math.min(23, Math.max(0, n))
    const formatted = String(n).padStart(2, '0')
    setLocalH(formatted)
    onChange(`${formatted}:${(localM || '00').padStart(2, '0')}`)
  }

  const commitMin = (raw) => {
    let n = parseInt(raw, 10)
    if (isNaN(n)) n = 0
    n = Math.min(59, Math.max(0, n))
    const formatted = String(n).padStart(2, '0')
    setLocalM(formatted)
    onChange(`${(localH || '00').padStart(2, '0')}:${formatted}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
      <input
        ref={hourRef}
        type="text"
        inputMode="numeric"
        value={localH}
        placeholder="HH"
        style={inputStyle}
        onFocus={() => { hFocusedRef.current = true; setLocalH('') }}
        onChange={e => setLocalH(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={e => { hFocusedRef.current = false; commitHour(e.target.value) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { commitHour(e.target.value); minRef.current?.focus() }
        }}
      />
      <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--muted)', lineHeight: 1 }}>:</span>
      <input
        ref={minRef}
        type="text"
        inputMode="numeric"
        value={localM}
        placeholder="MM"
        style={inputStyle}
        onFocus={() => { mFocusedRef.current = true; setLocalM('') }}
        onChange={e => setLocalM(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={e => { mFocusedRef.current = false; commitMin(e.target.value) }}
        onKeyDown={e => { if (e.key === 'Enter') commitMin(e.target.value) }}
      />
    </div>
  )
}

// ── Pole czasu dla slotów harmonogramu — niezależne pola HH i MM ──────────────
// Kliknięcie w pole → całość zaznaczona (łatwa zmiana wartości).
// Tab z godziny → przeskakuje do minut. Wyjście z pola → formatuje do 2 cyfr.
function SlotTimeInput({ value, onChange }) {
  const [h, m] = (value || '08:00').split(':')
  const [localH, setLocalH] = useState(h || '08')
  const [localM, setLocalM] = useState(m || '00')
  const minRef = useRef(null)

  useEffect(() => {
    const [nh, nm] = (value || '08:00').split(':')
    setLocalH(nh || '08')
    setLocalM(nm || '00')
  }, [value])

  const fieldStyle = {
    width: 36, padding: '7px 4px', textAlign: 'center',
    border: '2px solid var(--border)', borderRadius: 8,
    fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 14,
    background: '#fff', color: 'var(--text)', outline: 'none',
  }

  const commitH = (raw) => {
    let n = parseInt(raw, 10)
    if (isNaN(n)) n = 0
    n = Math.min(23, Math.max(0, n))
    const f = String(n).padStart(2, '0')
    setLocalH(f)
    onChange(`${f}:${(localM || '00').padStart(2, '0')}`)
  }
  const commitM = (raw) => {
    let n = parseInt(raw, 10)
    if (isNaN(n)) n = 0
    n = Math.min(59, Math.max(0, n))
    const f = String(n).padStart(2, '0')
    setLocalM(f)
    onChange(`${(localH || '00').padStart(2, '0')}:${f}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <input type="text" inputMode="numeric" value={localH}
        style={fieldStyle}
        placeholder="HH"
        onFocus={e => e.target.select()}
        onChange={e => setLocalH(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={e => commitH(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Tab' || e.key === ':') { e.preventDefault(); commitH(e.target.value); minRef.current?.focus() }
          if (e.key === 'Enter') { commitH(e.target.value); minRef.current?.focus() }
        }}
      />
      <span style={{ fontWeight: 900, color: 'var(--muted)', fontSize: 16 }}>:</span>
      <input ref={minRef} type="text" inputMode="numeric" value={localM}
        style={fieldStyle}
        placeholder="MM"
        onFocus={e => e.target.select()}
        onChange={e => setLocalM(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={e => commitM(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commitM(e.target.value) }}
      />
    </div>
  )
}

export default function TrainerScreen({ exercises, setExercises, plan, setPlan }) {
  const [selected, setSelected] = useState(null)
  const [form, setForm]         = useState({})
  const [saved, setSaved]       = useState(false)

  // Szablon ćwiczenia do edycji (szukamy w exercises, nie plan)
  const editEx = (exercises || []).find(e => e.id === selected)

  const openEdit = (ex) => {
    setSelected(ex.id)
    const params = { ...(ex.params || {}) }

    if (ex.module === 'speech_rhythm' && !params.soundSets) {
      params.soundSets   = DEFAULT_SOUND_SETS
      params.activeSetId = DEFAULT_SOUND_SETS[0].id
      params.activeLevel = params.activeLevel || 'short'
    }

    setForm({
      schedule:        ex.schedule || [],
      duration:        ex.duration,
      params,
      alarmEnabled:    ex.alarmEnabled ?? true,
      alarmAdvanceSec: ex.alarmAdvanceSec ?? 30,
      alarmSound:      ex.alarmSound ?? 'phone',
      visionEnabled:   ex.visionEnabled ?? false,
    })
  }

  const closeEdit = () => { setSelected(null); setForm({}) }

  // Szacowany czas treningu SZ Lip Shape (sekundy)
  const szTotalSec = (p = {}) => {
    const words = (p.words || 'sza,sze,szo,szu').split(',').map(w => w.trim()).filter(Boolean)
    const rate  = p.speechRate ?? 0.3
    const gap   = p.gapSec ?? 0.4
    const reps  = p.reps ?? 5
    const sum   = words.reduce((s, w) => s + estimateWordMs(w, rate) + gap * 1000, 0)
    return (sum * reps) / 1000
  }

  // Szacowany czas treningu Speech Rhythm (sekundy) — wizualizacja słowo-po-słowie
  // odbywa się DWA razy (raz z lektorem, raz cicho), oba w tym samym, wspólnym tempie.
  const rhythmTotalSec = (p = {}) => {
    const list         = deriveSentenceList(p)
    const narratorRate = p.narratorRate ?? 0.3
    const pauseSec      = p.pauseSec     ?? 0.4
    const commaPause    = p.commaPause   ?? 0.2
    const periodPause   = p.periodPause  ?? 0.4
    let total = 0
    list.forEach(sentence => {
      const words = sentence.trim().split(/\s+/).filter(Boolean)
      let sentenceTotal = 0
      words.forEach(w => {
        sentenceTotal += estimateWordMs(w, narratorRate)
        let pause = pauseSec
        if (/,$/.test(w)) pause += commaPause
        if (/\.$/.test(w)) pause += periodPause
        sentenceTotal += pause * 1000
      })
      total += sentenceTotal * 2 // dwa przebiegi: z lektorem + samodzielnie (cicho)
    })
    return total / 1000
  }

  const showDurationField = editEx && editEx.module !== 'sz_lip' && editEx.module !== 'speech_rhythm'

  const setLevelLine = (setId, levelId, idx, value) => {
    setForm(prev => {
      const key = `content_${setId}_${levelId}_lines`
      const arr = [...(prev.params?.[key] || Array(10).fill(''))]
      arr[idx] = value
      return { ...prev, params: { ...prev.params, [key]: arr } }
    })
  }

  const activeSet = (form.params?.soundSets || []).find(s => s.id === form.params?.activeSetId)

  const addSoundSet = () => {
    const newId = `set_${Date.now()}`
    setForm(prev => {
      const sets = [...(prev.params?.soundSets || []), { id: newId, phoneme: '' }]
      return { ...prev, params: { ...prev.params, soundSets: sets, activeSetId: newId } }
    })
  }

  const renameActiveSet = (value) => {
    setForm(prev => ({
      ...prev,
      params: {
        ...prev.params,
        soundSets: (prev.params?.soundSets || []).map(s =>
          s.id === prev.params?.activeSetId ? { ...s, phoneme: value } : s
        ),
      },
    }))
  }

  const deleteActiveSet = () => {
    setForm(prev => {
      const sets = (prev.params?.soundSets || []).filter(s => s.id !== prev.params?.activeSetId)
      if (sets.length === 0) return prev // zawsze musi zostać co najmniej jeden zestaw
      return { ...prev, params: { ...prev.params, soundSets: sets, activeSetId: sets[0].id } }
    })
  }

  const isMultiSlot = editEx && (editEx.module === 'sz_lip' || editEx.module === 'speech_rhythm')
  const isSimpleSlot = editEx && !isMultiSlot

  const saveEdit = () => {
    let updatedParams = form.params
    if (editEx?.module === 'speech_rhythm') {
      const list = deriveSentenceList(form.params)
      updatedParams = {
        ...form.params,
        sentenceList: list,
        sentences: list.join(' '),
        activePhoneme: activeSet?.phoneme || '',
      }
    }

    let durationToSave = Number(form.duration)
    if (editEx?.module === 'sz_lip')             durationToSave = Math.max(1, Math.ceil(szTotalSec(updatedParams) / 60))
    else if (editEx?.module === 'speech_rhythm') durationToSave = Math.max(1, Math.ceil(rhythmTotalSec(updatedParams) / 60))

    const updatedExercise = {
      ...editEx,
      schedule:        form.schedule,
      duration:        durationToSave,
      params:          updatedParams,
      alarmEnabled:    form.alarmEnabled,
      alarmAdvanceSec: Number(form.alarmAdvanceSec),
      alarmSound:      form.alarmSound,
      visionEnabled:   form.visionEnabled,
    }

    const newExercises = (exercises || []).map(e => e.id === selected ? updatedExercise : e)
    setExercises(newExercises)

    // Regeneruj plan dnia — zachowaj statusy już wykonanych/anulowanych instancji
    const existingById = {}
    ;(plan || []).forEach(p => { existingById[p.id] = p })
    const newPlan = generateTodayPlan(newExercises).map(instance => {
      const old = existingById[instance.id]
      if (old && old.status !== 'planned') return old // zachowaj istniejący status
      return instance
    })
    setPlan(newPlan)

    setSaved(true)
    setTimeout(() => { setSaved(false); closeEdit() }, 1000)
  }

  const setParam = (key, val) => setForm(prev => ({ ...prev, params: { ...prev.params, [key]: val } }))
  const testSound = () => playSound(form.alarmSound || 'phone')

  // ── Zarządzanie slotami harmonogramu ──────────────────────────────────────
  // Proste ćwiczenia: max 1 slot na dzień
  const setSimpleSlot = (day, hour) => setForm(prev => {
    const filtered = (prev.schedule || []).filter(s => s.day !== day)
    return { ...prev, schedule: [...filtered, { day, hour }] }
  })
  const removeSimpleSlot = (day) => setForm(prev => ({
    ...prev, schedule: (prev.schedule || []).filter(s => s.day !== day)
  }))

  // SZ Lip i Speech Rhythm: wiele slotów na dzień, każdy z własną konfiguracją
  // Użycie globalnego indeksu w tablicy form.schedule dla bezpiecznej edycji
  const updateSlotByIdx = (globalIdx, field, value) => setForm(prev => ({
    ...prev,
    schedule: prev.schedule.map((s, i) => i === globalIdx ? { ...s, [field]: value } : s)
  }))
  const removeSlotByIdx = (globalIdx) => setForm(prev => ({
    ...prev,
    schedule: prev.schedule.filter((_, i) => i !== globalIdx)
  }))
  const addMultiSlot = (day) => {
    let newSlot = { day, hour: '' }
    if (editEx?.module === 'sz_lip') {
      newSlot.setIdx = 0
    } else if (editEx?.module === 'speech_rhythm') {
      const sets = editEx.params?.soundSets || DEFAULT_SOUND_SETS
      newSlot.activeSetId   = editEx.params?.activeSetId   || sets[0]?.id || 'z'
      newSlot.activeLevel   = editEx.params?.activeLevel   || 'short'
      newSlot.activePhoneme = editEx.params?.activePhoneme || sets[0]?.phoneme || 'z'
    }
    setForm(prev => ({ ...prev, schedule: [...(prev.schedule || []), newSlot] }))
  }

  // Helper: aktualizacja zestawu słów w SZ Lip (pole wordSets w params)
  const setWordSetWords = (idx, words) => setForm(prev => {
    const existing = prev.params?.wordSets || Array.from({ length: 10 }, (_, i) => ({ id: i, words: '' }))
    const sets = existing.map((s, i) => i === idx ? { ...s, words } : s)
    return { ...prev, params: { ...prev.params, wordSets: sets } }
  })

  const deleteExercise = (ex) => {
    if (!window.confirm(`Usunąć szablon "${MODULE_LABELS[ex.module] || ex.name}"? Zniknie z harmonogramu we wszystkich dniach.`)) return
    setExercises(prev => prev.filter(e => e.id !== ex.id))
  }

  // Dodaje kolejny niezależny szablon Speech Rhythm (inna głoska/poziom w inne dni)
  const addSpeechRhythmInstance = () => {
    const template = (exercises || []).find(e => e.module === 'speech_rhythm')
    const newEx = {
      id: `ex_speech_rhythm_${Date.now()}`,
      name: 'Speech Rhythm',
      module: 'speech_rhythm',
      schedule: [],
      duration: template?.duration ?? 3,
      points: 10,
      instruction: template?.instruction ?? 'Mów powoli i równo. Powtórz słowa lub sylaby w spokojnym rytmie. Podczas wymawiania początku wyrazów otwieraj usta i w słowach tego wymagających rób dzióbek. Pilnujemy języka!!! (Język nie może wychodzić poza zęby).',
      alarmEnabled: true,
      alarmAdvanceSec: 30,
      alarmSound: 'phone',
      params: { ...(template?.params || {}) },
    }
    setExercises(prev => [...prev, newEx])
    openEdit(newEx)
  }

  return (
    <div>
      <p className="section-title">🎓 Trener</p>
      <p className="section-sub">Harmonogram i parametry ćwiczeń</p>

      {(exercises || []).map(ex => (
        <div key={ex.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{MODULE_LABELS[ex.module] || ex.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                ⏱ ~{ex.duration} min · {(ex.schedule || []).length === 0 ? 'Brak harmonogramu — skonfiguruj w Trenerze' : `${(ex.schedule || []).length} slotów`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {DAYS_PL.map((d, i) => {
                  const daySlots = (ex.schedule || []).filter(s => s.day === i)
                  if (daySlots.length === 0) return null
                  return <span key={i} style={{ marginRight: 8 }}><strong>{d}:</strong> {daySlots.map(s => s.hour).join(', ')}</span>
                })}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                {ex.module === 'tongue_position' && `Aktywność: ${ex.params?.activeSec ?? 5}s · Przerwa: ${ex.params?.breakSec ?? 5}s`}
                {ex.module === 'sz_lip' && (() => {
                  const words = (ex.params?.words || 'sza,sze,szo,szu').split(',').map(w => w.trim()).filter(Boolean)
                  return `Wyrazy: ${words.join(', ')} · Tempo: ${ex.params?.speechRate ?? 0.3} · Odstęp: ${ex.params?.gapSec ?? 0.4}s · ${ex.params?.reps ?? 5}× lista`
                })()}
                {ex.module === 'speech_rhythm' && (() => {
                  const sets = ex.params?.soundSets || DEFAULT_SOUND_SETS
                  const set  = sets.find(s => s.id === ex.params?.activeSetId) || sets[0]
                  const lvl  = rhythmLevels(set?.phoneme).find(l => l.id === (ex.params?.activeLevel || 'short'))
                  return `Głoska: „${set?.phoneme || '?'}” · ${lvl?.label} · Tempo: ${ex.params?.narratorRate ?? 0.3}`
                })()}
                {(ex.module === 'mechanical' || ex.module === 'froggy_mouth') && 'Timer + alarm przypominający i końcowy'}
              </div>
              <div style={{ marginTop: 4, fontSize: 11 }}>
                {ex.alarmEnabled !== false
                  ? <span style={{ color: 'var(--primary)' }}>
                      🔔 {SOUND_OPTIONS.find(s => s.value === (ex.alarmSound || 'phone'))?.label}
                      {' · '}
                      {ADVANCE_OPTIONS.find(a => a.value === (ex.alarmAdvanceSec ?? 30))?.label}
                    </span>
                  : <span style={{ color: 'var(--muted)' }}>🔕 Alarm wyłączony</span>
                }
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="btn btn-outline btn-sm" onClick={() => openEdit(ex)}>✏️ Edytuj</button>
              {ex.module === 'speech_rhythm' && plan.filter(e => e.module === 'speech_rhythm').length > 1 && (
                <button className="btn btn-sm" style={{ background: '#FEF2F2', color: 'var(--red)' }}
                  onClick={() => deleteExercise(ex)}>🗑 Usuń</button>
              )}
            </div>
          </div>
        </div>
      ))}

      {selected && editEx && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>✏️ {MODULE_LABELS[editEx.module] || editEx.name}</h3>

            <label className="form-label">Harmonogram tygodniowy</label>

            {/* Proste ćwiczenia — max 1 godzina na dzień */}
            {isSimpleSlot && DAYS_PL.map((dayLabel, dayIdx) => {
              const slot = (form.schedule || []).find(s => s.day === dayIdx)
              return (
                <div key={dayIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 32, fontWeight: 800, fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{dayLabel}</span>
                  {slot ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <SlotTimeInput value={slot.hour} onChange={h => setSimpleSlot(dayIdx, h)} />
                      <button onClick={() => removeSimpleSlot(dayIdx)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setSimpleSlot(dayIdx, '')}>+ Dodaj</button>
                  )}
                </div>
              )
            })}

            {/* SZ Lip Shape — zestawy słów + wiele slotów na dzień z wyborem zestawu */}
            {editEx.module === 'sz_lip' && (() => {
              const wordSets = form.params?.wordSets || Array.from({ length: 10 }, (_, i) => ({ id: i, words: '' }))
              const nonEmpty = wordSets.filter(s => s.words?.trim())
              return (
                <>
                  <label className="form-label">Zestawy słów (do 10 zestawów, każdy ~8–10 słów)</label>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    Zdefiniuj zestawy, a następnie przypisz każdy termin w harmonogramie do wybranego zestawu.
                  </div>
                  {wordSets.map((set, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 64, fontSize: 12, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>Zestaw {i + 1}</span>
                      <input className="form-input" style={{ flex: 1, marginBottom: 0 }}
                        placeholder="np. sza, sze, szo, szu, szał, szum, szef"
                        value={set.words || ''}
                        onChange={e => setWordSetWords(i, e.target.value)} />
                    </div>
                  ))}
                  <div className="divider" />
                  <label className="form-label">Harmonogram tygodniowy</label>
                  {DAYS_PL.map((dayLabel, dayIdx) => {
                    const daySlots = (form.schedule || [])
                      .map((s, i) => ({ ...s, _globalIdx: i }))
                      .filter(s => s.day === dayIdx)
                      .sort((a, b) => (a.hour || '').localeCompare(b.hour || ''))
                    return (
                      <div key={dayIdx} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{dayLabel}</div>
                        {daySlots.map((slot) => (
                          <div key={slot._globalIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                            <SlotTimeInput value={slot.hour || ''} onChange={h => updateSlotByIdx(slot._globalIdx, 'hour', h)} />
                            <select value={slot.setIdx ?? 0}
                              style={{ padding: '6px 8px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 12, background: '#fff', outline: 'none', flex: 1, minWidth: 140 }}
                              onChange={e => updateSlotByIdx(slot._globalIdx, 'setIdx', Number(e.target.value))}>
                              {nonEmpty.length === 0
                                ? <option value={0}>— najpierw zdefiniuj zestawy słów powyżej —</option>
                                : wordSets.map((s, i) => s.words?.trim()
                                    ? <option key={i} value={i}>Zestaw {i + 1}: {s.words.slice(0, 35)}{s.words.length > 35 ? '…' : ''}</option>
                                    : null
                                  ).filter(Boolean)
                              }
                            </select>
                            <button onClick={() => removeSlotByIdx(slot._globalIdx)}
                              style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
                          </div>
                        ))}
                        <button className="btn btn-ghost btn-sm" onClick={() => addMultiSlot(dayIdx)}>+ Dodaj termin</button>
                      </div>
                    )
                  })}
                </>
              )
            })()}

            {/* Mechanical / Froggy — link do gry */}
            {(editEx.module === 'mechanical' || editEx.module === 'froggy_mouth') && (
              <>
                <label className="form-label">Link do gry (opcjonalnie)</label>
                <input className="form-input"
                  placeholder="np. https://gra.example.com"
                  value={form.params?.gameLink || ''}
                  onChange={e => setParam('gameLink', e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
                  Jeśli podasz link, w alarmie pojawi się przycisk "▶ Start z grą" — kliknięcie otwiera grę w nowej karcie i automatycznie startuje timer. Zamknięcie karty z grą zakończy ćwiczenie.
                </div>
              </>
            )}

            {/* Speech Rhythm — wiele slotów na dzień, każdy z własną głoską i poziomem */}
            {editEx.module === 'speech_rhythm' && (() => {
              const sets = editEx.params?.soundSets || DEFAULT_SOUND_SETS
              return DAYS_PL.map((dayLabel, dayIdx) => {
                const daySlots = (form.schedule || [])
                  .map((s, i) => ({ ...s, _globalIdx: i }))
                  .filter(s => s.day === dayIdx)
                  .sort((a, b) => a.hour.localeCompare(b.hour))
                return (
                  <div key={dayIdx} style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{dayLabel}</div>
                    {daySlots.map((slot) => (
                      <div key={slot._globalIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        <SlotTimeInput value={slot.hour} onChange={h => updateSlotByIdx(slot._globalIdx, 'hour', h)} />
                        <select value={slot.activeSetId || sets[0]?.id || ''}
                          style={{ padding: '6px 8px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, fontWeight: 700, background: '#fff', outline: 'none' }}
                          onChange={e => {
                            const set = sets.find(s => s.id === e.target.value)
                            updateSlotByIdx(slot._globalIdx, 'activeSetId', e.target.value)
                            if (set) updateSlotByIdx(slot._globalIdx, 'activePhoneme', set.phoneme)
                          }}>
                          {sets.map(s => <option key={s.id} value={s.id}>„{s.phoneme}"</option>)}
                        </select>
                        <select value={slot.activeLevel || 'short'}
                          style={{ padding: '6px 8px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 12, background: '#fff', outline: 'none', flex: 1, minWidth: 140 }}
                          onChange={e => updateSlotByIdx(slot._globalIdx, 'activeLevel', e.target.value)}>
                          {rhythmLevels(sets.find(s => s.id === slot.activeSetId)?.phoneme).map(l => (
                            <option key={l.id} value={l.id}>{l.label}</option>
                          ))}
                        </select>
                        <button onClick={() => removeSlotByIdx(slot._globalIdx)}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
                      </div>
                    ))}
                    <button className="btn btn-ghost btn-sm" onClick={() => addMultiSlot(dayIdx)}>+ Dodaj termin</button>
                  </div>
                )
              })
            })()}

            <div className="divider" />

            {showDurationField && (
              <>
                <label className="form-label">Czas trwania (min)</label>
                <input className="form-input" type="number" min={1} max={60} value={form.duration}
                  onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} />
              </>
            )}

            {editEx.module === 'tongue_position' && (<>
              <label className="form-label">Czas aktywności (sekundy)</label>
              <input className="form-input" type="number" min={1} max={60}
                value={form.params?.activeSec ?? 5}
                onChange={e => setParam('activeSec', Number(e.target.value))} />
              <label className="form-label">Czas przerwy (sekundy)</label>
              <input className="form-input" type="number" min={1} max={60}
                value={form.params?.breakSec ?? 5}
                onChange={e => setParam('breakSec', Number(e.target.value))} />
            </>)}

            {editEx.module === 'sz_lip' && (<>
              <label className="form-label">Tempo czytania</label>
              <input className="form-input" type="number" min={0.01} max={1} step={0.01}
                value={form.params?.speechRate ?? 0.3}
                onChange={e => setParam('speechRate', Number(e.target.value))} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
                1 = normalne tempo · niższa wartość = wolniej. Min. 0.01, maks. 1
              </div>

              <label className="form-label">Odstęp między wyrazami (sekundy)</label>
              <input className="form-input" type="number" min={0.5} max={2} step={0.5}
                value={form.params?.gapSec ?? 0.4}
                onChange={e => setParam('gapSec', Number(e.target.value))} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
                Po przeczytaniu przez lektora słowo pojawia się na ekranie na ten czas. Zakres 0.5–2s, krok 0.5
              </div>

              <label className="form-label">Liczba powtórzeń listy wyrazów</label>
              <input className="form-input" type="number" min={1} max={30}
                value={form.params?.reps ?? 5}
                onChange={e => setParam('reps', Number(e.target.value))} />

              {(() => {
                const total = szTotalSec(form.params)
                return (
                  <div style={{ background: '#EEF2FF', borderRadius: 10, padding: '10px 12px', marginTop: 12, marginBottom: 12, fontSize: 13, color: 'var(--primary)', fontWeight: 700 }}>
                    ⏱ Szacowany czas treningu: ~{Math.ceil(total / 60)} min ({Math.round(total)}s)
                  </div>
                )
              })()}
            </>)}

            {editEx.module === 'speech_rhythm' && (<>
              <label className="form-label">Zestaw głoskowy</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {(form.params?.soundSets || []).map(set => (
                  <button key={set.id}
                    className={`type-btn ${form.params?.activeSetId === set.id ? 'active' : ''}`}
                    style={{ flex: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 800 }}
                    onClick={() => setParam('activeSetId', set.id)}>
                    „{set.phoneme || '?'}”
                  </button>
                ))}
                <button className="btn btn-outline btn-sm" onClick={addSoundSet}>+ Dodaj zestaw</button>
              </div>

              <label className="form-label">Głoska tego zestawu</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input className="form-input" style={{ marginBottom: 0, flex: 1 }}
                  value={activeSet?.phoneme || ''}
                  onChange={e => renameActiveSet(e.target.value)}
                  placeholder="np. z, dz, sz, dż..." />
                {(form.params?.soundSets || []).length > 1 && (
                  <button className="btn btn-sm" style={{ background: '#FEF2F2', color: 'var(--red)' }}
                    onClick={deleteActiveSet}>🗑</button>
                )}
              </div>

              <div className="divider" />

              <label className="form-label">Poziom trudności (w ramach zestawu „{activeSet?.phoneme || '?'}”)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {rhythmLevels(activeSet?.phoneme).map(lvl => (
                  <button key={lvl.id}
                    className={`type-btn ${(form.params?.activeLevel || 'short') === lvl.id ? 'active' : ''}`}
                    style={{ flex: '1 1 45%', fontSize: 12, padding: '9px 10px' }}
                    onClick={() => setParam('activeLevel', lvl.id)}>
                    {lvl.label}
                  </button>
                ))}
              </div>

              {(() => {
                const level = form.params?.activeLevel || 'short'
                const setId = form.params?.activeSetId
                const showLines = LEVELS_WITH_LINES.includes(level)
                const levelLabel = rhythmLevels(activeSet?.phoneme).find(l => l.id === level)?.label

                return (
                  <>
                    {showLines && (
                      <>
                        <label className="form-label">{levelLabel} — wpisz do 10 zdań</label>
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', width: 18 }}>{i + 1}.</span>
                            <input className="form-input" style={{ marginBottom: 0 }}
                              value={(form.params?.[`content_${setId}_${level}_lines`] || [])[i] || ''}
                              onChange={e => setLevelLine(setId, level, i, e.target.value)}
                              placeholder={`Zdanie ${i + 1}...`} />
                          </div>
                        ))}
                      </>
                    )}

                    {level === 'poem' && (
                      <>
                        <label className="form-label" style={{ marginTop: 8 }}>{levelLabel} (maks. ~40 słów)</label>
                        <textarea className="form-input" rows={5} style={{ resize: 'vertical' }}
                          maxLength={280}
                          placeholder="Wpisz krótki wierszyk..."
                          value={form.params?.[`content_${setId}_poem_text`] || ''}
                          onChange={e => setParam(`content_${setId}_poem_text`, e.target.value)} />
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
                          {(form.params?.[`content_${setId}_poem_text`] || '').length}/280 znaków
                        </div>
                      </>
                    )}
                  </>
                )
              })()}

              <div className="divider" />

              <label className="form-label">Tempo czytania (lektor i wizualizacja — wspólne)</label>
              <input className="form-input" type="number" min={0.1} max={1} step={0.1}
                value={form.params?.narratorRate ?? 0.3}
                onChange={e => setParam('narratorRate', Number(e.target.value))} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
                1 = normalne tempo · niższa wartość = wolniej. Zakres 0.1–1. Lektor czyta w tym tempie, a wizualizacja (w obu przebiegach) jest z nim w pełni zsynchronizowana — dziecko powtarza w identycznym rytmie.
              </div>

              <label className="form-label">Przerwa między słowami (sekundy)</label>
              <input className="form-input" type="number" min={0.1} max={1.5} step={0.1}
                value={form.params?.pauseSec ?? 0.4}
                onChange={e => setParam('pauseSec', Number(e.target.value))} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
                Zakres 0.1–1.5s
              </div>

              <label className="form-label">Dodatkowa przerwa po przecinku (sekundy)</label>
              <input className="form-input" type="number" min={0.1} max={1} step={0.1}
                value={form.params?.commaPause ?? 0.2}
                onChange={e => setParam('commaPause', Number(e.target.value))} />

              <label className="form-label">Dodatkowa przerwa po kropce (sekundy)</label>
              <input className="form-input" type="number" min={0.1} max={1} step={0.1}
                value={form.params?.periodPause ?? 0.4}
                onChange={e => setParam('periodPause', Number(e.target.value))} />

              {(() => {
                const total = rhythmTotalSec(form.params)
                return (
                  <div style={{ background: '#EEF2FF', borderRadius: 10, padding: '10px 12px', marginTop: 12, marginBottom: 12, fontSize: 13, color: 'var(--primary)', fontWeight: 700 }}>
                    ⏱ Szacowany czas treningu: ~{Math.ceil(total / 60)} min ({Math.round(total)}s)
                  </div>
                )
              })()}
            </>)}

            {(editEx.module === 'mechanical' || editEx.module === 'froggy_mouth') && (
              <div style={{ background: '#F5F3FF', borderRadius: 10, padding: '10px 12px', marginBottom: 4, fontSize: 12, color: 'var(--purple)' }}>
                ℹ️ Podczas treningu: przypomnienie ~1 min przed końcem (2×, bez potwierdzenia) oraz alarm końcowy dzwoniący do kliknięcia.
              </div>
            )}

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>📷 System wizyjny</span>
              <button
                className={`btn btn-sm ${form.visionEnabled ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setForm(p => ({ ...p, visionEnabled: !p.visionEnabled }))}>
                {form.visionEnabled ? 'Włączony' : 'Wyłączony'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              Jeśli włączony, ćwiczenie pojawi się na liście do kalibracji w zakładce „Wizja” i będzie
              wymagało kalibracji przez logopedę przed uruchomieniem.
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>🔔 Alarm</span>
              <button
                className={`btn btn-sm ${form.alarmEnabled ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setForm(p => ({ ...p, alarmEnabled: !p.alarmEnabled }))}>
                {form.alarmEnabled ? 'Włączony' : 'Wyłączony'}
              </button>
            </div>

            {form.alarmEnabled && (<>
              <label className="form-label">Dźwięk alarmu</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {SOUND_OPTIONS.map(s => (
                  <button key={s.value}
                    className={`type-btn ${form.alarmSound === s.value ? 'active' : ''}`}
                    style={{ textAlign: 'left', padding: '10px 14px' }}
                    onClick={() => setForm(p => ({ ...p, alarmSound: s.value }))}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button className="btn btn-outline btn-sm btn-full" style={{ marginBottom: 14 }} onClick={testSound}>
                ▶ Przetestuj dźwięk
              </button>
              <label className="form-label">Alarm wcześniej</label>
              <select className="form-input" style={{ appearance: 'auto' }}
                value={form.alarmAdvanceSec}
                onChange={e => setForm(p => ({ ...p, alarmAdvanceSec: Number(e.target.value) }))}>
                {ADVANCE_OPTIONS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </>)}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveEdit}>
                {saved ? '✓ Zapisano!' : 'Zapisz'}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={closeEdit}>Anuluj</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ background: '#F5F3FF', border: '1.5px solid #DDD6FE', marginTop: 4 }}>
        <h3 style={{ fontWeight: 800, marginBottom: 8, color: 'var(--purple)' }}>ℹ️ Informacje</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Każdy zestaw głoskowy w Speech Rhythm ma własne 5 poziomów treści. Możesz dodawać kolejne zestawy
          (np. dla nowych głosek) przyciskiem "+ Dodaj zestaw". Jeśli alarm przypominający dzwoni 5 minut bez
          reakcji, wyłącza się automatycznie i ćwiczenie oznaczane jest jako "nie wykonane".
        </p>
      </div>
    </div>
  )
}
