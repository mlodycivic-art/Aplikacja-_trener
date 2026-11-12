// Wykrywanie pojedynczej wypowiedzi w strumieniu ramek miernika (bez naciskania przycisków):
// początek = pierwsza "głośna" ramka, koniec = END_SILENCE_MS ciszy. Zwraca ramki wypowiedzi
// z czasem liczonym od jej początku — gotowe do analyseFrames().

const END_SILENCE_MS = 650
const MIN_UTTER_MS   = 220
const MAX_UTTER_MS   = 7000

export function createUtteranceReader(meter) {
  let lastT = performance.now()
  let utter = null
  return {
    reset() { lastT = performance.now(); utter = null },
    // wywoływać cyklicznie; zwraca tablicę ramek zakończonej wypowiedzi albo null
    poll() {
      const now = performance.now()
      for (const f of meter.getFrames()) {
        if (f.t <= lastT) continue
        lastT = f.t
        if (!utter) { if (f.loud) utter = { startT: f.t, lastLoudT: f.t, frames: [f] }; continue }
        utter.frames.push(f)
        if (f.loud) utter.lastLoudT = f.t
      }
      if (!utter) return null
      if (now - utter.lastLoudT > END_SILENCE_MS || now - utter.startT > MAX_UTTER_MS) {
        const u = utter
        utter = null
        if (u.lastLoudT - u.startT < MIN_UTTER_MS) return null
        return u.frames.map(f => ({ ...f, t: f.t - u.startT }))
      }
      return null
    },
    isSpeaking() { return !!utter },
  }
}
