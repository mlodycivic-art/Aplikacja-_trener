// Głos podsumowań — syntezator mowy wbudowany w urządzenie (bez internetu, bez nagrań).
// Brzmienie zależy od telefonu lub tabletu: wybieramy polski głos kobiecy, jeśli jest zainstalowany.

const FEMALE_HINT = /zosia|ewa|paulina|zofia|agnieszka|maja|ola|krystyna|female|kobiet|google polski/i

export function listPolishVoices() {
  try { return (window.speechSynthesis?.getVoices() || []).filter(v => /^pl/i.test(v.lang)) } catch (e) { return [] }
}
export function pickVoice(preferredName) {
  const voices = listPolishVoices()
  if (!voices.length) return null
  return voices.find(v => v.name === preferredName) || voices.find(v => FEMALE_HINT.test(v.name)) || voices[0]
}

// Zwraca Promise, który kończy się po wypowiedzeniu tekstu (albo od razu, gdy głosu nie ma).
export function speak(text, { voiceName, rate = 0.92, pitch = 1.0 } = {}) {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis
      if (!synth || !window.SpeechSynthesisUtterance) { resolve(false); return }
      const u = new SpeechSynthesisUtterance(text)
      const v = pickVoice(voiceName)
      if (v) u.voice = v
      u.lang = 'pl-PL'; u.rate = rate; u.pitch = pitch
      let done = false
      const end = (ok) => { if (!done) { done = true; resolve(ok) } }
      u.onend = () => end(true)
      u.onerror = () => end(false)
      setTimeout(() => end(false), 15000)   // bezpiecznik: niektóre przeglądarki nie zgłaszają końca
      synth.cancel()
      synth.speak(u)
    } catch (e) { resolve(false) }
  })
}

// Odmiana po polsku: 1 słowo, 2–4 słowa, 5+ słów
export function plural(n, one, few, many) {
  if (n === 1) return one
  const d = n % 10, h = n % 100
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many
}

// Tekst podsumowania. Najpierw to, co dobre. Bez słowa "błąd".
//   s: { minutes, final, good, bad, heard, topBad, lowShare, judged }
export function summaryText(s) {
  const parts = [s.final ? 'Koniec okna starannej mowy.' : `${s.minutes} ${plural(s.minutes, 'minuta', 'minuty', 'minut')}.`]
  if (s.heard === 0) {
    parts.push(s.final ? 'Nie usłyszałam słów z listy.' : 'Nie usłyszałam jeszcze słów z listy. Mów dalej.')
  } else if (!s.judged) {
    parts.push(`Słowa z listy: ${s.heard}.`)
  } else {
    parts.push(`Dobrze: ${s.good}.`)
    parts.push(s.bad === 0 ? 'Nic do poprawy.' : `Do poprawy: ${s.bad}.`)
    if (s.topBad) parts.push(`Uważaj na słowo: ${s.topBad}.`)
  }
  if (s.lowShare) parts.push('Słyszę mało głosek szumiących.')
  if (s.final && s.judged && s.heard > 0 && s.bad === 0) parts.push('Świetna robota.')
  return parts.join(' ')
}
