import { useRef, useState } from 'react'
import ParentExtras from './ParentExtras'
import { calcDayStats, speechRhythmLabel } from '../data/defaultData'
import { buildWeek, buildWeeklyReportText } from '../data/weekReport'
import { downloadBackup, parseBackup, restoreBackup } from '../data/backup'

const STATUS_LABEL = {
  planned: 'Zaplanowane', completed: 'Ukończone', skipped: 'Pominięte',
  cancelled: 'Anulowane', snoozed: 'Odłożone', missed: 'Nie wykonane',
}

function chipClass(status) {
  if (status === 'missed') return 'skipped'
  return status
}

// ── Tydzień: słupki ukończonych ćwiczeń na dzień ─────────────────────────────
function WeekCard({ week }) {
  const max = Math.max(1, ...week.days.map(d => d.total))
  const t = week.totals
  return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 16 }}>Ostatnie 7 dni</div>
      <div className="text-muted" style={{ fontSize: 13, margin: '4px 0 14px' }}>
        {t.completed} z {t.planned} ćwiczeń · {t.minutes} min · {t.activeDays} dni z ćwiczeniami
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
        {week.days.map(d => (
          <div key={d.key} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>{d.hasPlan ? `${d.completed}/${d.total}` : '–'}</span>
            <div title={`${d.completed} z ${d.total}`} style={{
              width: '100%', maxWidth: 38, height: `${Math.max(3, (d.total / max) * 62)}%`,
              background: '#E5E7EB', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'flex-end', overflow: 'hidden',
            }}>
              <div style={{ width: '100%', height: `${d.total ? (d.completed / d.total) * 100 : 0}%`, background: 'var(--green)' }} />
            </div>
            <span className="text-muted" style={{ fontSize: 11 }}>{d.weekday} {d.label}</span>
          </div>
        ))}
      </div>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
        Szary słupek = zaplanowane, zielona część = ukończone.
      </div>
    </div>
  )
}

// ── Kopia zapasowa ───────────────────────────────────────────────────────────
function BackupCard() {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState(null) // { ok, text }

  const doExport = () => {
    try {
      const n = downloadBackup()
      setMsg({ ok: true, text: `Zapisano plik kopii (${n} pozycji). Znajdziesz go w folderze Pobrane.` })
    } catch (e) {
      setMsg({ ok: false, text: 'Nie udało się zapisać pliku.' })
    }
  }

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    let text = ''
    try { text = await file.text() } catch (err) { setMsg({ ok: false, text: 'Nie udało się odczytać pliku.' }); return }
    const res = parseBackup(text)
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return }
    const when = res.backup.exportedAt ? new Date(res.backup.exportedAt).toLocaleString('pl-PL') : 'nieznana data'
    if (!window.confirm(`Przywrócić kopię z ${when}?\n\nObecne dane aplikacji na tym urządzeniu (plan, ustawienia trenera, punkty, wyniki) zostaną zastąpione. Tej operacji nie można cofnąć.`)) return
    try {
      restoreBackup(res.backup)
      window.location.reload()
    } catch (err) {
      setMsg({ ok: false, text: 'Przywracanie nie powiodło się. Dane mogły zostać zapisane częściowo — przywróć kopię ponownie.' })
    }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 800, fontSize: 16 }}>Kopia zapasowa</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px', lineHeight: 1.5 }}>
        Wszystkie dane są zapisane tylko w tej przeglądarce. Plik kopii chroni je przed utratą
        i pozwala przenieść je na inne urządzenie. Nagrania głosu nie są jego częścią.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={doExport}>Zapisz kopię</button>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>Przywróć z pliku</button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onFile} />
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
    </div>
  )
}

export default function ParentScreen({ user, plan }) {
  const stats = calcDayStats(plan)
  const week  = buildWeek(plan)
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied]       = useState(false)
  const [report, setReport]       = useState('')

  const openReport = () => { setReport(buildWeeklyReportText(user, plan)); setCopied(false); setShowModal(true) }

  const copyReport = () => {
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div>
      <p className="section-title">Panel rodzica</p>
      <p className="section-sub">Postępy: {user.name}</p>

      <button className="btn btn-primary btn-full" style={{ marginBottom: 14 }} onClick={openReport}>
        Raport tygodniowy dla logopedy
      </button>

      <WeekCard week={week} />
      <ParentExtras />

      {/* Dzisiejszy plan */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Dziś</div>
          <div style={{ fontWeight: 800 }}>{stats.completed}/{stats.total} · {stats.minutes} min</div>
        </div>
        <div className="progress-wrap dark" style={{ marginBottom: 10 }}>
          <div className="progress-fill" style={{ width: `${stats.pct}%`, background: 'var(--green)' }} />
        </div>
        {plan.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>Brak ćwiczeń w planie na dziś.</div>}
        {plan.map(ex => (
          <div key={ex.id} className="row-list-item">
            <div>
              <div style={{ fontWeight: 700 }}>{speechRhythmLabel(ex)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {ex.hour} · {ex.duration} min
                {ex.restoredFromMissed && ex.status === 'completed' && (
                  <span style={{ color: 'var(--purple)' }}> · po przywróceniu</span>
                )}
                {ex.extendedTraining && (() => {
                  const sec = ex.overtimeSeconds || 0
                  const m = Math.floor(sec / 60)
                  const s = sec % 60
                  const t = sec > 0 ? ` o ${m > 0 ? `${m} min ` : ''}${s} sek` : ''
                  return <span style={{ color: 'var(--orange)' }}> · przedłużone{t}</span>
                })()}
                {ex.completedViaGameTab && (
                  <span style={{ color: 'var(--primary)' }}> · zakończone zamknięciem karty z grą</span>
                )}
              </div>
            </div>
            <span className={`chip chip-${chipClass(ex.status)}`}>{STATUS_LABEL[ex.status] || ex.status}</span>
          </div>
        ))}
      </div>

      <BackupCard />

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Raport tygodniowy</h3>
            <div className="report-text">{report}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={copyReport}>
                {copied ? 'Skopiowano' : 'Kopiuj raport'}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Zamknij</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
