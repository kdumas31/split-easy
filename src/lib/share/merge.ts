// Safe, pure merge of two copies of the same group (PLAN.md §4 Import and merge rules).
// mergeGroup never reads the clock: both devices compute the identical result.

import { formatCents } from '../money'
import type { ExpenseRec, Group, Id, Person, SettlementRec, Split } from '../types'
import { validateGroup } from '../validate'

/** Canonical JSON with sorted keys (used for deterministic tie-breaks). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

type Rec = { id: Id; updatedAt: number; deleted?: true }

/** Greater updatedAt wins; tie → lexicographically greater canonical JSON. Symmetric. */
export function pickWinner<T extends Rec>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  return canonical(a) >= canonical(b) ? a : b
}

export interface ReportBucket {
  count: number
  titles: string[]
}

export interface MergeReport {
  added: ReportBucket // new from them
  updated: ReportBucket // changed by them
  removed: ReportBucket // deleted by them
  keptLocal: ReportBucket // only you have
  localWins: ReportBucket // your newer edit wins
  revived: ReportBucket // people brought back because a record still uses them
  metaChanged: boolean
}

const bucket = (): ReportBucket => ({ count: 0, titles: [] })

/** Largest stamp anywhere in a group document. */
export function maxStamp(g: Group): number {
  let m = Math.max(g.createdAt, g.metaUpdatedAt, g.settledAt ?? 0)
  for (const p of g.people) m = Math.max(m, p.updatedAt)
  for (const e of g.expenses) m = Math.max(m, e.updatedAt, 'createdAt' in e ? e.createdAt : 0)
  for (const s of g.settlements) m = Math.max(m, s.updatedAt)
  return m
}

function splitIds(s: Split): Id[] {
  switch (s.mode) {
    case 'equal':
      return s.participants
    case 'shares':
      return Object.keys(s.weights)
    case 'exact':
      return Object.keys(s.amounts)
  }
}

interface Labeler<T> {
  label: (r: T) => string
}

function mergeCollection<T extends Rec>(
  local: T[],
  incoming: T[],
  report: MergeReport,
  lab: Labeler<T>,
): T[] {
  const inc = new Map(incoming.map((r) => [r.id, r]))
  const localIds = new Set(local.map((r) => r.id))
  const out: T[] = []
  const note = (b: ReportBucket, title: string) => {
    b.count++
    b.titles.push(title)
  }
  for (const l of local) {
    const i = inc.get(l.id)
    if (!i) {
      out.push(l)
      if (!l.deleted) note(report.keptLocal, lab.label(l))
      continue
    }
    const w = pickWinner(l, i)
    out.push(w)
    const same = canonical(l) === canonical(i)
    if (same) continue
    if (w === i) {
      if (i.deleted && !l.deleted) note(report.removed, lab.label(l))
      else if (!i.deleted && l.deleted) note(report.added, lab.label(i))
      else if (!i.deleted) note(report.updated, lab.label(i))
    } else if (!l.deleted || !i.deleted) {
      note(report.localWins, lab.label(l.deleted ? i : l))
    }
  }
  for (const i of incoming) {
    if (localIds.has(i.id)) continue
    out.push(i)
    if (!i.deleted) note(report.added, lab.label(i))
  }
  return out
}

