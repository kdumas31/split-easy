/** Local calendar date as YYYY-MM-DD. Never toISOString() (that is UTC and can be a day off). */
export function todayLocal(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${String(y).padStart(4, '0')}-${m}-${day}`
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = DATE_RE.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1) return false
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return d <= dim
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Fri, Nov 20, 2026" — computed without time zones (date is a calendar date). */
export function formatDateLong(s: string): string {
  const m = DATE_RE.exec(s)
  if (!m) return s
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  return `${DAYS[dow]}, ${MONTHS[mo - 1]} ${d}, ${y}`
}

export function formatDateShort(s: string): string {
  const m = DATE_RE.exec(s)
  if (!m) return s
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
}
