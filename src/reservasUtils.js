export const STORAGE_KEY = 'bmj-salareuniao-reservas-v1'

export const SALAS = [
  'Sala 01 – Ipê',
  'Sala 02 – Aroeira',
  'Sala 03 – Cedro',
  'Sala 04 – Jatobá',
  'Sala 05 – Peroba',
  'Sala 06 – Mogno',
  'Sala 07 – Angico',
  'Sala 08 – Cumaru',
  'Sala 09 – Garapeira',
  'Sala 10 – Copaíba',
  'Sala 11 – Pequi',
  'Sala 12 – Jequitibá',
  'Sala 13 – Baraúna',
  'Sala 14 – Quaresmeira',
  'Sala 15 – Sucupira',
]

export const SLOT_MINUTES = 30
export const DAY_START_MIN = 7 * 60
export const DAY_END_MIN = 20 * 60

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function timeToMinutes(t) {
  if (!t || typeof t !== 'string') return NaN
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN
  return h * 60 + m
}

export function minutesToTime(min) {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`
}

/** Validação pragmática para UX (não cobre 100% do RFC 5322). */
export function isValidEmail(email) {
  const t = String(email ?? '').trim()
  if (!t || t.length > 254) return false
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/i.test(t)
}

export function todayISO() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export function toISODateLocal(d) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return `${y}-${m}-${day}`
}

/** Período em datas locais (YYYY-MM-DD), inclusive */
export function getPeriodRange(period) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period === 'today') {
    const s = toISODateLocal(today)
    return { start: s, end: s }
  }
  if (period === 'week') {
    const dow = today.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { start: toISODateLocal(monday), end: toISODateLocal(sunday) }
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { start: toISODateLocal(start), end: toISODateLocal(end) }
  }
  if (period === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    const end = new Date(today.getFullYear(), 11, 31)
    return { start: toISODateLocal(start), end: toISODateLocal(end) }
  }
  const s = toISODateLocal(today)
  return { start: s, end: s }
}

export function daysInclusive(startISO, endISO) {
  const a = new Date(`${startISO}T12:00:00`)
  const b = new Date(`${endISO}T12:00:00`)
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

export function dateInClosedRange(dateStr, startISO, endISO) {
  return dateStr >= startISO && dateStr <= endISO
}

export function reservationDurationMinutes(r) {
  const a = timeToMinutes(r.horaInicio)
  const b = timeToMinutes(r.horaFim)
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0
  return b - a
}

/** Minutos desde meia-noite local "agora" */
export function nowMinutesLocal() {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

export function loadReservations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveReservations(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export const AUDIT_STORAGE_KEY = 'bmj-salareuniao-audit-v1'

/** Reserva cobre o dia local YYYY-MM-DD (inclui intervalo date…dateFim). */
export function reservationCoversDate(r, dateISO) {
  const end = r.dateFim || r.date
  return dateISO >= r.date && dateISO <= end
}

/** Lista de ISO dates de start a end inclusive (ordem crescente). */
export function eachDateISOInRange(startISO, endISO) {
  const out = []
  const d = new Date(`${startISO}T12:00:00`)
  const last = new Date(`${endISO}T12:00:00`)
  while (d <= last) {
    out.push(toISODateLocal(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Segunda-feira da semana que contém dateISO (local). */
export function mondayOfWeekContaining(dateISO) {
  const d = new Date(`${dateISO}T12:00:00`)
  const dow = d.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + mondayOffset)
  return toISODateLocal(d)
}

/** Seg, Ter, … Dom como ISO a partir da segunda da semana. */
export function weekDayISOsFromMonday(mondayISO) {
  const d = new Date(`${mondayISO}T12:00:00`)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    return toISODateLocal(x)
  })
}

export function appendAudit(entry) {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY)
    let prev = []
    try {
      const p = JSON.parse(raw || '[]')
      if (Array.isArray(p)) prev = p
    } catch {
      prev = []
    }
    prev.push(entry)
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(prev.slice(-500)))
  } catch {
    /* ignore */
  }
}

/** Reserva intersecta [startISO, endISO] em qualquer dia. */
export function reservationOverlapsRange(r, startISO, endISO) {
  const rs = r.date
  const re = r.dateFim || r.date
  return !(re < startISO || rs > endISO)
}

/** Minutos “consumidos” no período (duração diária × dias de interseção). */
export function reservationMinutesInPeriod(r, periodStart, periodEnd) {
  const rs = r.date
  const re = r.dateFim || r.date
  const overlapStart = rs > periodStart ? rs : periodStart
  const overlapEnd = re < periodEnd ? re : periodEnd
  if (overlapStart > overlapEnd) return 0
  const n = eachDateISOInRange(overlapStart, overlapEnd).length
  const dm = reservationDurationMinutes(r)
  return n * dm
}
