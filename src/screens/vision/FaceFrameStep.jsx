import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision'

// Model i WASM ładowane z CDN Google — na etapie testów wystarczy internet
// przy pierwszym uruchomieniu. W wersji produkcyjnej można je wgrać lokalnie
// do folderu public/ i podmienić poniższe stałe na ścieżki lokalne.
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

// Ile ms twarz musi nieprzerwanie być dobrze ustawiona, zanim zaproponujemy akceptację
const STABLE_MS = 1200

export default function FaceFrameStep({ onAccept, onReject, onCancel }) {
  const videoRef       = useRef(null)
  const canvasRef      = useRef(null)
  const landmarkerRef  = useRef(null)
  const rafRef         = useRef(null)
  const streamRef      = useRef(null)
  const stableSinceRef = useRef(null)
  const cancelledRef   = useRef(false)

  const [status, setStatus]     = useState('loading') // loading | detecting | stable | error
  const [errorMsg, setErrorMsg] = useState('')
  const [ready, setReady]       = useState(false)

  useEffect(() => {
    cancelledRef.current = false

    async function setup() {
      try {
        setStatus('loading')
        const filesetResolver = await FilesetResolver.forVisionTasks(WASM_URL)
        if (cancelledRef.current) return

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
        })
        if (cancelledRef.current) { landmarker.close(); return }
        landmarkerRef.current = landmarker

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        })
        if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) { stream.getTracks().forEach(t => t.stop()); return }
        video.srcObject = stream

        try {
          await video.play()
        } catch (playErr) {
          // W trybie deweloperskim React StrictMode celowo montuje komponent
          // dwukrotnie — pierwsza próba bywa przerywana w trakcie startu
          // odtwarzania wideo (AbortError). To nieszkodliwe, po prostu
          // kończymy tę (nieaktualną) instancję bez pokazywania błędu.
          if (playErr && playErr.name === 'AbortError') return
          throw playErr
        }

        if (cancelledRef.current) return

        setStatus('detecting')
        loop()
      } catch (err) {
        console.error('Błąd uruchamiania kamery / modelu twarzy:', err)
        if (!cancelledRef.current) {
          setStatus('error')
          setErrorMsg('Nie udało się uruchomić kamery lub modelu wykrywania twarzy. Sprawdź, czy przeglądarka ma zgodę na dostęp do kamery.')
        }
      }
    }

    function loop() {
      if (cancelledRef.current) return
      const video      = videoRef.current
      const canvas     = canvasRef.current
      const landmarker = landmarkerRef.current

      if (!video || !canvas || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const result = landmarker.detectForVideo(video, performance.now())

      // Docelowy kształt — pionowy prostokąt z zaokrąglonymi rogami (kontur twarzy)
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const halfW   = canvas.width  * 0.17
      const halfH   = canvas.height * 0.34
      const cornerR = halfW * 0.55

      let inTarget = false

      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const points = result.faceLandmarks[0]
        let minX = 1, maxX = 0, minY = 1, maxY = 0
        for (const p of points) {
          if (p.x < minX) minX = p.x
          if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y
          if (p.y > maxY) maxY = p.y
        }
        // Prostokąt opisujący całą wykrytą twarz (czoło–broda, policzek–policzek)
        const faceMinX = minX * canvas.width
        const faceMaxX = maxX * canvas.width
        const faceMinY = minY * canvas.height
        const faceMaxY = maxY * canvas.height
        const faceW    = faceMaxX - faceMinX
        const faceH    = faceMaxY - faceMinY

        // Mały margines wewnętrzny — cała twarz musi zmieścić się w obrysie,
        // sam środek twarzy już nie wystarcza.
        const margin = 6
        const targetMinX = cx - halfW + margin
        const targetMaxX = cx + halfW - margin
        const targetMinY = cy - halfH + margin
        const targetMaxY = cy + halfH - margin

        const fullyInside =
          faceMinX >= targetMinX && faceMaxX <= targetMaxX &&
          faceMinY >= targetMinY && faceMaxY <= targetMaxY

        // Twarz musi WYPEŁNIAĆ ramkę (nie tylko się w niej mieścić z zapasem)
        const sizeOk =
          faceH >= (halfH * 2) * 0.75 &&   // twarz nie za daleko (za mała)
          faceW >= (halfW * 2) * 0.45 &&   // twarz nie za daleko (za wąska)
          faceW <= (halfW * 2) * 1.05      // twarz nie za blisko (za szeroka)

        // Głowa ma być ustawiona prosto (w pionie), nie przechylona na bok —
        // sprawdzamy kąt linii łączącej zewnętrzne kąciki oczu.
        let uprightOk = true
        const rightEye = points[33]
        const leftEye  = points[263]
        if (rightEye && leftEye) {
          const dx = (leftEye.x - rightEye.x) * canvas.width
          const dy = (leftEye.y - rightEye.y) * canvas.height
          let tiltDeg = Math.atan2(dy, dx) * 180 / Math.PI
          if (tiltDeg > 90) tiltDeg -= 180
          if (tiltDeg <= -90) tiltDeg += 180
          uprightOk = Math.abs(tiltDeg) <= 12
        }

        inTarget = fullyInside && sizeOk && uprightOk
      }

      ctx.lineWidth   = 6
      ctx.strokeStyle = inTarget ? '#22C55E' : '#EF4444'
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2, cornerR)
      } else {
        // Fallback dla przeglądarek bez natywnego ctx.roundRect
        const x = cx - halfW, y = cy - halfH, w = halfW * 2, h = halfH * 2, r = cornerR
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + w, y,     x + w, y + h, r)
        ctx.arcTo(x + w, y + h, x,     y + h, r)
        ctx.arcTo(x,     y + h, x,     y,     r)
        ctx.arcTo(x,     y,     x + w, y,     r)
        ctx.closePath()
      }
      ctx.stroke()

      const now = performance.now()
      if (inTarget) {
        if (stableSinceRef.current == null) stableSinceRef.current = now
        const elapsed = now - stableSinceRef.current
        setStatus('stable')
        setReady(elapsed >= STABLE_MS)
      } else {
        stableSinceRef.current = null
        setStatus('detecting')
        setReady(false)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    setup()

    return () => {
      cancelledRef.current = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (landmarkerRef.current) landmarkerRef.current.close()
    }
  }, [])

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  const handleAccept = () => {
    stopCamera()
    onAccept && onAccept()
  }

  const handleReject = () => {
    stableSinceRef.current = null
    setReady(false)
    setStatus('detecting')
    onReject && onReject()
  }

  const handleCancel = () => {
    stopCamera()
    onCancel && onCancel()
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
        Krok 0 — ustawienie twarzy w kadrze
      </div>

      {status === 'error' ? (
        <>
          <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{errorMsg}</div>
          <button className="btn btn-ghost btn-full" onClick={handleCancel}>Wróć</button>
        </>
      ) : (
        <>
          <div style={{
            position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden',
            background: '#000', aspectRatio: '4 / 3',
          }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                transform: 'scaleX(-1)',
              }}
            />
          </div>

          <div style={{ fontSize: 13, textAlign: 'center', marginTop: 10, marginBottom: 10, fontWeight: 700 }}>
            {status === 'loading'   && 'Uruchamianie kamery i modelu wykrywania twarzy…'}
            {status === 'detecting' && 'Przybliż twarz tak, by wypełniła zieloną ramkę, i trzymaj głowę prosto (bez przechylania na bok).'}
            {status === 'stable' && !ready && 'Świetnie, trzymaj tak przez chwilę…'}
            {status === 'stable' && ready  && 'Ustawienie wygląda dobrze!'}
          </div>

          {ready && (
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              Czy akceptujesz ustawienie twarzy w kadrze?
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAccept}>Akceptuję</button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleReject}>Odrzuć i powtórz</button>
              </div>
            </div>
          )}

          <button className="btn btn-ghost btn-full" onClick={handleCancel} style={{ marginTop: 4 }}>
            Anuluj kalibrację
          </button>
        </>
      )}
    </div>
  )
}
