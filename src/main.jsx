import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/main.css'
import { applyTheme } from './data/theme'
import { bootstrapPreset } from './data/presets'

// Nowe urządzenie najpierw bierze ustawienia domyślne z pliku preset.json (jeśli jest), dopiero potem rysujemy.
// Na urządzeniu już używanym nic się nie pobiera i start jest natychmiastowy.
bootstrapPreset().catch(() => false).then(() => {
  applyTheme()   // skin i akcent przed pierwszym rysowaniem
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
