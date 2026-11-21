import { useId } from 'react'
import { formatCents } from '../lib/money'
import type { Cents, Person, SplitMode } from '../lib/types'
import { AmountInput } from './AmountInput'
import type { DraftResult, SplitDraft } from './splitDraft'

interface Props {
  people: Person[]
  draft: SplitDraft
  onChange: (d: SplitDraft) => void
  result: DraftResult
  total: Cents | null
  symbol: string
  resultId: string
}

const MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'shares', label: 'By shares' },
  { value: 'exact', label: 'Exact amounts' },
]

export function SplitEditor({ people, draft, onChange, result, total, symbol, resultId }: Props) {
  const name = useId()
  const shares = result.ok ? result.shares : (result.shares ?? null)
  const shareText = (id: string) => {
    const c = shares?.get(id)
    return c === undefined ? '' : formatCents(c, symbol)
  }
  const equalCount = draft.equal.length
  const each = total !== null && equalCount > 0 ? Math.floor(total / equalCount) : null

  return (
    <fieldset>
      <legend>Split</legend>
      <div className="seg" role="radiogroup" aria-label="How to split">
        {MODES.map((m) => (
          <label key={m.value}>
            <input type="radio" name={name} value={m.value} checked={draft.mode === m.value} onChange={() => onChange({ ...draft, mode: m.value })} />
            {m.label}
          </label>
        ))}
      </div>

      <div style={{ marginTop: 'var(--space-3)' }}>
        {draft.mode === 'equal' && (
          <>
            <p className="hint">{each !== null ? `About ${formatCents(each, symbol)} each.` : 'Tick everyone who shares this.'}</p>
            {people.map((p) => (
              <label className="check-row split-row" key={p.id}>
                <input
                  type="checkbox"
                  checked={draft.equal.includes(p.id)}
                  onChange={(e) => onChange({ ...draft, equal: e.target.checked ? [...draft.equal, p.id] : draft.equal.filter((x) => x !== p.id) })}
                />
                <span className="name">{p.name}</span>
                <span className="share amt">{draft.equal.includes(p.id) ? shareText(p.id) : '—'}</span>
              </label>
            ))}
          </>
        )}

        {draft.mode === 'shares' && (
          <>
            <p className="hint">Whole numbers. Use 3 and 2 instead of 1.5 and 1.</p>
            {people.map((p) => {
              const w = draft.weights[p.id] ?? 0
              const set = (n: number) => onChange({ ...draft, weights: { ...draft.weights, [p.id]: Math.max(0, Math.min(100, n)) } })
              return (
                <div className="split-row" key={p.id}>
                  <span className="name">{p.name}</span>
                  <span className="stepper" role="group" aria-label={`${p.name}'s shares`}>
                    <button type="button" className="btn btn-small icon-btn" aria-label={`Fewer shares for ${p.name}`} disabled={w <= 0} onClick={() => set(w - 1)}>
                      −
                    </button>
                    <output aria-live="polite" aria-label={`${p.name}: ${w} shares`}>
                      {w}
                    </output>
                    <button type="button" className="btn btn-small icon-btn" aria-label={`More shares for ${p.name}`} disabled={w >= 100} onClick={() => set(w + 1)}>
                      +
                    </button>
                  </span>
                  <span className="share amt">{w > 0 ? shareText(p.id) : '—'}</span>
                </div>
              )
            })}
          </>
        )}

        {draft.mode === 'exact' && (
          <>
            {people.map((p) => (
              <div className="split-row" key={p.id}>
                <label className="name" htmlFor={`${name}-x-${p.id}`}>
                  {p.name}
                </label>
                <AmountInput
                  id={`${name}-x-${p.id}`}
                  className="exact amt"
                  symbol={symbol}
                  value={draft.exact[p.id] ?? ''}
                  onChange={(v) => onChange({ ...draft, exact: { ...draft.exact, [p.id]: v } })}
                  describedBy={resultId}
                />
              </div>
            ))}
          </>
        )}
      </div>

      <p id={resultId} className={result.ok ? 'remainder ok' : 'remainder'} aria-live="polite">
        {result.ok ? (draft.mode === 'exact' ? 'All assigned.' : 'Adds up to the total.') : result.message}
      </p>
    </fieldset>
  )
}
