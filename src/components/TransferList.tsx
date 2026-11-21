import { formatCents } from '../lib/money'
import type { Id, Transfer } from '../lib/types'

interface Props {
  transfers: Transfer[]
  nameOf: (id: Id) => string
  symbol: string
  onMarkPaid?: ((t: Transfer) => void) | undefined
  disabled?: boolean
}

export function transferLabel(t: Transfer, nameOf: (id: Id) => string, symbol: string): string {
  return `${nameOf(t.from)} pays ${nameOf(t.to)} ${formatCents(t.amountCents, symbol)}`
}

export function TransferList({ transfers, nameOf, symbol, onMarkPaid, disabled }: Props) {
  return (
    <ul className="list" aria-label="Suggested payments">
      {transfers.map((t) => (
        <li key={`${t.from}-${t.to}`} className="list-row transfer" data-testid="transfer">
          <span className="who">
            {nameOf(t.from)}
            <span className="arrow" aria-hidden="true">
              →
            </span>
            <span className="visually-hidden"> pays </span>
            {nameOf(t.to)} <span className="amt">{formatCents(t.amountCents, symbol)}</span>
          </span>
          {onMarkPaid && (
            <button type="button" className="btn btn-small" disabled={disabled} onClick={() => onMarkPaid(t)} aria-label={`Mark paid: ${transferLabel(t, nameOf, symbol)}`}>
              Mark paid
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
