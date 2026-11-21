// Pure document actions. Every mutation stamps updatedAt via the monotonic clock.

import { stamp } from '../lib/clock'
import { newId } from '../lib/ids'
import { makeDemoGroup } from '../lib/demo'
import { todayLocal } from '../lib/dates'
import type { Category, DataDoc, Expense, Group, Id, Settings, Split, Transfer } from '../lib/types'
import { isTomb } from '../lib/types'

const mapGroup = (doc: DataDoc, gid: Id, fn: (g: Group) => Group): DataDoc => ({
  ...doc,
  groups: doc.groups.map((g) => (g.id === gid ? fn(g) : g)),
})

export function createGroup(doc: DataDoc, input: { name: string; emoji?: string; currencySymbol: string; people: string[] }): [DataDoc, Id] {
  const t = stamp()
  const g: Group = {
    id: newId(),
    name: input.name.trim(),
    currencySymbol: input.currencySymbol,
    createdAt: t,
    metaUpdatedAt: t,
    people: input.people.map((name) => ({ id: newId(), name: name.trim(), updatedAt: t })),
    expenses: [],
    settlements: [],
  }
  if (input.emoji) g.emoji = input.emoji
  return [{ ...doc, groups: [...doc.groups, g], settings: { ...doc.settings, lastGroupId: g.id } }, g.id]
}

export function addDemoGroup(doc: DataDoc): [DataDoc, Id] {
  const g = makeDemoGroup(newId, stamp)
  return [{ ...doc, groups: [...doc.groups, g], settings: { ...doc.settings, lastGroupId: g.id } }, g.id]
}

export function updateGroupMeta(doc: DataDoc, gid: Id, patch: { name?: string; emoji?: string | null; currencySymbol?: string }): DataDoc {
  return mapGroup(doc, gid, (g) => {
    const next: Group = { ...g, metaUpdatedAt: stamp() }
    if (patch.name !== undefined) next.name = patch.name.trim()
    if (patch.currencySymbol !== undefined) next.currencySymbol = patch.currencySymbol
    if (patch.emoji === null || patch.emoji === '') delete next.emoji
    else if (patch.emoji !== undefined) next.emoji = patch.emoji
    return next
  })
}

export function deleteGroup(doc: DataDoc, gid: Id): DataDoc {
  stamp()
  const settings: Settings = { ...doc.settings }
  if (settings.lastGroupId === gid) delete settings.lastGroupId
  return { ...doc, groups: doc.groups.filter((g) => g.id !== gid), settings }
}

export function setSettled(doc: DataDoc, gid: Id, settled: boolean): DataDoc {
  return mapGroup(doc, gid, (g) => {
    const t = stamp()
    const next: Group = { ...g, metaUpdatedAt: t }
    if (settled) next.settledAt = t
    else delete next.settledAt
    return next
  })
}

export function addPerson(doc: DataDoc, gid: Id, name: string): DataDoc {
  return mapGroup(doc, gid, (g) => ({ ...g, people: [...g.people, { id: newId(), name: name.trim(), updatedAt: stamp() }] }))
}

export function renamePerson(doc: DataDoc, gid: Id, pid: Id, name: string): DataDoc {
  return mapGroup(doc, gid, (g) => ({
    ...g,
    people: g.people.map((p) => (p.id === pid ? { id: p.id, name: name.trim(), updatedAt: stamp() } : p)),
  }))
}

/** How many live records refer to this person (deletion is blocked while > 0). */
export function personRefCount(g: Group, pid: Id): number {
  let n = 0
  for (const e of g.expenses) {
    if (isTomb(e)) continue
    const s = e.split
    const inSplit = s.mode === 'equal' ? s.participants.includes(pid) : s.mode === 'shares' ? (s.weights[pid] ?? 0) > 0 || pid in s.weights : pid in s.amounts
    if (e.paidBy === pid || inSplit) n++
  }
  for (const s of g.settlements) if (!isTomb(s) && (s.from === pid || s.to === pid)) n++
  return n
}

export function removePerson(doc: DataDoc, gid: Id, pid: Id): DataDoc {
  return mapGroup(doc, gid, (g) => {
    if (personRefCount(g, pid) > 0) throw new Error('Person is still used')
    return { ...g, people: g.people.map((p) => (p.id === pid ? { id: p.id, name: p.name, updatedAt: stamp(), deleted: true as const } : p)) }
  })
}

export interface ExpenseInput {
  title: string
  amountCents: number
  paidBy: Id
  split: Split
  category?: Category | undefined
  note?: string | undefined
  date: string
}

export function saveExpense(doc: DataDoc, gid: Id, eid: Id | null, input: ExpenseInput): [DataDoc, Id] {
  const t = stamp()
  const id = eid ?? newId()
  let createdAt = t
  const g0 = doc.groups.find((g) => g.id === gid)
  const prev = g0?.expenses.find((e) => e.id === id)
  if (prev && !isTomb(prev)) createdAt = prev.createdAt
  const e: Expense = {
    id,
    title: input.title.trim(),
    amountCents: input.amountCents,
    paidBy: input.paidBy,
    split: input.split,
    date: input.date,
    createdAt,
    updatedAt: t,
  }
  if (input.category) e.category = input.category
  const note = input.note?.trim()
  if (note) e.note = note
  const next = mapGroup(doc, gid, (g) => ({
    ...g,
    expenses: prev ? g.expenses.map((x) => (x.id === id ? e : x)) : [...g.expenses, e],
  }))
  return [next, id]
}

export function deleteExpense(doc: DataDoc, gid: Id, eid: Id): DataDoc {
  return mapGroup(doc, gid, (g) => ({
    ...g,
    expenses: g.expenses.map((e) => (e.id === eid ? { id: e.id, updatedAt: stamp(), deleted: true as const } : e)),
  }))
}

export function recordSettlement(doc: DataDoc, gid: Id, t: Transfer, date = todayLocal()): [DataDoc, Id] {
  const id = newId()
  const next = mapGroup(doc, gid, (g) => ({
    ...g,
    settlements: [...g.settlements, { id, from: t.from, to: t.to, amountCents: t.amountCents, date, updatedAt: stamp() }],
  }))
  return [next, id]
}

export function editSettlement(doc: DataDoc, gid: Id, sid: Id, patch: { amountCents: number; date: string }): DataDoc {
  return mapGroup(doc, gid, (g) => ({
    ...g,
    settlements: g.settlements.map((s) => (s.id === sid && !isTomb(s) ? { ...s, ...patch, updatedAt: stamp() } : s)),
  }))
}

export function deleteSettlement(doc: DataDoc, gid: Id, sid: Id): DataDoc {
  return mapGroup(doc, gid, (g) => ({
    ...g,
    settlements: g.settlements.map((s) => (s.id === sid ? { id: s.id, updatedAt: stamp(), deleted: true as const } : s)),
  }))
}

export function updateSettings(doc: DataDoc, patch: Partial<Settings>): DataDoc {
  stamp()
  return { ...doc, settings: { ...doc.settings, ...patch } }
}
