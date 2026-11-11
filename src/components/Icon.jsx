// Proste ikony liniowe (SVG) zamiast emoji — ten sam wygląd na każdym urządzeniu.
const PATHS = {
  today:   <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 9l2 2 4-4" /><path d="M8 16h8" /></>,
  week:    <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  rewards: <><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8" /></>,
  trainer: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  camera:  <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  wave:    <><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2" /></>,
  parent:  <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5a5 5 0 0 1 5 5.5" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  modules: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  lock:    <><rect x="5" y="11" width="14" height="10" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock:  <><rect x="5" y="11" width="14" height="10" rx="3" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  play:    <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />,
  clock:   <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check:   <path d="M5 12.5l4.5 4.5L19 7.5" />,
  mic:     <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
}

export default function Icon({ name, size = 22, strokeWidth = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      {PATHS[name] || null}
    </svg>
  )
}
