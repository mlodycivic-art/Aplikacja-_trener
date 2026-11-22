// Animowana twarz do „Gimnastyki buzi i języka”: widok z przodu (nos i usta) i przekrój z boku (profil z prawej).
//
// Twarz nie jest zestawem gotowych rysunków, tylko jednym rysunkiem sterowanym „pozą” — liczbami 0–1:
//   jaw      otwarcie żuchwy            lipGap   rozchylenie warg (bez otwierania żuchwy: uśmiech z zębami)
//   smile    uśmiech                    pucker   dzióbek
//   cheek    nadęte policzki            tongueUp szeroki język za górnymi zębami (winda)
//   tongueCup koszyczek (brzegi języka w górę)
//   tip      czubek języka dotyka zębów; tipX: -1 lewo … 1 prawo, tipY: -1 górne zęby … 1 dolne
//   straw    rurka nad górną wargą (wąsy)   breath  chuchanie (faza 0–1)   heart  całus (faza 0–1)
//   palateUp podniesione podniebienie miękkie (ziewanie)    say  napis w dymku (śmiech)
// Ćwiczenie to lista klatek kluczowych (data/gymExercises.js); usePoseLoop płynnie przechodzi między nimi.

import { useEffect, useId, useRef, useState } from 'react'

const OUT = '#1A1410', SKIN = '#E8B48A', SHADE = '#C98F63', LIGHT = '#FFD3B0'
const LIP = '#C9414F', LIP_D = '#9E2B3C', LIP_HI = '#F4A0A8'
const TONGUE = '#F0708A', TONGUE_D = '#C74C69', TONGUE_U = '#E0607C', DARK = '#4A1420', GUM = '#E07085', PALATE = '#D45F76'

export const NEUTRAL = {
  jaw: 0, lipGap: 0, smile: 0, pucker: 0, cheek: 0, tongueUp: 0, tongueCup: 0,
  tip: 0, tipX: 0, tipY: -1, straw: 0, breath: 0, heart: 0, palateUp: 0,
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const f1 = (v) => Math.round(v * 10) / 10

// ── Ścieżki SVG jako listy punktów (żeby dało się je przekształcać i płynnie mieszać) ──
function parse(d) {
  const tok = d.match(/[MCLQZ]|-?\d*\.?\d+/g)
  const segs = []
  let cur = null
  for (const t of tok) {
    if (/[MCLQZ]/.test(t)) { cur = [t]; segs.push(cur) } else cur.push(Number(t))
  }
  return segs
}
function build(segs, fn) {
  return segs.map(s => {
    if (s[0] === 'Z') return 'Z'
    const out = [s[0]]
    for (let i = 1; i < s.length; i += 2) {
      const [x, y] = fn ? fn(s[i], s[i + 1]) : [s[i], s[i + 1]]
      out.push(f1(x), f1(y))
    }
    return out.join(' ')
  }).join(' ')
}
const mix = (a, b, t) => a.map((s, i) => (s[0] === 'Z' ? s : [s[0], ...s.slice(1).map((v, j) => lerp(v, b[i][j + 1], t))]))

// ── Płynna pętla animacji ─────────────────────────────────────────────────────
const ease = (t) => t * t * (3 - 2 * t)
export function poseAt(keys, t) {
  if (!keys || !keys.length) return { ...NEUTRAL }
  let i = 0
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)]
  const span = b.t - a.t
  const s = span > 0 ? ease(clamp((t - a.t) / span)) : 0
  const pose = {}
  for (const k of Object.keys(NEUTRAL)) pose[k] = lerp(a[k] ?? NEUTRAL[k], b[k] ?? NEUTRAL[k], s)
  pose.say = a.say || null
  return pose
}

