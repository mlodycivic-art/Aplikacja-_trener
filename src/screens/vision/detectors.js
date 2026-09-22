// Wspólne funkcje analizy landmarków twarzy (MediaPipe FaceLandmarker),
// używane przez wszystkie kroki kalibracji wizyjnej.

export function getFaceBBox(points, canvas) {
  let minX = 1, maxX = 0, minY = 1, maxY = 0
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return {
    minX: minX * canvas.width,
    maxX: maxX * canvas.width,
    minY: minY * canvas.height,
    maxY: maxY * canvas.height,
  }
}

// Czy cała twarz mieści się w prostokątnym obszarze docelowym, wypełnia go
// w rozsądnym stopniu i jest ustawiona prosto (bez przechylenia na bok).
export function checkFaceFramed(points, canvas, target) {
  const {
    cx, cy, halfW, halfH, margin = 6,
    minHeightRatio = 0.75, minWidthRatio = 0.45, maxWidthRatio = 1.05, maxTiltDeg = 12,
  } = target
  const box = getFaceBBox(points, canvas)
  const faceW = box.maxX - box.minX
  const faceH = box.maxY - box.minY

  const targetMinX = cx - halfW + margin
  const targetMaxX = cx + halfW - margin
  const targetMinY = cy - halfH + margin
  const targetMaxY = cy + halfH - margin

  const fullyInside =
    box.minX >= targetMinX && box.maxX <= targetMaxX &&
    box.minY >= targetMinY && box.maxY <= targetMaxY

  const sizeOk =
    faceH >= (halfH * 2) * minHeightRatio &&
    faceW >= (halfW * 2) * minWidthRatio &&
    faceW <= (halfW * 2) * maxWidthRatio

  let uprightOk = true
  const rightEye = points[33]
  const leftEye  = points[263]
  if (rightEye && leftEye) {
    const dx = (leftEye.x - rightEye.x) * canvas.width
    const dy = (leftEye.y - rightEye.y) * canvas.height
    let tiltDeg = Math.atan2(dy, dx) * 180 / Math.PI
    if (tiltDeg > 90) tiltDeg -= 180
    if (tiltDeg <= -90) tiltDeg += 180
    uprightOk = Math.abs(tiltDeg) <= maxTiltDeg
  }

  return { ok: fullyInside && sizeOk && uprightOk, box, faceW, faceH }
}

// Czy usta są naturalnie, spokojnie zamknięte — zamknięte ORAZ nie spięte
// w uśmiechu (kąciki nieuniesione, usta nie rozciągnięte na boki).
export function checkMouthClosed(points, canvas, thresholds = {}) {
  const { aspectMax = 0.12, liftMax = 0.045, widthMax = 1.15 } = thresholds
  const mouthLeft  = points[61]
  const mouthRight = points[291]
  const lipTop     = points[13]
  const lipBottom  = points[14]
  const rightEye   = points[33]
  const leftEye    = points[263]
  if (!mouthLeft || !mouthRight || !lipTop || !lipBottom) {
    return { ok: false, aspect: null }
  }

  const mouthW = Math.hypot(
    (mouthRight.x - mouthLeft.x) * canvas.width,
    (mouthRight.y - mouthLeft.y) * canvas.height,
  )
  const mouthGap = Math.hypot(
    (lipBottom.x - lipTop.x) * canvas.width,
    (lipBottom.y - lipTop.y) * canvas.height,
  )
  const aspect = mouthW > 0 ? mouthGap / mouthW : 1
  const closedEnough = aspect < aspectMax

  // Odległość między zewnętrznymi kącikami oczu — stabilna "linijka" do oceny
  // rozmiaru twarzy, która NIE zmienia się przy uśmiechu (w przeciwieństwie
  // do szerokości ust).
  let notSmiling = true
  let liftRatio  = null
  let widthRatio = null
  if (rightEye && leftEye) {
    const eyeDist = Math.hypot(
      (leftEye.x - rightEye.x) * canvas.width,
      (leftEye.y - rightEye.y) * canvas.height,
    )
    if (eyeDist > 0) {
      const centerY = ((lipTop.y + lipBottom.y) / 2) * canvas.height
      const cornerY = ((mouthLeft.y + mouthRight.y) / 2) * canvas.height
      // Dodatnie = kąciki ust uniesione ponad linię środkową (typowe dla uśmiechu)
      liftRatio  = (centerY - cornerY) / eyeDist
      widthRatio = mouthW / eyeDist
      // Próg dobrany na podstawie realnych pomiarów: neutralna twarz ~-0.015,
      // wyraźny uśmiech ~0.097 — domyślny próg 0.045 daje margines w obie strony.
      notSmiling = liftRatio < liftMax && widthRatio < widthMax
    }
  }

  return {
    ok: closedEnough && notSmiling,
    aspect, closedEnough, liftRatio, widthRatio, notSmiling,
    mouthLeft, mouthRight, lipTop, lipBottom,
  }
}

