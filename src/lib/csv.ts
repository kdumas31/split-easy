// CSV export (PLAN.md §7 CSV spec).

import { plainCents } from './money'
import { computeShares } from './split'
import { liveExpenses, liveSettlements, type Group, type Id } from './types'

export const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food & drink',
  groceries: 'Groceries',
  lodging: 'Lodging',
  transport: 'Transport',
  activities: 'Activities',
  shopping: 'Shopping',
  utilities: 'Utilities',
  other: 'Other',
}

const MODE_LABELS = { equal: 'Equal', shares: 'Shares', exact: 'Exact' } as const

/** Escape one text cell: formula-injection guard, then RFC 4180 quoting. */
export function textCell(v: string): string {
  let s = v
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return s || 'group'
}

export function csvFilename(g: Group, today: string): string {
  return `split-easy-${slugify(g.name)}-${today}.csv`
}

export function groupToCsv(g: Group): string {
  const people = g.people.filter((p) => !p.deleted)
  const nameOf = new Map<Id, string>(g.people.map((p) => [p.id, p.name]))
  const memberIds = g.people.map((p) => p.id)
  const header = ['Type', 'Date', 'Description', 'Category', 'Paid by', 'Paid to', 'Amount', 'Split', ...people.map((p) => p.name), 'Note']
  const rows: string[][] = [header.map(textCell)]

  const items = [
    ...liveExpenses(g).map((e) => ({ date: e.date, sortKey: e.createdAt, kind: 'e' as const, e })),
    ...liveSettlements(g).map((s) => ({ date: s.date, sortKey: s.updatedAt, kind: 's' as const, s })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sortKey - b.sortKey))

  for (const it of items) {
    if (it.kind === 'e') {
      const e = it.e
      const shares = computeShares(e.amountCents, e.split, e.id, memberIds)
      rows.push([
        'Expense',
        e.date,
        textCell(e.title),
        textCell(e.category ? (CATEGORY_LABELS[e.category] ?? e.category) : ''),
        textCell(nameOf.get(e.paidBy) ?? ''),
        '',
        plainCents(e.amountCents),
        MODE_LABELS[e.split.mode],
        ...people.map((p) => plainCents(shares.get(p.id) ?? 0)),
        textCell(e.note ?? ''),
      ])
    } else {
      const s = it.s
      rows.push([
        'Payment',
        s.date,
        textCell(`${nameOf.get(s.from) ?? ''} paid ${nameOf.get(s.to) ?? ''}`),
        '',
        textCell(nameOf.get(s.from) ?? ''),
        textCell(nameOf.get(s.to) ?? ''),
        plainCents(s.amountCents),
        '',
        ...people.map(() => ''),
        '',
      ])
    }
  }
  return '﻿' + rows.map((r) => r.join(',')).join('\r\n') + '\r\n'
}
