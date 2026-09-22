import { useEffect, useRef } from 'react'

// ── Odblokowanie AudioContext po pierwszej interakcji ─────────────────────────
let unlockedCtx = null

export function unlockAudio() {
  if (unlockedCtx) return
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    unlockedCtx = ctx
  } catch (e) {}
}

// ── Odtwarzanie dźwięku ───────────────────────────────────────────────────────
export function playSound(type = 'bell') {
  try {
    const ctx = unlockedCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()

    const tone = (freq, start, dur, wave = 'sine', gain = 0.5) => {
      const osc = ctx.createOscillator()
      const g   = ctx.createGain()
      osc.connect(g)
      g.connect(ctx.destination)
      osc.type = wave
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      g.gain.setValueAtTime(gain, ctx.currentTime + start)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.05)
    }

    switch (type) {
      case 'bell':
        tone(880, 0,    0.4); tone(660, 0.45, 0.4); tone(880, 0.9, 0.6)
        break
      case 'phone':
        for (let i = 0; i < 8; i++) {
          tone(480, i * 0.1,        0.07, 'square', 0.35)
          tone(380, i * 0.1 + 0.05, 0.05, 'square', 0.35)
        }
        break
      case 'soft':
        tone(528, 0,   0.8, 'sine', 0.3); tone(660, 0.3, 0.6, 'sine', 0.2)
        break
      case 'beep':
        tone(1000, 0, 0.12, 'square', 0.3); tone(1000, 0.18, 0.12, 'square', 0.3)
        break
      case 'alarm': {
        const pattern = [900, 750, 900, 750, 900, 750, 1100, 750, 1100, 750, 1100]
        pattern.forEach((freq, i) => tone(freq, i * 0.13, 0.11, 'sawtooth', 0.55))
        break
      }
      default:
        tone(880, 0, 0.4)
    }
  } catch (e) {
    console.warn('Audio error:', e)
  }
}

// ── Hook alarmów ──────────────────────────────────────────────────────────────
// Klucz zawiera godzinę/wyprzedzenie/dźwięk — każda zmiana tych ustawień
// w Trenerze tworzy nowy klucz, więc alarm może odpalić się ponownie.
export function useAlarmChecker(plan, onAlarm) {
  const firedRef = useRef(new Set())

  useEffect(() => {
    const check = () => {
      const now         = new Date()
      const nowTotalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
      const dateKey     = now.toDateString()

      plan.forEach(ex => {
        if (ex.status !== 'planned')   return
        if (ex.alarmEnabled === false) return
        if (!ex.hour) return // brak ustawionej godziny

        const [h, m]     = ex.hour.split(':').map(Number)
        const exTotalSec = h * 3600 + m * 60
        const advanceSec = ex.alarmAdvanceSec ?? 30
        const triggerSec = exTotalSec - advanceSec

        const key = `${ex.id}_${dateKey}_${ex.hour}_${advanceSec}_${ex.alarmSound || 'phone'}`
        if (firedRef.current.has(key)) return

        if (nowTotalSec >= triggerSec && nowTotalSec < triggerSec + 40) {
          firedRef.current.add(key)
          onAlarm(ex)
        }
      })
    }

    check()
    const t = setInterval(check, 5000)
    return () => clearInterval(t)
  }, [plan])
}

// ── Dźwięk oklasków — głośno na starcie, płynnie wycisza do zera ──────────────
export function playApplause() {
  try {
    const ctx = unlockedCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()

    const totalDuration = 3.0
    const now = ctx.currentTime
    const clapCount = 28

    for (let c = 0; c < clapCount; c++) {
      const progress  = c / clapCount
      const startTime = now + progress * totalDuration * 0.85 + (Math.random() * 0.12)
      const clapDur   = 0.04 + Math.random() * 0.07

      const bufferSize = Math.floor(ctx.sampleRate * clapDur)
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data   = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 18)
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1200 + Math.random() * 2200
      filter.Q.value = 0.7

      // Głośność: pełna na starcie, liniowo do zera na końcu
      const gain = ctx.createGain()
      const vol = Math.max(0.02, (1 - progress) * 0.55)
      gain.gain.setValueAtTime(vol, startTime)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      source.start(startTime)
      source.stop(startTime + clapDur + 0.05)
    }
  } catch (e) {}
}

// ── Migający tytuł karty — widoczny nawet gdy użytkownik jest na innej karcie ──
export function useTitleFlash(active, flashText = '⏰ Czas na trening!') {
  const originalTitleRef = useRef(null)
  const intervalRef = useRef(null)
  const flippedRef = useRef(false)

  useEffect(() => {
    if (active) {
      if (originalTitleRef.current === null) {
        originalTitleRef.current = document.title
      }
      flippedRef.current = false
      intervalRef.current = setInterval(() => {
        flippedRef.current = !flippedRef.current
        document.title = flippedRef.current ? flashText : originalTitleRef.current
      }, 800)
    } else {
      clearInterval(intervalRef.current)
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current
        originalTitleRef.current = null
      }
    }
    return () => {
      clearInterval(intervalRef.current)
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current
        originalTitleRef.current = null
      }
    }
  }, [active, flashText])
}
