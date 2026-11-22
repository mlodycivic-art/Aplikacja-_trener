// Ustawienia serii „Gimnastyka buzi i języka” w Trenerze:
// kolejność etapów, a w każdym etapie: włącz/wyłącz, kolejność, liczba powtórzeń i tempo każdego ćwiczenia.

import { useState } from 'react'
import { STAGES, TEMPOS, stationById, normalizeGym, estimateSec, DEFAULT_GYM } from '../../data/gymExercises'
import { FacePair, usePoseLoop } from './FaceRig'

const arrowBtn = { padding: '2px 8px', minHeight: 0, fontSize: 14, lineHeight: 1.2 }

function Preview({ id }) {
  const st = stationById[id]
  const pose = usePoseLoop(st.keys, st.cycleMs, true, null)
  return <div style={{ maxWidth: 360, margin: '6px 0 10px' }}><FacePair pose={pose} hold={!!st.tongueHold} /></div>
}

export default function GymSettings({ value, onChange }) {
  const g = normalizeGym(value)
  const [preview, setPreview] = useState(null)
  const set = (next) => onChange(normalizeGym(next))

  const moveStage = (i, d) => {
    const order = [...g.stageOrder]; const j = i + d
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    set({ ...g, stageOrder: order })
  }
  // przesuwanie w obrębie etapu: zamiana z najbliższym ćwiczeniem tego samego etapu
  const moveStation = (id, d) => {
    const list = [...g.stations]
    const i = list.findIndex(s => s.id === id)
    const stage = stationById[id].stage
    let j = i + d
    while (j >= 0 && j < list.length && stationById[list[j].id].stage !== stage) j += d
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    set({ ...g, stations: list })
  }
  const patch = (id, change) => set({ ...g, stations: g.stations.map(s => (s.id === id ? { ...s, ...change } : s)) })

  const sec = estimateSec(g)
  return (
    <div data-gym-settings>
      <div className="divider" />
      <label className="form-label">Seria: kolejność etapów</label>
      {g.stageOrder.map((sid, i) => (
        <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{i + 1}. {STAGES.find(s => s.id === sid).name}</span>
          <button className="btn btn-ghost btn-sm" style={arrowBtn} onClick={() => moveStage(i, -1)} aria-label="Etap wyżej">↑</button>
          <button className="btn btn-ghost btn-sm" style={arrowBtn} onClick={() => moveStage(i, 1)} aria-label="Etap niżej">↓</button>
        </div>
      ))}

      {g.stageOrder.map(stageId => (
        <div key={stageId} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>{STAGES.find(s => s.id === stageId).name.toUpperCase()}</div>
          {g.stations.filter(s => stationById[s.id].stage === stageId).map(s => {
            const def = stationById[s.id]
            return (
              <div key={s.id} data-station-row={s.id} style={{ padding: '8px 10px', borderRadius: 12, background: 'var(--soft)', marginBottom: 6, opacity: s.enabled ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={s.enabled} onChange={e => patch(s.id, { enabled: e.target.checked })} aria-label={`Włącz ${def.name}`} />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{def.name}</span>
                  <button className="btn btn-ghost btn-sm" style={arrowBtn} onClick={() => setPreview(preview === s.id ? null : s.id)}>{preview === s.id ? 'Ukryj' : 'Podgląd'}</button>
                  <button className="btn btn-ghost btn-sm" style={arrowBtn} onClick={() => moveStation(s.id, -1)} aria-label="Wyżej">↑</button>
                  <button className="btn btn-ghost btn-sm" style={arrowBtn} onClick={() => moveStation(s.id, 1)} aria-label="Niżej">↓</button>
                </div>
                {preview === s.id && <Preview id={s.id} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>Powtórzenia</span>
                  <input className="form-input" type="number" min={1} max={30} value={s.reps} style={{ width: 64, marginBottom: 0, padding: '4px 8px' }}
                    onChange={e => patch(s.id, { reps: Number(e.target.value) })} data-reps-input={s.id} />
                  <span className="text-muted" style={{ fontSize: 12, marginLeft: 4 }}>Tempo</span>
                  {Object.entries(TEMPOS).map(([tid, t]) => (
                    <button key={tid} className={`type-btn ${s.tempo === tid ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => patch(s.id, { tempo: tid })} data-tempo={`${s.id}:${tid}`}>{t.label}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      <label className="form-label" style={{ marginTop: 12 }}>Głos</label>
      <div className="type-selector">
        {[{ v: true, label: 'Mówi nazwę ćwiczenia' }, { v: false, label: 'Bez głosu' }].map(o => (
          <button key={String(o.v)} className={`type-btn ${g.voice === o.v ? 'active' : ''}`} onClick={() => set({ ...g, voice: o.v })}>{o.label}</button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        Cała seria trwa teraz około {Math.max(1, Math.round(sec / 60))} min. Liczby powtórzeń i tempo to propozycja do uzgodnienia z logopedką.
      </div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => { if (window.confirm('Przywrócić proponowaną serię?')) set(DEFAULT_GYM) }}>Przywróć proponowaną serię</button>
    </div>
  )
}