// Rysowanie pionowego obrysu z zaokrąglonymi rogami (Krok 0 — cała twarz)
export function drawRoundedFrame(ctx, cx, cy, halfW, halfH, cornerR, color) {
  ctx.lineWidth = 6
  ctx.strokeStyle = color
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2, cornerR)
  } else {
    const x = cx - halfW, y = cy - halfH, w = halfW * 2, h = halfH * 2, r = cornerR
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y,     x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x,     y + h, r)
    ctx.arcTo(x,     y + h, x,     y,     r)
    ctx.arcTo(x,     y,     x + w, y,     r)
    ctx.closePath()
  }
  ctx.stroke()
}

// Poziom zaawansowania dzióbka (0-3) na podstawie zwężenia ust i wielkości
// otworu — im mocniej spięte mięśnie, tym mniejsza szerokość i większy,
// wyraźniejszy otwór (widać trochę górnych/dolnych jedynek).
const DEFAULT_PUCKER_THRESHOLDS = {
  level1: { widthMax: 0.48, aspectMin: 0.14, aspectMax: 0.55 },
  level2: { widthMax: 0.44, aspectMin: 0.22, aspectMax: 0.55 },
  level3: { widthMax: 0.40, aspectMin: 0.30, aspectMax: 0.55 },
}

export function getPuckerLevel(widthRatio, aspect, thresholds = DEFAULT_PUCKER_THRESHOLDS) {
  if (widthRatio == null || aspect == null) return 0
  const { level1, level2, level3 } = { ...DEFAULT_PUCKER_THRESHOLDS, ...thresholds }
  // Górna granica otworu odróżnia mały, okrągły otwór dzióbka od szeroko
  // otwartych ust (te miałyby znacznie większy otwór).
  if (widthRatio < level3.widthMax && aspect > level3.aspectMin && aspect < level3.aspectMax) return 3
  if (widthRatio < level2.widthMax && aspect > level2.aspectMin && aspect < level2.aspectMax) return 2
  if (widthRatio < level1.widthMax && aspect > level1.aspectMin && aspect < level1.aspectMax) return 1
  return 0
}

export function puckerLevelColor(level) {
  switch (level) {
    case 3: return '#22C55E'  // zielony
    case 2: return '#3B82F6'  // niebieski
    case 1: return '#FACC15'  // żółty
    default: return '#EF4444' // czerwony
  }
}

// Czy usta tworzą "dzióbek" (węższe niż naturalnie, z niewielkim otworem
// pośrodku) — używane w Kroku 2 (głoska SZ). Zwraca też stopniowany poziom.
export function checkPucker(points, canvas, thresholds) {
  const mouthLeft  = points[61]
  const mouthRight = points[291]
  const lipTop     = points[13]
  const lipBottom  = points[14]
  const rightEye   = points[33]
  const leftEye    = points[263]
  if (!mouthLeft || !mouthRight || !lipTop || !lipBottom || !rightEye || !leftEye) {
    return { level: 0, widthRatio: null, aspect: null }
  }

  const mouthW = Math.hypot(
    (mouthRight.x - mouthLeft.x) * canvas.width,
    (mouthRight.y - mouthLeft.y) * canvas.height,
  )
  const mouthGap = Math.hypot(
    (lipBottom.x - lipTop.x) * canvas.width,
    (lipBottom.y - lipTop.y) * canvas.height,
  )
  const eyeDist = Math.hypot(
    (leftEye.x - rightEye.x) * canvas.width,
    (leftEye.y - rightEye.y) * canvas.height,
  )

  const widthRatio = eyeDist > 0 ? mouthW / eyeDist : 1
  const aspect      = mouthW > 0 ? mouthGap / mouthW : 0
  const level       = getPuckerLevel(widthRatio, aspect, thresholds)

  return {
    level, widthRatio, aspect,
    mouthLeft, mouthRight, lipTop, lipBottom,
  }
}

