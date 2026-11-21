import { assertCents, type Cents, type Id, type Transfer } from './types'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const EXACT_LIMIT = 16

interface Entry {
  id: Id
  bal: Cents
}

/** Inside one group: most negative pays most positive min(|debt|, credit). Ties → lowest id. */
function greedy(entries: Entry[], out: Transfer[]): void {
  const people = entries.map((e) => ({ ...e }))
  for (;;) {
    let debtor: Entry | null = null
    let creditor: Entry | null = null
    for (const p of people) {
      if (p.bal < 0 && (!debtor || p.bal < debtor.bal || (p.bal === debtor.bal && cmp(p.id, debtor.id) < 0))) debtor = p
      if (p.bal > 0 && (!creditor || p.bal > creditor.bal || (p.bal === creditor.bal && cmp(p.id, creditor.id) < 0))) creditor = p
    }
    if (!debtor || !creditor) return
    const amt = Math.min(-debtor.bal, creditor.bal)
    out.push({ from: debtor.id, to: creditor.id, amountCents: amt })
    debtor.bal += amt
    creditor.bal -= amt
  }
}

/** Exact minimum transfers for n ≤ 16 via subset DP (PLAN.md §5.4). */
function exact(entries: Entry[], out: Transfer[]): void {
  const n = entries.length
  const size = 1 << n
  const full = size - 1
  const sum = new Float64Array(size)
  const dp = new Int32Array(size)
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask
    const i = 31 - Math.clz32(low)
    sum[mask] = (sum[mask ^ low] ?? 0) + (entries[i]?.bal ?? 0)
    let best = 0
    for (let m = mask; m; m &= m - 1) {
      const bit = m & -m
      const v = dp[mask ^ bit] ?? 0
      if (v > best) best = v
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0)
  }
  const atomic: number[] = []
  for (let s = 1; s < size; s++) if (sum[s] === 0 && dp[s] === 1) atomic.push(s)

  let mask = full
  while (mask !== 0) {
    const target = (dp[mask] ?? 0) - 1
    let chosen = -1
    for (const s of atomic) {
      if ((s & mask) === s && dp[mask ^ s] === target) {
        chosen = s
        break
      }
    }
    if (chosen < 0) throw new Error('settle: no atomic group found (invariant broken)')
    const group: Entry[] = []
    for (let i = 0; i < n; i++) if (chosen & (1 << i)) group.push(entries[i] as Entry)
    greedy(group, out)
    mask ^= chosen
  }
}

/** Fallback for n > 16: pair exact opposites by id order, then greedy on the rest. */
function fallback(entries: Entry[], out: Transfer[]): void {
  const byId = [...entries].sort((a, b) => cmp(a.id, b.id))
  const used = new Set<Id>()
  for (const d of byId) {
    if (d.bal >= 0 || used.has(d.id)) continue
    const c = byId.find((p) => !used.has(p.id) && p.bal === -d.bal)
    if (c) {
      used.add(d.id)
      used.add(c.id)
      out.push({ from: d.id, to: c.id, amountCents: c.bal })
    }
  }
  greedy(
    byId.filter((p) => !used.has(p.id)),
    out,
  )
}

/**
 * Fixed, device-independent name order: case-folded with the locale-free toLowerCase(),
 * compared by UTF-16 code units, then the raw name. No Intl/locale, so every phone agrees.
 */
export function cmpNames(a: string, b: string): number {
  return cmp(a.toLowerCase(), b.toLowerCase()) || cmp(a, b)
}

/** Sort for display: from-name, to-name, from-id, to-id. */
export function sortTransfers(ts: Transfer[], nameOf: (id: Id) => string = (id) => id): Transfer[] {
  return [...ts].sort(
    (a, b) => cmpNames(nameOf(a.from), nameOf(b.from)) || cmpNames(nameOf(a.to), nameOf(b.to)) || cmp(a.from, b.from) || cmp(a.to, b.to),
  )
}

/** Minimum-transfer settle-up. balances: id → cents (Σ must be 0). */
export function settleUp(balances: Map<Id, Cents> | Iterable<readonly [Id, Cents]>, nameOf?: (id: Id) => string): Transfer[] {
  const entries: Entry[] = []
  let total = 0
  for (const [id, bal] of balances) {
    assertCents(bal, 'balance')
    total += bal
    if (bal !== 0) entries.push({ id, bal })
  }
  if (total !== 0) throw new Error(`settleUp: balances must sum to 0 (got ${total})`)
  if (entries.length === 0) return []
  entries.sort((a, b) => a.bal - b.bal || cmp(a.id, b.id))
  const out: Transfer[] = []
  if (entries.length <= EXACT_LIMIT) exact(entries, out)
  else fallback(entries, out)
  return sortTransfers(out, nameOf)
}