// keys: klatki kluczowe; cycleMs: długość jednego powtórzenia; onCycle(n) po każdym pełnym powtórzeniu.
export function usePoseLoop(keys, cycleMs, playing, onCycle) {
  const [pose, setPose] = useState(() => poseAt(keys, 0))
  const st = useRef({ acc: 0, last: 0, cycles: 0 })
  const cb = useRef(onCycle); cb.current = onCycle
  useEffect(() => { st.current = { acc: 0, last: 0, cycles: 0 }; setPose(poseAt(keys, 0)) }, [keys, cycleMs])
  useEffect(() => {
    if (!playing) { st.current.last = 0; return }
    let raf
    const frame = (now) => {
      const s = st.current
      if (s.last) s.acc += Math.min(100, now - s.last)
      s.last = now
      const n = Math.floor(s.acc / cycleMs)
      if (n > s.cycles) { s.cycles = n; cb.current?.(n) }
      setPose(poseAt(keys, (s.acc % cycleMs) / cycleMs))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [keys, cycleMs, playing])
  return pose
}

const heartPath = (x, y, k) => `M${f1(x)} ${f1(y + 6 * k)} C${f1(x - 14 * k)} ${f1(y - 6 * k)} ${f1(x - 10 * k)} ${f1(y - 18 * k)} ${f1(x)} ${f1(y - 10 * k)} C${f1(x + 10 * k)} ${f1(y - 18 * k)} ${f1(x + 14 * k)} ${f1(y - 6 * k)} ${f1(x)} ${f1(y + 6 * k)} Z`

// ── WIDOK Z PRZODU ───────────────────────────────────────────────────────────
const CX = 140, CY = 212
// po 8 zębów: [x od środka, szerokość, uniesienie łuku na bokach]
function teethRow(widths, arch) {
  const total = widths.reduce((a, b) => a + b, 0)
  let x = -total / 2
  return widths.map((wd, i) => { const r = [x, wd, arch[i]]; x += wd; return r })
}
const UPPER_TEETH = teethRow([16, 18, 20, 23, 23, 20, 18, 16], [12, 6, 2, 0, 0, 2, 6, 12])
const LOWER_TEETH = teethRow([15, 16, 18, 19, 19, 18, 16, 15], [10, 5, 1, 0, 0, 1, 5, 10])
// środki zębów jako tipX (-1…1) — do ćwiczenia „Liczenie zębów”
export const TOOTH_X = UPPER_TEETH.map(([x, wd]) => Math.round(((x + wd / 2) / 66) * 100) / 100)

// Kontur ust: rogi ostre przy uśmiechu, zaokrąglone przy dzióbku (pk)
function halfTop(w, top, yc, k, pk, fromLeft) {
  const kk = lerp(k, 1, pk), ty = lerp(top, yc + (top - yc) * 0.55, pk)
  return fromLeft
    ? `C${f1(CX - w * kk)} ${f1(ty)} ${f1(CX - w * 0.4)} ${f1(top)} ${CX} ${f1(top)} C${f1(CX + w * 0.4)} ${f1(top)} ${f1(CX + w * kk)} ${f1(ty)} ${f1(CX + w)} ${f1(yc)}`
    : `C${f1(CX + w * kk)} ${f1(ty)} ${f1(CX + w * 0.4)} ${f1(top)} ${CX} ${f1(top)} C${f1(CX - w * 0.4)} ${f1(top)} ${f1(CX - w * kk)} ${f1(ty)} ${f1(CX - w)} ${f1(yc)}`
}
// górny kontur wargi z „łukiem Kupidyna” (dołek pośrodku), słabszym przy dzióbku
function bowTop(w, top, yc, k, pk) {
  const kk = lerp(k, 1, pk), ty = lerp(top, yc + (top - yc) * 0.55, pk)
  const dip = 5 * (1 - pk), px = 18
  return `C${f1(CX - w * kk)} ${f1(ty)} ${f1(CX - w * 0.5)} ${f1(top)} ${f1(CX - px)} ${f1(top)} `
    + `C${f1(CX - 8)} ${f1(top)} ${f1(CX - 4)} ${f1(top + dip)} ${CX} ${f1(top + dip)} `
    + `C${f1(CX + 4)} ${f1(top + dip)} ${f1(CX + 8)} ${f1(top)} ${f1(CX + px)} ${f1(top)} `
    + `C${f1(CX + w * 0.5)} ${f1(top)} ${f1(CX + w * kk)} ${f1(ty)} ${f1(CX + w)} ${f1(yc)}`
}
function mouthShape(w, top, bot, yc, k, pk) {
  return `M${f1(CX - w)} ${f1(yc)} ${halfTop(w, top, yc, k, pk, true)} ${halfTop(w, bot, yc, k, pk, false)} Z`
}

export function FaceFront({ pose: p }) {
  const id = useId().replace(/:/g, '')
  const jaw = clamp(p.jaw), gap = clamp(p.lipGap), sm = clamp(p.smile), pk = clamp(p.pucker)
  const w = 66 + sm * 22 - pk * 30 + jaw * 10
  const yc = CY - sm * 12 + jaw * 12
  // w uśmiechu z rozchylonymi wargami górna warga podnosi się, odsłaniając całe górne zęby
  const inTop = CY - (1.5 + gap * 12 + gap * sm * 16 + jaw * 32) * (1 - pk * 0.4) - pk * 5
  const inBot = CY + (1.5 + gap * 12 + gap * sm * 10 + jaw * 58) * (1 - pk * 0.3) + pk * 5
  const tU = 15 + pk * 9 - sm * 5, tL = 18 + pk * 9 - sm * 3
  const ow = w + 14 - pk * 2, oTop = inTop - tU, oBot = inBot + tL
  const k = 0.85 - pk * 0.35
  const inner = mouthShape(w, inTop, inBot, yc, k, pk)
  const outer = `M${f1(CX - ow)} ${f1(yc)} ${bowTop(ow, oTop, yc, k, pk)} ${halfTop(ow, oBot, yc, k, pk, false)} Z`
  const upperLip = `M${f1(CX - ow)} ${f1(yc)} ${bowTop(ow, oTop, yc, k, pk)} L${f1(CX + w)} ${f1(yc)} ${halfTop(w, inTop, yc, k, pk, false)} Z`

  // przy zamkniętej żuchwie górne zęby lekko zachodzą na dolne (jak w zgryzie)
  const lowTop = CY - 1 + jaw * 58
  const u = clamp(p.tongueUp), cup = clamp(p.tongueCup), tip = clamp(p.tip)
  const Lx = CX - lerp(64, 66, u), Ly = lerp(lowTop + 12, CY - 4, u)
  const ay = lerp(lowTop - 28, CY - 36, u)
  const b1x = lerp(58, 60, u), b1y = lerp(lowTop + 34, lowTop + 8, u), by = lerp(lowTop + 36, lowTop + 12, u)
  const tongue = `M${f1(Lx)} ${f1(Ly)} Q${CX} ${f1(ay)} ${f1(2 * CX - Lx)} ${f1(Ly)} Q${f1(CX + b1x)} ${f1(b1y)} ${CX} ${f1(by)} Q${f1(CX - b1x)} ${f1(b1y)} ${f1(Lx)} ${f1(Ly)} Z`
  const under = `M${CX - 54} ${f1(Ly + 10)} Q${CX} ${CY - 14} ${CX + 54} ${f1(Ly + 10)} Q${CX + 48} ${f1(lowTop + 2)} ${CX} ${f1(lowTop + 6)} Q${CX - 48} ${f1(lowTop + 2)} ${CX - 54} ${f1(Ly + 10)} Z`
  const r = clamp((p.tipY + 1) / 2)
  const tx = clamp(p.tipX, -1, 1), Tx = CX + tx * lerp(64, 50, r)   // dolne skrajne zęby chowają się za kącikami ust
  // czubek: górne zęby (od środka ust, tuż pod brzegiem), środek ust, dolne zęby (tuż nad brzegiem)
  const Ty = lerp(CY - 2 - 12 * tx * tx, lowTop - 10 + 8 * tx * tx, r)
  const baseY = lowTop + 30, mid = (Ty + baseY) / 2
  const tipShape = `M${CX - 34} ${f1(baseY)} C${CX - 30} ${f1(mid)} ${f1(Tx - 12)} ${f1(Ty + 16)} ${f1(Tx - 8)} ${f1(Ty + 4)} Q${f1(Tx)} ${f1(Ty - 9)} ${f1(Tx + 8)} ${f1(Ty + 4)} C${f1(Tx + 12)} ${f1(Ty + 16)} ${CX + 30} ${f1(mid)} ${CX + 34} ${f1(baseY)} Z`
  const uvY = CY - 22 + jaw * 6 - clamp(p.palateUp) * 10
  const ch = clamp(p.cheek)
  const strawY = oTop - 28
  const ht = clamp(p.heart), br = clamp(p.breath)

  return (
    <svg viewBox="0 0 280 360" width="100%" role="img" aria-label="Usta z przodu" style={{ display: 'block' }}>
      <defs>
        <clipPath id={`${id}p`}><rect x="0" y="0" width="280" height="360" rx="12" /></clipPath>
        <clipPath id={`${id}m`}><path d={inner} /></clipPath>
      </defs>
      <g clipPath={`url(#${id}p)`}>
        <rect width="280" height="360" fill={SKIN} />
        <path d="M240 0 L280 0 L280 360 L214 360 C250 300 260 220 254 140 C250 80 244 40 240 0 Z" fill={SHADE} />
        <path d="M0 300 C40 344 90 358 140 360 L0 360 Z" fill={SHADE} />
        {ch > 0.01 && (<g opacity={clamp(ch * 1.6)}>
          <ellipse cx="4" cy="226" rx={f1(8 + ch * 32)} ry={f1(58 + ch * 12)} fill="#F4C6A2" stroke={OUT} strokeWidth="4" />
          <ellipse cx="276" cy="226" rx={f1(8 + ch * 32)} ry={f1(58 + ch * 12)} fill="#DDA27A" stroke={OUT} strokeWidth="4" />
          <path d={`M${f1(14 + ch * 6)} 200 q8 -10 18 -4`} fill="none" stroke="#FFF1E6" strokeWidth="4" strokeLinecap="round" />
        </g>)}
        <path d="M160 0 L154 64 C174 70 182 84 174 96 C170 102 162 102 154 100 L156 0 Z" fill={SHADE} />
        <path d="M126 0 L118 64 C100 70 96 90 112 98 C122 102 132 97 140 101 C148 97 158 102 168 98 C184 90 180 70 162 64 L154 0" fill="none" stroke={OUT} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        <ellipse cx="128" cy="90" rx="8" ry="4" fill="#4A2016" /><ellipse cx="152" cy="90" rx="8" ry="4" fill="#4A2016" />
        <path d="M132 110 L130 134 M148 110 L150 134" stroke={SHADE} strokeWidth="5" strokeLinecap="round" />

        <g clipPath={`url(#${id}m)`}>
          <rect x="40" y="120" width="200" height="200" fill={DARK} />
          <path d={`M${CX - 62} ${f1(CY - 2 - p.palateUp * 8)} Q${CX} ${f1(CY - 42 - p.palateUp * 10)} ${CX + 62} ${f1(CY - 2 - p.palateUp * 8)} L${CX + 62} ${CY - 70} L${CX - 62} ${CY - 70} Z`} fill={PALATE} />
          <path d={`M${CX - 8} ${f1(uvY)} C${CX - 8} ${f1(uvY + 14)} ${CX - 4} ${f1(uvY + 22)} ${CX} ${f1(uvY + 24)} C${CX + 4} ${f1(uvY + 22)} ${CX + 8} ${f1(uvY + 14)} ${CX + 8} ${f1(uvY)} Z`} fill={GUM} stroke={OUT} strokeWidth="3" />
          <ellipse cx={CX - 58} cy={f1(CY + 16 + jaw * 10)} rx="8" ry="13" fill={PALATE} />
          <ellipse cx={CX + 58} cy={f1(CY + 16 + jaw * 10)} rx="8" ry="13" fill={PALATE} />
          <g opacity={f1(1 - tip)}>
            <path d={tongue} fill={TONGUE} stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
            <path d={`M${CX} ${f1(lowTop - 6)} L${CX} ${f1(lowTop + 22)}`} stroke={TONGUE_D} strokeWidth="4" strokeLinecap="round" opacity={f1(1 - u)} />
            <g opacity={f1(clamp((u - 0.45) * 2.5))}>
              <path d={under} fill={TONGUE_U} />
              <path d={`M${CX} ${f1(Ly + 8)} L${CX} ${f1(lowTop + 4)}`} stroke="#FFC9D4" strokeWidth="5" strokeLinecap="round" />
              <path d={`M${CX - 20} ${f1(Ly + 14)} q-6 16 2 30 M${CX + 20} ${f1(Ly + 14)} q6 16 -2 30`} fill="none" stroke="#8E2C45" strokeWidth="3" strokeLinecap="round" />
            </g>
            {/* koszyczek: brzegi języka zawinięte do góry — z przodu widać je jako wałki po bokach spodu języka */}
            <g opacity={f1(cup * clamp(u * 1.5))}>
              <path d={`M${CX - 66} ${f1(Ly)} C${CX - 72} ${f1(Ly + 22)} ${CX - 64} ${f1(lowTop - 4)} ${CX - 48} ${f1(lowTop)} C${CX - 44} ${f1(lowTop - 20)} ${CX - 48} ${f1(Ly + 18)} ${CX - 52} ${f1(Ly + 2)} Z`} fill="#F7A0B3" stroke={OUT} strokeWidth="3.5" strokeLinejoin="round" />
              <path d={`M${CX + 66} ${f1(Ly)} C${CX + 72} ${f1(Ly + 22)} ${CX + 64} ${f1(lowTop - 4)} ${CX + 48} ${f1(lowTop)} C${CX + 44} ${f1(lowTop - 20)} ${CX + 48} ${f1(Ly + 18)} ${CX + 52} ${f1(Ly + 2)} Z`} fill="#F7A0B3" stroke={OUT} strokeWidth="3.5" strokeLinejoin="round" />
              <ellipse cx={CX} cy={f1((Ly + lowTop) / 2 + 4)} rx="26" ry="16" fill={TONGUE_D} opacity="0.55" />
            </g>
          </g>
          {tip > 0.01 && <path d={tipShape} fill={TONGUE} stroke={OUT} strokeWidth="4" strokeLinejoin="round" opacity={f1(tip)} />}
          <g fill="#FFFFFF" stroke={OUT} strokeWidth="3">
            {LOWER_TEETH.map(([x, wd, a], i) => <rect key={`l${i}`} x={f1(CX + x)} y={f1(lowTop + a)} width={wd} height="20" rx="6" />)}
            {UPPER_TEETH.map(([x, wd, a], i) => <rect key={`u${i}`} x={f1(CX + x)} y={f1(CY - 26 - a)} width={wd} height="23" rx="6" />)}
          </g>
          <g stroke="#DCE3F0" strokeWidth="2.5" strokeLinecap="round">
            {UPPER_TEETH.map(([x, wd, a], i) => <path key={i} d={`M${f1(CX + x + wd * 0.35)} ${f1(CY - 20 - a)} V${f1(CY - 11 - a)}`} />)}
          </g>
        </g>

        <path d={`${outer} ${inner}`} fillRule="evenodd" fill={LIP} stroke={OUT} strokeWidth="4.5" strokeLinejoin="round" />
        <path d={upperLip} fill={LIP_D} />
        <path d={`M${CX - 28} ${f1(oBot - 8)} Q${CX} ${f1(oBot - 4)} ${CX + 24} ${f1(oBot - 8)}`} fill="none" stroke={LIP_HI} strokeWidth="5" strokeLinecap="round" />
        <path d={`${outer}`} fill="none" stroke={OUT} strokeWidth="4.5" strokeLinejoin="round" />
        {sm > 0.05 && <path d={`M${f1(CX - ow - 6)} ${f1(yc - 10)} q-6 10 0 20 M${f1(CX + ow + 6)} ${f1(yc - 10)} q6 10 0 20`} fill="none" stroke={OUT} strokeWidth="4" strokeLinecap="round" opacity={f1(sm)} />}

        {p.straw > 0.01 && (<g opacity={f1(clamp(p.straw))}>
          <rect x="4" y={f1(strawY)} width="272" height="14" rx="7" fill="#FFD23F" stroke={OUT} strokeWidth="4" />
          <path d={`M40 ${f1(strawY + 3)} l10 8 M90 ${f1(strawY + 3)} l10 8 M180 ${f1(strawY + 3)} l10 8 M230 ${f1(strawY + 3)} l10 8`} stroke="#F08A24" strokeWidth="4" strokeLinecap="round" />
        </g>)}
        {ht > 0.02 && ht < 0.98 && <path d={heartPath(CX + 20 + ht * 80, CY - 40 - ht * 120, 1.4 + ht * 1.2)} fill="#E23A4E" stroke={OUT} strokeWidth="3" opacity={f1(Math.sin(Math.PI * ht))} />}
        {br > 0.02 && br < 0.98 && [-26, 0, 26].map((dx, i) => (
          <circle key={i} cx={CX + dx * (1 + br)} cy={f1(inTop - 6 - br * 70 - i * 6)} r={f1(8 + br * 14)} fill="#EAF6FF" stroke="#7FA3C8" strokeWidth="3" opacity={f1((1 - br) * 0.9)} />
        ))}
        {p.say && (<g>
          <path d="M168 18 H268 Q274 18 274 24 V56 Q274 62 268 62 H200 L186 76 L188 62 H168 Q162 62 162 56 V24 Q162 18 168 18 Z" fill="#FFFFFF" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
          <text x="218" y="48" textAnchor="middle" fontSize="22" fontWeight="800" fill={OUT} fontFamily="inherit">{p.say}</text>
        </g>)}
      </g>
      <rect x="2" y="2" width="276" height="356" rx="12" fill="none" stroke={OUT} strokeWidth="5" />
    </svg>
  )
}

// ── PRZEKRÓJ Z BOKU (twarz zwrócona w prawo) ─────────────────────────────────
const S = {
  noseLine: 'M192 0 C198 32 214 60 244 82 C252 90 248 100 236 101 L214 102',
  fixedSkin: 'M0 0 L192 0 C198 32 214 60 244 82 C252 90 248 100 236 101 L214 102 C206 110 201 120 200 130 L200 140 L188 146 C180 138 172 135 162 138 C140 128 112 126 94 138 C80 148 76 174 80 198 L66 236 L40 360 L0 360 Z',
  cavity: 'M188 146 C180 138 172 135 162 138 C140 128 112 126 94 138 C80 148 76 174 80 198 C84 226 102 246 130 248 C156 250 176 236 188 222 L200 222 L200 140 Z',
  palate: 'M180 140 C172 135 168 135 162 138 C140 128 112 126 94 138 C80 148 76 174 80 198',
  upperGum: 'M176 138 C184 126 198 126 206 132 L206 142 C198 137 188 137 180 144 Z',
  upperTooth: 'M184 136 L200 136 C202 146 201 156 197 163 C195 167 190 167 189 164 C187 157 185 151 184 147 C181 144 181 139 184 136 Z',
  upperLip: 'M214 102 C228 108 234 120 232 132 C230 142 222 148 212 148 C206 148 201 144 200 138 C199 126 204 112 214 102 Z',
  upperLipLine: 'M214 102 C228 108 234 120 232 132 C230 142 222 148 212 148 C206 148 201 144 200 138',
  upperLipShade: 'M201 136 C206 144 216 146 224 142 C220 147 216 148 212 148 C206 148 202 144 201 136 Z',
  upperLipHi: 'M218 112 C224 116 228 122 228 128',
  jawSkin: 'M188 222 C176 236 156 250 130 248 C102 246 84 226 80 198 L66 236 L40 360 L134 360 L140 344 C170 340 200 334 212 322 C224 308 222 290 212 276 C208 270 208 264 214 258 L200 222 Z',
  floor: 'M80 198 C84 226 102 246 130 248 C156 250 176 236 188 222',
  lowerGum: 'M178 222 C186 232 198 232 206 224 L206 214 C198 218 188 218 180 214 Z',
  lowerTooth: 'M185 220 L201 220 C202 211 201 203 198 197 C196 193 191 193 190 196 C188 202 186 207 185 211 C182 214 182 217 185 220 Z',
  lowerLip: 'M212 218 C224 218 234 226 234 238 C234 250 224 258 214 258 C206 256 201 250 200 242 C199 230 204 220 212 218 Z',
  lowerLipShade: 'M201 232 C204 224 210 220 218 220 C212 222 206 226 202 236 Z',
  lowerLipHi: 'M216 248 C222 246 228 242 230 236',
  lowerLine: 'M200 242 C199 230 204 220 212 218 C224 218 234 226 234 238 C234 250 224 258 214 258 C208 264 208 270 212 276 C222 290 224 308 212 322 C200 334 170 340 140 344 L134 360',
  tongueLow: 'M92 230 C86 200 106 186 136 188 C160 190 174 198 178 208 C174 222 162 230 144 236 C124 242 102 246 92 230 Z',
  tongueUp: 'M92 230 C82 192 102 156 134 148 C152 142 166 140 176 148 C174 160 160 170 146 180 C126 196 106 242 92 230 Z',
  uvula: 'M98 138 C92 144 90 156 96 162 C100 158 100 148 106 140 Z',
}
const SP = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, parse(v)]))

