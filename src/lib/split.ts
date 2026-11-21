import { fnv1a32 } from './hash'
import { remainderMessage } from './money'
import { MAX_CENTS, MAX_WEIGHT, assertCents, type Cents, type Id, type Split } from './types'

export class SplitError extends Error {
  readonly code: 'bad-total' | 'empty' | 'bad-weight' | 'zero-weights' | 'unknown-person' | 'bad-amount' | 'mismatch' | 'duplicate'
  readonly diff: Cents
  constructor(code: SplitError['code'], message: string, diff = 0) {
    super(message)
    this.name = 'SplitError'
    this.code = code
    this.diff = diff
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Largest-remainder allocation with deterministic tie-breaks (PLAN.md §5.2).
 * weights: [id, w] with integer w in 0…100 and Σw > 0. Result values sum exactly to total.
 */
export function allocate(total: Cents, weights: ReadonlyArray<readonly [Id, number]>, expenseId: string): Map<Id, Cents> {
  assertCents(total, 'total')
  if (total < 0 || total > MAX_CENTS) throw new SplitError('bad-total', 'Total is out of range')
  const seen = new Set<Id>()
  let W = 0
  for (const [id, w] of weights) {
    if (seen.has(id)) throw new SplitError('duplicate', `Duplicate person ${id}`)
    seen.add(id)
    if (!Number.isInteger(w) || w < 0 || w > MAX_WEIGHT) throw new SplitError('bad-weight', 'Weights must be whole numbers from 0 to 100')
    W += w
  }
  if (weights.length === 0) throw new SplitError('empty', 'Pick at least one person')
  if (W === 0) throw new SplitError('zero-weights', 'At least one person needs a share above 0')

  const P = weights.filter(([, w]) => w > 0).sort((a, b) => cmp(a[0], b[0]))
  const rot = fnv1a32(expenseId) % P.length
  const order = [...P.slice(rot), ...P.slice(0, rot)]

  const result = new Map<Id, Cents>()
  for (const [id] of weights) result.set(id, 0)
  let given = 0
  const rems: { id: Id; rem: number; pos: number }[] = []
  order.forEach(([id, w], pos) => {
    const prod = total * w
    const base = Math.floor(prod / W)
    result.set(id, base)
    given += base
    rems.push({ id, rem: prod % W, pos })
  })
  let r = total - given
  rems.sort((a, b) => b.rem - a.rem || a.pos - b.pos)
  for (const { id } of rems) {
    if (r <= 0) break
    result.set(id, (result.get(id) ?? 0) + 1)
    r--
  }
  return result
}

/**
 * Per-person shares of an expense. Every group member listed in `memberIds` gets an entry
 * (0 for those not in the split). Throws SplitError on invalid input.
 */
export function computeShares(total: Cents, split: Split, expenseId: string, memberIds?: Iterable<Id>): Map<Id, Cents> {
  assertCents(total, 'total')
  const known = memberIds ? new Set(memberIds) : null
  const checkKnown = (id: Id) => {
    if (known && !known.has(id)) throw new SplitError('unknown-person', 'That person is not in this group')
  }
  let out: Map<Id, Cents>
  switch (split.mode) {
    case 'equal': {
      if (split.participants.length === 0) throw new SplitError('empty', 'Pick at least one person')
      split.participants.forEach(checkKnown)
      out = allocate(total, split.participants.map((id) => [id, 1] as const), expenseId)
      break
    }
    case 'shares': {
      const entries = Object.entries(split.weights)
      entries.forEach(([id]) => checkKnown(id))
      out = allocate(total, entries, expenseId)
      break
    }
    case 'exact': {
      if (total < 0 || total > MAX_CENTS) throw new SplitError('bad-total', 'Total is out of range')
      out = new Map()
      let sum = 0
      for (const [id, amt] of Object.entries(split.amounts)) {
        checkKnown(id)
        if (!Number.isSafeInteger(amt) || amt < 0 || amt > MAX_CENTS) throw new SplitError('bad-amount', 'Amounts must be whole cents, zero or more')
        out.set(id, amt)
        sum += amt
      }
      const diff = total - sum
      if (diff !== 0) throw new SplitError('mismatch', remainderMessage(diff) ?? '', diff)
      break
    }
    default:
      throw new SplitError('bad-total', 'Unknown split mode')
  }
  if (known) for (const id of known) if (!out.has(id)) out.set(id, 0)
  return out
}

/** Non-throwing variant for live UI previews. */
export function tryShares(
  total: Cents,
  split: Split,
  expenseId: string,
  memberIds?: Iterable<Id>,
): { ok: true; shares: Map<Id, Cents> } | { ok: false; error: SplitError } {
  try {
    return { ok: true, shares: computeShares(total, split, expenseId, memberIds) }
  } catch (e) {
    if (e instanceof SplitError) return { ok: false, error: e }
    return { ok: false, error: new SplitError('bad-total', e instanceof Error ? e.message : 'Invalid split') }
  }
}
