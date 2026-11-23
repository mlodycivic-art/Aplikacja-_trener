// Które słowa były „powiedziane w swoim czasie”.
//   frames: [{ t, dt, speaking }] — tylko z czasu, gdy okno słuchania było otwarte
//   marks:  [{ i, t }]            — kiedy zaczęło się słowo i
// Słowo zaliczone, gdy głos było słychać przez minFrac jego czasu (nie mniej niż minMs).
// lagMs: dziecko zwykle mówi odrobinę po podkreśleniu — tyle „spóźnienia” jeszcze liczymy do słowa.
export function scoreWords(frames, marks, n, { lagMs = 0, minFrac = 0.45, minMs = 100 } = {}) {
  const startOf = (i) => { for (let k = marks.length - 1; k >= 0; k--) if (marks[k].i === i) return marks[k].t; return null }
  const heard = []
  for (let i = 0; i < n; i++) {
    const s = startOf(i)
    if (s == null) { heard.push(false); continue }
    const nextS = startOf(i + 1)
    const e = nextS != null && nextS > s ? nextS : Infinity
    let win = 0, sp = 0
    for (const f of frames) {
      if (f.t < s) continue
      if (f.t < e) win += f.dt
      if (f.t < e + lagMs && f.speaking) sp += f.dt
    }
    heard.push(win > 0 && sp >= Math.min(win * 0.8, Math.max(minMs, win * minFrac)))
  }
  return heard
}

