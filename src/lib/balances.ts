import { computeShares } from './split'
import { liveExpenses, liveSettlements, type Cents, type Group, type Id } from './types'

export interface PersonTotals {
  paid: Cents // expenses paid
  share: Cents // share of expenses
  sent: Cents // settlements paid
  received: Cents // settlements received
  balance: Cents // + gets back, − owes
}

/** Net balance per live-or-referenced person (PLAN.md §5.3). Σ balance === 0. */
export function computeTotals(group: Group): Map<Id, PersonTotals> {
  const t = new Map<Id, PersonTotals>()
  const get = (id: Id) => {
    let v = t.get(id)
    if (!v) {
      v = { paid: 0, share: 0, sent: 0, received: 0, balance: 0 }
      t.set(id, v)
    }
    return v
  }
  for (const p of group.people) if (!p.deleted) get(p.id)
  const memberIds = group.people.map((p) => p.id)
  for (const e of liveExpenses(group)) {
    get(e.paidBy).paid += e.amountCents
    const shares = computeShares(e.amountCents, e.split, e.id, memberIds)
    for (const [id, c] of shares) if (c !== 0) get(id).share += c
  }
  for (const s of liveSettlements(group)) {
    get(s.from).sent += s.amountCents
    get(s.to).received += s.amountCents
  }
  let sum = 0
  for (const v of t.values()) {
    v.balance = v.paid - v.share + v.sent - v.received
    sum += v.balance
  }
  // Dev/test-only guard (PLAN.md): in production a broken invariant must not take the page down.
  if (sum !== 0 && import.meta.env.DEV) throw new Error(`Balance invariant broken: Σ = ${sum}`)
  return t
}

export function computeBalances(group: Group): Map<Id, Cents> {
  const out = new Map<Id, Cents>()
  for (const [id, v] of computeTotals(group)) out.set(id, v.balance)
  return out
}

export function groupTotal(group: Group): Cents {
  let s = 0
  for (const e of liveExpenses(group)) s += e.amountCents
  return s
}
