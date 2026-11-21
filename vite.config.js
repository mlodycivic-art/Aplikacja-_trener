import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Tylko przy `npm run dev` na komputerze: przycisk „Zapisz jako ustawienia domyślne” w Profilu
// zapisuje plik prosto do public/preset.json, żeby nie trzeba go było przenosić ręcznie z Pobranych.
// W opublikowanej aplikacji tego adresu nie ma (wtedy przycisk pobiera plik).
function savePresetPlugin() {
  return {
    name: 'save-preset',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-preset', (req, res) => {
        const reply = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
        // tylko z tego komputera: gdy aplikacja jest udostępniona przez tunel (ngrok), nikt z zewnątrz nie nadpisze pliku
        const host = String(req.headers.host || '').split(':')[0]
        if (host !== 'localhost' && host !== '127.0.0.1') return reply(403, { ok: false })
        if (req.method !== 'POST') return reply(405, { ok: false })
        let body = ''
        req.on('data', (c) => { body += c; if (body.length > 2_000_000) req.destroy() })
        req.on('end', () => {
          try {
            const p = JSON.parse(body)
            if (p.app !== 'speech-training-coach' || p.kind !== 'preset' || typeof p.data !== 'object') return reply(400, { ok: false })
            const dir = path.resolve(server.config.root, 'public')
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(path.join(dir, 'preset.json'), JSON.stringify(p, null, 2))
            reply(200, { ok: true })
          } catch (e) { reply(400, { ok: false }) }
        })
      })
    },
  }
}

// `npm run dev`        — zwykła praca na komputerze (http://localhost:5173)
// `npm run dev:phone`  — to samo, ale po https i widoczne w domowej sieci Wi‑Fi, żeby telefon i tablet
//                        mogły używać kamery i mikrofonu (przeglądarki wymagają do tego https).
//                        Certyfikat jest tworzony lokalnie, więc telefon przy pierwszym wejściu pokaże ostrzeżenie.
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), savePresetPlugin()]
  if (mode === 'phone') {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl')
    plugins.push(basicSsl())
  }
  return {
    plugins,
    server: {
      host: mode === 'phone' ? true : undefined,
      // adresy tuneli (ngrok), gdyby ktoś chciał udostępnić aplikację poza domem
      allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io'],
    },
  }
})
