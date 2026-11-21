import { MAX_CENTS, assertCents, type Cents } from './types'

const THOUSANDS_RE = /^\d{1,3}(,\d{3})+(\.\d{0,2})?$/
const DECIMAL_COMMA_RE = /^\d*,\d{1,2}$/
const PLAIN_RE = /^(\d{0,12})(?:\.(\d{0,2}))?$/

/**
 * Parse user money input to integer cents using string math only (no parseFloat).
 * Returns null when the input is not a valid amount within 0 … $10,000,000.00.
 */
export function parseCents(input: string): Cents | null {
  const c = parseCentsUncapped(input)
  return c !== null && c <= MAX_CENTS ? c : null
}

/** Same parsing rules without the $10M cap (lets the UI say "over the limit"). Up to 12 digits. */
export function parseCentsUncapped(input: string): Cents | null {
  let s = input.trim()
  // strip one leading currency symbol (any non-digit, non-sign, non-separator run up to 3 chars) and spaces
  s = s.replace(/^[^\d.,\-+\s]{1,3}\s*/u, '')
  if (s.includes(',')) {
    if (THOUSANDS_RE.test(s)) s = s.replace(/,/g, '')
    else if (DECIMAL_COMMA_RE.test(s)) s = s.replace(',', '.')
    else return null
  }
  const m = PLAIN_RE.exec(s)
  if (!m) return null
  const whole = m[1] ?? ''
  const frac = m[2] ?? ''
  if (whole.length === 0 && frac.length === 0) return null
  const dollars = whole.length ? Number(whole) : 0
  const cents = frac.length ? Number(frac.padEnd(2, '0')) : 0
  const total = dollars * 100 + cents
  if (!Number.isSafeInteger(total)) return null
  return total
}

function groupDigits(n: number): string {
  const s = String(n)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ','
    out += s[i]
  }
  return out
}

/** Integer cents → "$1,234.05". Negative values get a leading "−". */
export function formatCents(c: Cents, symbol = '$'): string {
  assertCents(c)
  const neg = c < 0
  const abs = Math.abs(c)
  const dollars = Math.floor(abs / 100)
  const cents = abs % 100
  return `${neg ? '−' : ''}${symbol}${groupDigits(dollars)}.${String(cents).padStart(2, '0')}`
}

/** Plain "1234.56" for CSV and inputs (no symbol, no grouping). */
export function plainCents(c: Cents): string {
  assertCents(c)
  const neg = c < 0
  const abs = Math.abs(c)
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Short remainder wording: "1¢" under a dollar, otherwise "$1.25". */
export function formatDiff(c: Cents, symbol = '$'): string {
  assertCents(c)
  const abs = Math.abs(c)
  if (abs < 100) return `${abs}¢`
  return formatCents(abs, symbol)
}

/** The only remainder wording (PLAN.md §2): "$1.25 left to assign" / "$0.40 over the total". */
export function remainderMessage(diff: Cents, symbol = '$'): string | null {
  if (diff === 0) return null
  return diff > 0 ? `${formatDiff(diff, symbol)} left to assign` : `${formatDiff(diff, symbol)} over the total`
}
