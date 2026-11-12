// Sterowanie ustami dla gier — jedno wejście niezależnie od źródła:
//   kamera + Mapa ust (data/faceMap.js)   albo   klawiatura w trybie testowym.
//
//   const ctl = useMouthControl()
//   await ctl.start()             // 'camera' | 'sim' | 'none' (brak mapy / kamery)
//   ctl.read(among)               // { face, pose, conf, angle }  — wywoływać w pętli gry
//   ctl.stop()
//
// Tryb testowy (localStorage stc_debug_sim = '1'): strzałki ← → ↑ ↓ = policzek lewy/prawy,
// język pod górną/dolną wargą; puszczenie klawisza = usta zamknięte.
// Klawisze A i D = płynny obrót języka dookoła ust (do gry Sejf), z Shift = za szybko.

import { useRef, useCallback, useMemo, useEffect } from 'react'
import { useFaceEngine } from './useFaceEngine'
import { extractFeatures, classify, tongueAngle, getFaceMap, MAX_YAW, POSE_ANGLE } from '../../data/faceMap'

const FACE_LOST_MS = 1000
const KEY_POSE = { ArrowLeft: 'cheekL', ArrowRight: 'cheekR', ArrowUp: 'tongueUp', ArrowDown: 'tongueDown' }
const SIM_DEG_PER_SEC = 70

export function isSimMode() {
  try { return localStorage.getItem('stc_debug_sim') === '1' } catch (e) { return false }
}

export function useMouthControl() {
  const face = useFaceEngine()
  const modeRef = useRef('none')
  const mapRef  = useRef(null)
  const simRef  = useRef({ keys: new Set(), angle: null, lastT: 0 })
  // wygładzanie: pozycja musi się utrzymać przez kilka klatek, żeby gra nie migotała
  const holdRef = useRef({ pose: null, count: 0, stable: null })

  useEffect(() => {
    const down = (e) => { if (modeRef.current === 'sim') { simRef.current.keys.add(e.key); if (e.key.startsWith('Arrow')) e.preventDefault() } }
    const up   = (e) => { simRef.current.keys.delete(e.key); simRef.current.keys.delete(e.key.toLowerCase()); simRef.current.keys.delete(e.key.toUpperCase()) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const start = useCallback(async () => {
    if (isSimMode()) { modeRef.current = 'sim'; simRef.current = { keys: new Set(), angle: null, lastT: 0 }; return 'sim' }
    mapRef.current = getFaceMap()
    if (!mapRef.current) { modeRef.current = 'none'; return 'none' }
    const ok = await face.start()
    modeRef.current = ok ? 'camera' : 'none'
    return modeRef.current
  }, [face])

  const stop = useCallback(() => { face.stop(); modeRef.current = 'none' }, [face])

  const read = useCallback((among = null) => {
    if (modeRef.current === 'sim') {
      const s = simRef.current
      const now = performance.now()
      const dt = s.lastT ? Math.min(100, now - s.lastT) / 1000 : 0
      s.lastT = now
      const k = s.keys
      const fast = k.has('Shift') ? 4 : 1
      const dir = (k.has('d') || k.has('D') ? 1 : 0) - (k.has('a') || k.has('A') ? 1 : 0)
      if (dir !== 0) s.angle = (((s.angle ?? 0) + dir * SIM_DEG_PER_SEC * fast * dt) % 360 + 360) % 360
      let pose = 'closed'
      for (const key of Object.keys(KEY_POSE)) if (k.has(key)) { pose = KEY_POSE[key]; s.angle = POSE_ANGLE[pose] }
      const angle = pose !== 'closed' || dir !== 0 ? s.angle : null
      return { face: true, pose: among && !among.includes(pose) ? 'closed' : pose, conf: 1, angle }
    }
    if (modeRef.current !== 'camera') return { face: false, pose: null, conf: 0, angle: null }
    const points = face.getPoints()
    if (!points || face.msSinceFace() > FACE_LOST_MS) return { face: false, pose: null, conf: 0, angle: null }
    const ex = extractFeatures(points, face.getCanvasSize(), face.getBlendshapes())
    // głowa obrócona w bok: wypchnięty policzek i obrót wyglądają podobnie — takiej klatki nie oceniamy
    if (!ex || Math.abs(ex.yaw) > MAX_YAW) return { face: true, pose: null, conf: 0, angle: null, turned: true }
    const c = classify(ex.f, mapRef.current, among)
    const h = holdRef.current
    if (c.pose === h.pose) h.count++; else { h.pose = c.pose; h.count = 1 }
    if (h.count >= 3) h.stable = c.pose
    return { face: true, pose: h.stable, conf: c.conf, angle: tongueAngle(ex.f, mapRef.current) }
  }, [face])

  const getMode = useCallback(() => modeRef.current, [])
  return useMemo(() => ({ start, stop, read, getMode, face }), [start, stop, read, getMode, face])
}
