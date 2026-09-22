import { useState, useEffect, useRef } from 'react'

export function useStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : initial
    } catch {
      return initial
    }
  })

  const valueRef = useRef(value)
  valueRef.current = value

  // Synchronizacja między kartami przeglądarki
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== key) return
      if (e.newValue === null) return
      try { setValue(JSON.parse(e.newValue)) } catch {}
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [key])

  const set = (next) => {
    const val = typeof next === 'function' ? next(valueRef.current) : next
    setValue(val)
    try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
  }

  return [value, set]
}
