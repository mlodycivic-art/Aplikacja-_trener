// Jeden „sędzia mowy” dla gier z kręglami (Speech Rhythm, SZ Lip Shape).
//
//   • BEZ kalibracji mikrofonu  → tryb 'rhythm': sprawdza tylko, czy w czasie każdego słowa było słychać głos.
//   • PO kalibracji (pewny próg) → tryb 'judge': to samo ORAZ ocena głosek — czy „sz / cz” zabrzmiały
//     jak „sz”, a nie jak „s” (ten sam pomiar i próg, co w kalibracji i w grach z bańkami).
//     Wynik = połowa za słowa powiedziane w swoim czasie + połowa za poprawne głoski.
//
// Ocenia się wyłącznie głoski bezdźwięczne sz / cz (i „rz” po p, t, k, ch). Słowa z samym „ż / rz / dż”
// albo bez tych głosek liczą się tylko „za głos” — miernik nie słyszy ich pewnie.
// Nie sprawdzamy, CZY padło właściwe słowo ani jak brzmiały inne głoski.

import { useRef, useCallback, useEffect, useMemo } from 'react'
import { useMicRhythm } from './useMicRhythm'
import { useSibilantMeter, analyseFrames } from './useSibilantMeter'
import { getThreshold, classifyValue } from '../../data/patternStore'
import { parseSibilants, judgeUtterance } from '../../data/sibilants'
import { scoreWords } from './speechScore'

// Próg nadaje się do oceniania, gdy jest pewny i (jeśli robiono test na słowach) trafność była ≥ 70%
const usable = (th) => !!th && th.quality === 'good' && (th.accuracy == null || th.accuracy >= 0.7)

export function useSpeechJudge() {
  const rhythm = useMicRhythm()
  const meter = useSibilantMeter()
  const st = useRef({ mode: 'off', active: false, frames: [], marks: [], lastT: 0, th: null, timer: null })

  const stopTimer = () => { clearInterval(st.current.timer); st.current.timer = null }

  const start = useCallback(async () => {
    const S = st.current
    if (S.mode !== 'off') return true
    const th = getThreshold()
    if (usable(th)) {
      const ok = await meter.start()
      if (ok) {
        // pomiar tła trwa ok. 0,7 s — w tym czasie ma być cicho (lektor zaczyna dopiero potem)
        const t0 = performance.now()
        while (meter.getInfo().state !== 'on' && performance.now() - t0 < 2500) await new Promise(r => setTimeout(r, 50))
        if (meter.getInfo().state === 'on') {
          S.mode = 'judge'; S.th = th; S.lastT = performance.now(); S.frames = []; S.marks = []
          S.timer = setInterval(() => {
            for (const f of meter.getFrames()) {
              if (f.t <= S.lastT) continue
              const dt = Math.min(60, f.t - S.lastT)
              S.lastT = f.t
              if (S.active) S.frames.push({ t: f.t, dt, speaking: f.loud, hiss: f.hiss, cog: f.cog })
            }
          }, 40)
          return true
        }
        meter.stop()
      }
    }
    const ok = await rhythm.start()
    S.mode = ok ? 'rhythm' : 'off'
    return !!ok
  }, [meter, rhythm])

  const stop = useCallback(() => {
    const S = st.current
    stopTimer()
    if (S.mode === 'judge') meter.stop()
    if (S.mode === 'rhythm') rhythm.stop()
    S.mode = 'off'; S.active = false
  }, [meter, rhythm])

  useEffect(() => () => stopTimer(), [])

  const setWindowActive = useCallback((v) => { st.current.active = !!v; rhythm.setWindowActive(v) }, [rhythm])
  const markWord = useCallback((i) => { st.current.marks.push({ i, t: performance.now() }); rhythm.markWord(i) }, [rhythm])
  const resetCounters = useCallback(() => { st.current.frames = []; st.current.marks = []; rhythm.resetCounters() }, [rhythm])
  const mode = useCallback(() => st.current.mode, [])

  // words: słowa rundy/zdania. perWord: true = głoski oceniane osobno w każdym słowie (SZ Lip Shape),
  // false = w całym zdaniu naraz (Speech Rhythm — słowa płyną jedno za drugim).
  const getResult = useCallback((words, { perWord = false, lagMs = 0, minFrac = 0.45, minMs = 100 } = {}) => {
    const S = st.current
    const n = words.length
    const opts = { lagMs, minFrac, minMs }
    const heard = S.mode === 'judge' ? scoreWords(S.frames, S.marks, n, opts) : rhythm.getHeard(n, opts)
    const heardCount = heard.filter(Boolean).length
    const presence = n > 0 ? heardCount / n : 0
    const details = words.map((w, i) => ({ word: w, heard: heard[i], sound: null }))
    let sounds = null

    if (S.mode === 'judge' && heardCount > 0) {
      if (perWord) {
        let need = 0, ok = 0
        const startOf = (i) => { for (let k = S.marks.length - 1; k >= 0; k--) if (S.marks[k].i === i) return S.marks[k].t; return null }
        words.forEach((w, i) => {
          const exp = parseSibilants(w)
          if (exp.L === 0) return
          need++
          const s = startOf(i), e = startOf(i + 1)
          if (s == null) { details[i].sound = 'none'; return }
          const fr = S.frames.filter(f => f.t >= s && (e == null || e <= s || f.t < e))
          const v = judgeUtterance(analyseFrames(fr), exp, S.th, 'normal').verdict
          details[i].sound = v === 'pass' ? 'ok' : v === 'fail' ? 's' : 'none'
          if (v === 'pass') ok++
        })
        if (need > 0) sounds = { ok, need }
      } else {
        const need = words.reduce((a, w) => a + parseSibilants(w).L, 0)
        if (need > 0) {
          let dL = 0
          for (const seg of analyseFrames(S.frames)) if (classifyValue(seg.cog, S.th, 0.25) === 'sz') dL++
          sounds = { ok: Math.min(dL, need), need }
        }
      }
    }
    const ratio = sounds ? 0.5 * presence + 0.5 * (sounds.ok / sounds.need) : presence
    return { ratio, presence, heardCount, wordCount: n, sounds, details, mode: S.mode }
  }, [rhythm])

  return useMemo(() => ({ start, stop, setWindowActive, markWord, resetCounters, getResult, mode }),
    [start, stop, setWindowActive, markWord, resetCounters, getResult, mode])
}
