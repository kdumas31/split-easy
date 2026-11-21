import { parseCents, parseCentsUncapped } from '../lib/money'
import { MAX_CENTS } from '../lib/types'

interface Props {
  id: string
  value: string
  onChange: (v: string) => void
  symbol: string
  className?: string
  describedBy?: string | undefined
  invalid?: boolean
  label?: string
  required?: boolean
}

/** Group digits for display on blur: "1234.5" → "1,234.50". */
export function prettyAmount(v: string): string {
  const c = parseCents(v)
  if (c === null) return v
  const d = Math.floor(c / 100)
  const s = String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${s}.${String(c % 100).padStart(2, '0')}`
}

/** Error text for an amount string, or null when valid. */
export function amountError(v: string, { required = true, min = 1 } = {}): string | null {
  if (v.trim() === '') return required ? 'Enter an amount.' : null
  const raw = parseCentsUncapped(v)
  if (raw !== null && raw > MAX_CENTS) return 'That’s over the $10,000,000.00 limit.'
  const c = parseCents(v)
  if (c === null) return 'Use a number like 12.50.'
  if (c < min) return min === 1 ? 'Enter at least 1¢.' : 'Enter an amount.'
  return null
}

export function AmountInput({ id, value, onChange, symbol, className = '', describedBy, invalid, label, required }: Props) {
  return (
    <div className="input-prefix" style={{ ['--prefix-w' as string]: `${Math.max(1, [...symbol].length)}ch` }}>
      <span aria-hidden="true">{symbol}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        className={className}
        value={value}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        onChange={(e) => {
          // Refuse more than the cap and anything but money characters.
          const v = e.target.value.replace(/[^\d.,]/g, '')
          const c = parseCentsUncapped(v)
          if (c !== null && c > MAX_CENTS) return
          if (v.replace(/[^\d]/g, '').length > 11) return
          onChange(v)
        }}
        onBlur={() => onChange(prettyAmount(value))}
      />
    </div>
  )
}