// Poziom głośności (0-3) na podstawie RMS sygnału z mikrofonu — im głośniej,
// tym wyższy poziom (podobnie jak poziomy dzióbka).
export function getVolumeLevel(rms) {
  if (rms > 0.35) return 3
  if (rms > 0.18) return 2
  if (rms > 0.06) return 1
  return 0
}

// Rysowanie ikony głośnika + fal dźwiękowych — liczba fal zależna od poziomu.
// Rysowane w stałym miejscu (lewy górny róg), niezależnie od pozycji twarzy.
export function drawVolumeIndicator(ctx, level, color) {
  const x = 40
  const y = 40

  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 4

  // Korpus głośnika
  ctx.beginPath()
  ctx.moveTo(x - 16, y - 8)
  ctx.lineTo(x - 7, y - 8)
  ctx.lineTo(x + 6, y - 17)
  ctx.lineTo(x + 6, y + 17)
  ctx.lineTo(x - 7, y + 8)
  ctx.lineTo(x - 16, y + 8)
  ctx.closePath()
  ctx.fill()

  // Fale dźwiękowe — 0 do 3 łuków w zależności od poziomu
  for (let i = 0; i < level; i++) {
    ctx.beginPath()
    ctx.arc(x + 6, y, 13 + i * 9, -0.6, 0.6)
    ctx.stroke()
  }
}
export function drawPuckerCircle(ctx, mouthLeft, mouthRight, lipTop, lipBottom, canvas, color) {
  const cx = ((mouthLeft.x + mouthRight.x) / 2) * canvas.width
  const cy = ((lipTop.y + lipBottom.y) / 2) * canvas.height
  const mouthWidthPx = Math.abs(mouthRight.x - mouthLeft.x) * canvas.width
  const r = Math.max(mouthWidthPx * 0.9, 18)

  ctx.lineWidth = 5
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // Mały punkt pośrodku — wskazówka, gdzie ma zostać widoczny otwór
  ctx.beginPath()
  ctx.arc(cx, cy, Math.max(r * 0.16, 4), 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

// Rysowanie owalnej obwódki wokół ust + pozioma linia styku warg (Krok 1)
export function drawMouthOval(ctx, mouthLeft, mouthRight, lipTop, lipBottom, canvas, color) {
  const cx = ((mouthLeft.x + mouthRight.x) / 2) * canvas.width
  const cy = ((lipTop.y + lipBottom.y) / 2) * canvas.height
  const mouthWidthPx = Math.abs(mouthRight.x - mouthLeft.x) * canvas.width
  // Promień poziomy = połowa szerokości ust + mały margines (wcześniej było
  // za dużo: 0.85 * PEŁNEJ szerokości jako promień, czyli owal ~2x za duży)
  const rx = mouthWidthPx * 0.58
  const ry = rx * 0.5

  ctx.lineWidth = 5
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.ellipse(cx, cy, Math.max(rx, 16), Math.max(ry, 11), 0, 0, Math.PI * 2)
  ctx.stroke()

  // Pozioma linia na wysokości styku warg — pomaga ocenić "na oko", czy usta
  // tworzą naturalną poziomą linię zamknięcia, czy są otwarte/rozchylone.
  ctx.beginPath()
  ctx.moveTo(cx - rx * 0.85, cy)
  ctx.lineTo(cx + rx * 0.85, cy)
  ctx.stroke()
}
