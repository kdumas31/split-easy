import { parseCents, remainderMessage } from '../lib/money'
import { tryShares } from '../lib/split'
import type { Cents, Id, Person, Split, SplitMode } from '../lib/types'

export interface SplitDraft {
  mode: SplitMode
  equal: Id[]
  weights: Record<Id, number>
  exact: Record<Id, string>
}

export function draftFromSplit(split: Split | null, people: Person[]): SplitDraft {
  const ids = people.map((p) => p.id)
  const d: SplitDraft = {
    mode: split?.mode ?? 'equal',
    equal: ids,
    weights: Object.fromEntries(ids.map((id) => [id, 1])),
    exact: Object.fromEntries(ids.map((id) => [id, ''])),
  }
  if (!split) return d
  if (split.mode === 'equal') d.equal = split.participants.filter((id) => ids.includes(id))
  if (split.mode === 'shares') d.weights = Object.fromEntries(ids.map((id) => [id, split.weights[id] ?? 0]))
  if (split.mode === 'exact') {
    d.exact = Object.fromEntries(
      ids.map((id) => {
        const c = split.amounts[id]
        return [id, c === undefined || c === 0 ? '' : `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`]
      }),
    )
  }
  return d
}

export type DraftResult =
  | { ok: true; split: Split; shares: Map<Id, Cents> }
  | { ok: false; message: string; diff?: Cents; shares?: Map<Id, Cents> }

export function evaluateDraft(d: SplitDraft, total: Cents | null, people: Person[], expenseId: string, symbol: string): DraftResult {
  const order = people.map((p) => p.id)
  let split: Split
  if (d.mode === 'equal') {
    const participants = order.filter((id) => d.equal.includes(id))
    if (participants.length === 0) return { ok: false, message: 'Pick at least one person to split with.' }
    split = { mode: 'equal', participants }
  } else if (d.mode === 'shares') {
    const weights: Record<Id, number> = {}
    for (const id of order) if ((d.weights[id] ?? 0) > 0) weights[id] = d.weights[id] as number
    if (Object.keys(weights).length === 0) return { ok: false, message: 'Give at least one person a share above 0.' }
    split = { mode: 'shares', weights }
  } else {
    const amounts: Record<Id, Cents> = {}
    let sum = 0
    for (const id of order) {
      const raw = (d.exact[id] ?? '').trim()
      if (raw === '') continue
      const c = parseCents(raw)
      if (c === null) return { ok: false, message: `Check the amount for ${people.find((p) => p.id === id)?.name ?? 'someone'}.` }
      if (c > 0) amounts[id] = c
      sum += c
    }
    if (total === null) return { ok: false, message: 'Enter the total first.' }
    const diff = total - sum
    if (diff !== 0) return { ok: false, message: remainderMessage(diff, symbol) ?? '', diff, shares: new Map(Object.entries(amounts)) }
    if (Object.keys(amounts).length === 0) return { ok: false, message: 'Assign the amount to at least one person.' }
    split = { mode: 'exact', amounts }
  }
  if (total === null) return { ok: false, message: 'Enter the total first.' }
  const r = tryShares(total, split, expenseId, order)
  if (!r.ok) return { ok: false, message: r.error.message }
  return { ok: true, split, shares: r.shares }
}
