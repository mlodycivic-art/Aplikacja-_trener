import { useEffect, useRef } from 'react'
import { playSound, unlockAudio } from './useAlarm'

export default function AlarmBanner({ alarm, onDismiss, onGoToToday, onStartWithGame }) {
  const intervalRef = useRef(null)
  const keyRef       = useRef(null)

  useEffect(() => { unlockAudio() }, [])

  useEffect(() => {
    clearInterval(intervalRef.current)

    if (!alarm) { keyRef.current = null; return }

    const key = `${alarm.id}_${alarm.hour}_${alarm.alarmAdvanceSec}`
    if (keyRef.current === key) return
    keyRef.current = key

    const sound = alarm.alarmSound || 'phone'
    // Zagraj od razu, potem powtarzaj co 4s aż do kliknięcia "Idź" lub "✕"
    setTimeout(() => playSound(sound), 100)
    intervalRef.current = setInterval(() => playSound(sound), 4000)

    return () => clearInterval(intervalRef.current)
  }, [alarm])

  useEffect(() => () => clearInterval(intervalRef.current), [])

  if (!alarm) return null

  return (
    <>
      <style>{`
        @keyframes bellSwing {
          0%   { transform: rotate(-22deg); }
          100% { transform: rotate(22deg); }
        }
        @keyframes bannerPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .88; }
        }
        @keyframes bannerShake {
          0%,100% { transform: translateX(-50%) translateX(0); }
          15%     { transform: translateX(-50%) translateX(-5px); }
          30%     { transform: translateX(-50%) translateX(5px); }
          45%     { transform: translateX(-50%) translateX(-4px); }
          60%     { transform: translateX(-50%) translateX(4px); }
          75%     { transform: translateX(-50%) translateX(-2px); }
          90%     { transform: translateX(-50%) translateX(2px); }
        }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, zIndex: 300,
        animation: 'bannerShake 0.7s ease infinite',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #6C63FF, #9B8FFF)',
          color: '#fff', padding: '13px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 32px rgba(108,99,255,.6)',
          animation: 'bannerPulse 1.2s ease infinite',
        }}>
          <span style={{
            fontSize: 28, display: 'inline-block',
            animation: 'bellSwing 0.35s ease infinite alternate',
            transformOrigin: 'top center', flexShrink: 0,
          }}>🔔</span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>
              Czas na trening! · {alarm.hour}
            </div>
            <div style={{ fontSize: 12, opacity: .9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alarm.name}
            </div>
          </div>

          {alarm.params?.gameLink && onStartWithGame && (
            <button onClick={() => { clearInterval(intervalRef.current); onStartWithGame(alarm) }} style={{
              background: '#22C55E', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 13px', fontWeight: 900,
              fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              ▶ Start z grą
            </button>
          )}

          {!(alarm.params?.gameLink && onStartWithGame) && (
            <button onClick={onGoToToday} style={{
              background: '#fff', color: '#6C63FF', border: 'none',
              borderRadius: 8, padding: '7px 13px', fontWeight: 900,
              fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              Idź →
            </button>
          )}

          <button onClick={onDismiss} style={{
            background: 'rgba(255,255,255,.2)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '7px 10px', fontWeight: 900,
            fontSize: 13, cursor: 'pointer', flexShrink: 0,
          }}>
            ✕
          </button>
        </div>
      </div>
    </>
  )
}