export function FaceSide({ pose: p }) {
  const id = useId().replace(/:/g, '')
  const jaw = clamp(p.jaw), gap = clamp(p.lipGap), sm = clamp(p.smile), pk = clamp(p.pucker)
  // Żuchwa: rysunek bazowy jest otwarty; zamknięcie podnosi punkty z przodu bardziej niż z tyłu i u dołu brody mniej
  const jd = (x, y) => [x, y - (1 - jaw) * 27 * clamp((x - 60) / 130) * clamp((345 - y) / 90)]
  const closeAmt = 1 - clamp(gap * 0.65 + jaw)
  const fwd = (x) => (pk * 12 - sm * 5) * clamp((x - 198) / 34)
  const upLip = (x, y) => [x + fwd(x), y + closeAmt * 20 * clamp((y - 100) / 48)]
  const lowLip = (x, y) => { const [a, b] = jd(x, y); return [a + fwd(x), b - closeAmt * 23 * clamp((300 - y) / 38)] }

  const u = clamp(p.tongueUp), tip = clamp(p.tip), r = clamp((p.tipY + 1) / 2)
  // przy zamkniętej buzi język leży przy podniebieniu (pozycja spoczynkowa); przy otwartej opada, chyba że ćwiczenie go unosi
  const us = Math.max(u, tip * (1 - r) * 0.9, (1 - jaw) * 0.85)
  const tShift = -Math.abs(clamp(p.tipX, -1, 1)) * 12 * tip
  const tongue = build(mix(SP.tongueLow, SP.tongueUp, us), (x, y) => { const [a, b] = jd(x, y); return [a + tShift * clamp((x - 120) / 60), b] })
  const ch = clamp(p.cheek), ht = clamp(p.heart), br = clamp(p.breath)
  const mouthY = 180 - closeAmt * 10

  return (
    <svg viewBox="0 0 280 360" width="100%" role="img" aria-label="Przekrój z boku" style={{ display: 'block' }}>
      <defs><clipPath id={`${id}p`}><rect x="0" y="0" width="280" height="360" rx="12" /></clipPath></defs>
      <g clipPath={`url(#${id}p)`}>
        <rect width="280" height="360" fill="#9FD3F2" />
        <path d="M0 0 L110 0 L0 110 Z" fill="#C4E4F7" />
        <path d={S.fixedSkin} fill={SKIN} />
        <path d="M192 0 C198 32 214 60 244 82 C230 78 212 64 202 46 Z" fill={LIGHT} />
        <path d={S.cavity} fill={DARK} />
        <path d={S.uvula} transform={`translate(0 ${f1(-clamp(p.palateUp) * 6)})`} fill={GUM} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
        <path d={tongue} fill={TONGUE} stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
        {p.tongueCup > 0.01 && <path d={build(parse('M108 172 C120 154 140 144 162 142'), jd)} fill="none" stroke="#FF9AB0" strokeWidth="5" strokeLinecap="round" opacity={f1(clamp(p.tongueCup) * u)} />}
        <path d={S.palate} fill="none" stroke={OUT} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />

        <path d={build(SP.jawSkin, jd)} fill={SKIN} />
        <path d="M0 262 C60 292 110 322 140 344 L134 360 L0 360 Z" fill={SHADE} />
        <path d={build(SP.floor, jd)} fill="none" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
        <path d={build(SP.lowerTooth, jd)} fill="#FFFFFF" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
        <path d={build(SP.lowerGum, jd)} fill={GUM} stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
        <path d={build(SP.lowerLip, lowLip)} fill={LIP} />
        <path d={build(SP.lowerLipShade, lowLip)} fill={LIP_D} />
        <path d={build(SP.lowerLipHi, lowLip)} fill="none" stroke={LIP_HI} strokeWidth="4" strokeLinecap="round" />
        <path d={build(SP.lowerLine, (x, y) => (y < 262 ? lowLip(x, y) : (() => { const [a, b] = jd(x, y); const w = clamp((300 - y) / 38); return [a + fwd(x) * w, b - closeAmt * 23 * w] })()))} fill="none" stroke={OUT} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />

        <path d={S.upperTooth} fill="#FFFFFF" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
        <path d={S.upperGum} fill={GUM} stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
        <path d={build(SP.upperLip, upLip)} fill={LIP} />
        <path d={build(SP.upperLipShade, upLip)} fill={LIP_D} />
        <path d={build(SP.upperLipHi, upLip)} fill="none" stroke={LIP_HI} strokeWidth="4" strokeLinecap="round" />
        <path d={S.noseLine} fill="none" stroke={OUT} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={build(SP.upperLipLine, upLip)} fill="none" stroke={OUT} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M226 94 Q216 92 214 84" fill="none" stroke={OUT} strokeWidth="4" strokeLinecap="round" />

        {ch > 0.01 && <ellipse cx="162" cy="196" rx={f1(6 + ch * 34)} ry={f1(6 + ch * 40)} fill="#FFE7D6" stroke={OUT} strokeWidth="3" strokeDasharray="7 5" opacity={f1(clamp(ch * 1.4) * 0.75)} />}
        {p.straw > 0.01 && (<g opacity={f1(clamp(p.straw))}>
          <circle cx={f1(223 + pk * 6)} cy={f1(109 - pk * 3)} r="8" fill="#FFD23F" stroke={OUT} strokeWidth="3.5" />
          <circle cx={f1(223 + pk * 6)} cy={f1(109 - pk * 3)} r="3" fill="#7A4A10" />
        </g>)}
        {(u > 0.6 || (tip > 0.5 && r < 0.5)) && <circle cx="174" cy="148" r="10" fill="none" stroke="#FFD23F" strokeWidth="4" opacity={f1(Math.max(clamp((u - 0.6) * 2.5), clamp((tip - 0.5) * 2) * (1 - r)))} />}
        {ht > 0.02 && ht < 0.98 && <path d={heartPath(240 + ht * 26, mouthY - ht * 110, 1.2 + ht)} fill="#E23A4E" stroke={OUT} strokeWidth="3" opacity={f1(Math.sin(Math.PI * ht))} />}
        {br > 0.02 && br < 0.98 && [0, 1, 2].map(i => (
          <circle key={i} cx={f1(244 + br * 30 + i * 8)} cy={f1(mouthY - i * 8)} r={f1(5 + br * 10)} fill="#FFFFFF" stroke="#9FB8D8" strokeWidth="3" opacity={f1((1 - br) * 0.85)} />
        ))}
      </g>
      <rect x="2" y="2" width="276" height="356" rx="12" fill="none" stroke={OUT} strokeWidth="5" />
    </svg>
  )
}

// Oba widoki obok siebie, z podpisami
export function FacePair({ pose }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div><FaceFront pose={pose} /><div className="text-muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 4 }}>Z przodu</div></div>
      <div><FaceSide pose={pose} /><div className="text-muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 4 }}>Z boku, w przekroju</div></div>
    </div>
  )
}