export function mergeGroup(local: Group, incoming: Group): { merged: Group; report: MergeReport } {
  if (local.id !== incoming.id) throw new Error('mergeGroup: different groups')
  const report: MergeReport = {
    added: bucket(),
    updated: bucket(),
    removed: bucket(),
    keptLocal: bucket(),
    localWins: bucket(),
    revived: bucket(),
    metaChanged: false,
  }

  // People first (names are needed for payment labels).
  const allPeople = new Map<Id, Person[]>()
  for (const p of [...local.people, ...incoming.people]) {
    const list = allPeople.get(p.id) ?? []
    list.push(p)
    allPeople.set(p.id, list)
  }
  const nameOf = (id: Id) => allPeople.get(id)?.[0]?.name ?? '?'
  const symbol = local.currencySymbol

  const people = mergeCollection(local.people, incoming.people, report, { label: (p) => p.name })
  const expenses = mergeCollection<ExpenseRec>(local.expenses, incoming.expenses, report, {
    label: (e) => ('title' in e ? e.title : 'Deleted expense'),
  })
  const settlements = mergeCollection<SettlementRec>(local.settlements, incoming.settlements, report, {
    label: (s) => ('from' in s ? `Payment: ${nameOf(s.from)} → ${nameOf(s.to)} ${formatCents(s.amountCents, symbol)}` : 'Deleted payment'),
  })

  // Group meta (LWW on metaUpdatedAt, same tie rule).
  const meta = (g: Group) => {
    const m: { id: Id; updatedAt: number; name: string; currencySymbol: string; emoji?: string; settledAt?: number } = {
      id: g.id,
      updatedAt: g.metaUpdatedAt,
      name: g.name,
      currencySymbol: g.currencySymbol,
    }
    if (g.emoji !== undefined) m.emoji = g.emoji
    if (g.settledAt != null) m.settledAt = g.settledAt
    return m
  }
  const lm = meta(local)
  const im = meta(incoming)
  const wm = pickWinner(lm, im)
  report.metaChanged = wm === im && canonical(lm) !== canonical(im)

  // Integrity pass: revive tombstoned people still referenced by a live record.
  const M = Math.max(maxStamp(local), maxStamp(incoming))
  const referenced = new Set<Id>()
  for (const e of expenses) {
    if ('deleted' in e) continue
    referenced.add(e.paidBy)
    for (const id of splitIds(e.split)) referenced.add(id)
  }
  for (const s of settlements) {
    if ('deleted' in s) continue
    referenced.add(s.from)
    referenced.add(s.to)
  }
  const fixedPeople = people.map((p) => {
    if (!p.deleted || !referenced.has(p.id)) return p
    const versions = allPeople.get(p.id) ?? []
    let live: Person | null = null
    for (const v of versions) if (!v.deleted) live = live ? pickWinner(live, v) : v
    const revived: Person = { id: p.id, name: live ? live.name : p.name, updatedAt: M + 1 }
    report.revived.count++
    report.revived.titles.push(revived.name)
    return revived
  })

  const merged: Group = {
    id: local.id,
    name: wm.name,
    currencySymbol: wm.currencySymbol,
    createdAt: Math.min(local.createdAt, incoming.createdAt),
    metaUpdatedAt: wm.updatedAt,
    people: fixedPeople,
    expenses,
    settlements,
  }
  if (wm.emoji !== undefined) merged.emoji = wm.emoji
  if (wm.settledAt !== undefined) merged.settledAt = wm.settledAt
  if (local.isDemo && incoming.isDemo) merged.isDemo = true
  return { merged, report }
}

/** Largest stamp in the merge inputs and output — feed to observeStamp after import. */
export function stampsSeen(...groups: Group[]): number {
  return Math.max(0, ...groups.map(maxStamp))
}

/**
 * "Save as a separate copy": fresh ids for the group and every record (tombstones too),
 * with every reference rewritten. Validated before returning.
 */
export function copyWithNewIds(g: Group, newId: () => Id): Group {
  const map = new Map<Id, Id>()
  const re = (id: Id): Id => {
    let n = map.get(id)
    if (!n) {
      n = newId()
      map.set(id, n)
    }
    return n
  }
  const pmap = (id: Id): Id => {
    const n = map.get(`p:${id}`)
    if (!n) throw new Error(`copy: missing person ${id}`)
    return n
  }
  for (const p of g.people) map.set(`p:${p.id}`, newId())
  const base = [...g.name]
  const suffix = ' (copy)'
  const name = (base.length + suffix.length > 60 ? base.slice(0, 60 - suffix.length).join('').trimEnd() : g.name) + suffix
  const copy: Group = {
    ...g,
    id: re(`g:${g.id}`),
    name,
    people: g.people.map((p) => ({ ...p, id: pmap(p.id) })),
    expenses: g.expenses.map((e): ExpenseRec => {
      if ('deleted' in e) return { ...e, id: re(`e:${e.id}`) }
      let split: Split
      switch (e.split.mode) {
        case 'equal':
          split = { mode: 'equal', participants: e.split.participants.map(pmap) }
          break
        case 'shares':
          split = { mode: 'shares', weights: Object.fromEntries(Object.entries(e.split.weights).map(([k, v]) => [pmap(k), v])) }
          break
        case 'exact':
          split = { mode: 'exact', amounts: Object.fromEntries(Object.entries(e.split.amounts).map(([k, v]) => [pmap(k), v])) }
          break
      }
      return { ...e, id: re(`e:${e.id}`), paidBy: pmap(e.paidBy), split }
    }),
    settlements: g.settlements.map((s): SettlementRec => {
      if ('deleted' in s) return { ...s, id: re(`t:${s.id}`) }
      return { ...s, id: re(`t:${s.id}`), from: pmap(s.from), to: pmap(s.to) }
    }),
  }
  delete copy.isDemo
  return validateGroup(copy)
}

/** "Join Lakehouse Weekend: 4 people, 9 expenses" counts. */
export function groupCounts(g: Group): { people: number; expenses: number; payments: number } {
  return {
    people: g.people.filter((p) => !p.deleted).length,
    expenses: g.expenses.filter((e) => !('deleted' in e)).length,
    payments: g.settlements.filter((s) => !('deleted' in s)).length,
  }
}
