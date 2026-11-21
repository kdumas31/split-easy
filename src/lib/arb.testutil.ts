// fast-check arbitraries shared by the unit tests (not part of the app bundle).

import fc from 'fast-check'
import type { Expense, ExpenseRec, Group, Person, Settlement, SettlementRec, Split } from './types'

export const arbCents = (max = 1_000_000_000) => fc.integer({ min: 0, max })

const NAMES = ['Ada', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jun', 'Kit', 'Lea', '李', 'زين', 'José', 'Zoë "Z"', '#&?+', '👩‍👩‍👧']

export const arbName = fc.oneof(fc.constantFrom(...NAMES), fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0 && s.trim() === s))

const arbDate = fc
  .record({ y: fc.integer({ min: 2020, max: 2030 }), m: fc.integer({ min: 1, max: 12 }), d: fc.integer({ min: 1, max: 28 }) })
  .map(({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

const arbCategory = fc.option(fc.constantFrom('food', 'groceries', 'lodging', 'transport', 'activities', 'shopping', 'utilities', 'other' as const), { nil: undefined })

/** A split over `ids` that is valid for `total`. */
export function arbSplit(ids: string[], total: number): fc.Arbitrary<Split> {
  const equal = fc.subarray(ids, { minLength: 1 }).map((participants): Split => ({ mode: 'equal', participants }))
  const shares = fc
    .array(fc.integer({ min: 0, max: 100 }), { minLength: ids.length, maxLength: ids.length })
    .filter((ws) => ws.some((w) => w > 0))
    .map((ws): Split => ({ mode: 'shares', weights: Object.fromEntries(ids.map((id, i) => [id, ws[i] as number])) }))
  const exact = fc.array(fc.nat(), { minLength: ids.length, maxLength: ids.length }).map((rs): Split => {
    // distribute total by random proportions, put remainder on the first person
    const R = rs.reduce((a, b) => a + b, 0) || 1
    const amounts: Record<string, number> = {}
    let given = 0
    ids.forEach((id, i) => {
      const a = Math.floor((total * (rs[i] as number)) / R)
      amounts[id] = a
      given += a
    })
    amounts[ids[0] as string] = (amounts[ids[0] as string] as number) + (total - given)
    return { mode: 'exact', amounts }
  })
  return fc.oneof(equal, shares, exact)
}

export function arbExpense(id: string, peopleIds: string[], stamps: fc.Arbitrary<number>): fc.Arbitrary<Expense> {
  return fc
    .record({ total: fc.integer({ min: 1, max: 5_000_000 }), payer: fc.constantFrom(...peopleIds), title: arbName, date: arbDate, cat: arbCategory, note: fc.option(arbName, { nil: undefined }), s: stamps })
    .chain((r) =>
      arbSplit(peopleIds, r.total).map((split) => {
        const e: Expense = { id, title: r.title, amountCents: r.total, paidBy: r.payer, split, date: r.date, createdAt: r.s, updatedAt: r.s }
        if (r.cat) e.category = r.cat
        if (r.note) e.note = r.note
        return e
      }),
    )
}

export function arbSettlement(id: string, peopleIds: string[], stamps: fc.Arbitrary<number>): fc.Arbitrary<Settlement> {
  return fc
    .record({ a: fc.constantFrom(...peopleIds), b: fc.constantFrom(...peopleIds), amt: fc.integer({ min: 1, max: 1_000_000 }), date: arbDate, s: stamps })
    .filter((r) => r.a !== r.b)
    .map((r) => ({ id, from: r.a, to: r.b, amountCents: r.amt, date: r.date, updatedAt: r.s }))
}

/** A random valid group (1–maxPeople people). */
export function arbGroup(opts: { maxPeople?: number; maxExpenses?: number; tombstones?: boolean } = {}): fc.Arbitrary<Group> {
  const { maxPeople = 6, maxExpenses = 12, tombstones = true } = opts
  const stamps = fc.integer({ min: 1, max: 2_000_000_000_000 })
  return fc
    .record({ n: fc.integer({ min: 1, max: maxPeople }), ne: fc.integer({ min: 0, max: maxExpenses }), nt: fc.integer({ min: 0, max: 4 }) })
    .chain(({ n, ne, nt }) => {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`)
      const people = fc.tuple(...ids.map((id) => fc.record({ name: arbName, s: stamps }).map((r): Person => ({ id, name: r.name, updatedAt: r.s }))))
      const exp = fc.tuple(
        ...Array.from({ length: ne }, (_, i) => {
          const live = arbExpense(`e${i}`, ids, stamps)
          return tombstones ? fc.oneof({ weight: 5, arbitrary: live as fc.Arbitrary<ExpenseRec> }, { weight: 1, arbitrary: stamps.map((s): ExpenseRec => ({ id: `e${i}`, updatedAt: s, deleted: true })) }) : (live as fc.Arbitrary<ExpenseRec>)
        }),
      )
      const set = n < 2 ? fc.constant([] as SettlementRec[]) : fc.tuple(...Array.from({ length: nt }, (_, i) => arbSettlement(`t${i}`, ids, stamps) as fc.Arbitrary<SettlementRec>))
      return fc.record({
        people,
        exp,
        set,
        name: arbName,
        emoji: fc.option(fc.constantFrom('🛶', '🍕', '👩‍👩‍👧', '🏠'), { nil: undefined }),
        settledAt: fc.option(stamps, { nil: undefined }),
        sym: fc.constantFrom('$', '€', '£', 'CHF', ''),
        created: stamps,
        meta: stamps,
      })
    })
    .map((r) => {
      const g: Group = {
        id: 'g0',
        name: r.name,
        currencySymbol: r.sym,
        createdAt: r.created,
        metaUpdatedAt: r.meta,
        people: [...r.people],
        expenses: [...r.exp],
        settlements: [...r.set],
      }
      if (r.emoji) g.emoji = r.emoji
      if (r.settledAt) g.settledAt = r.settledAt
      return g
    })
}

/**
 * Several divergent copies of the same group, for merge properties.
 * Core people (c0–c2) are never tombstoned and are the only ones referenced, so no revival
 * happens (revival is covered by fixed cases). Small stamp range → lots of ties.
 */
export function arbCopies(count: number): fc.Arbitrary<Group[]> {
  const stamps = fc.integer({ min: 1, max: 12 })
  const core = ['c0', 'c1', 'c2']
  const extra = ['x0', 'x1']
  const maybe = <T,>(a: fc.Arbitrary<T>) => fc.option(a, { nil: undefined })
  const personV = (id: string, canDelete: boolean) =>
    fc.record({ name: fc.constantFrom('Ada', 'Ben', 'Cy', 'Dee'), s: stamps, del: canDelete ? fc.boolean() : fc.constant(false) }).map((r): Person => (r.del ? { id, name: r.name, updatedAt: r.s, deleted: true } : { id, name: r.name, updatedAt: r.s }))
  const expV = (id: string) => fc.oneof({ weight: 4, arbitrary: arbExpense(id, core, stamps) as fc.Arbitrary<ExpenseRec> }, { weight: 1, arbitrary: stamps.map((s): ExpenseRec => ({ id, updatedAt: s, deleted: true })) })
  const setV = (id: string) => fc.oneof({ weight: 3, arbitrary: arbSettlement(id, core, stamps) as fc.Arbitrary<SettlementRec> }, { weight: 1, arbitrary: stamps.map((s): SettlementRec => ({ id, updatedAt: s, deleted: true })) })
  const copy = fc
    .record({
      core: fc.tuple(...core.map((id) => personV(id, false))),
      extra: fc.tuple(...extra.map((id) => maybe(personV(id, true)))),
      exps: fc.tuple(...['e0', 'e1', 'e2', 'e3'].map((id) => maybe(expV(id)))),
      sets: fc.tuple(...['t0', 't1'].map((id) => maybe(setV(id)))),
      name: fc.constantFrom('Trip', 'House', 'Dinner'),
      emoji: maybe(fc.constantFrom('🛶', '🍕')),
      meta: stamps,
      created: fc.integer({ min: 1, max: 3 }),
    })
    .map((r): Group => {
      const g: Group = {
        id: 'g0',
        name: r.name,
        currencySymbol: '$',
        createdAt: r.created,
        metaUpdatedAt: r.meta,
        people: [...r.core, ...r.extra.filter((p): p is Person => !!p)],
        expenses: r.exps.filter((e): e is ExpenseRec => !!e),
        settlements: r.sets.filter((s): s is SettlementRec => !!s),
      }
      if (r.emoji) g.emoji = r.emoji
      return g
    })
  return fc.array(copy, { minLength: count, maxLength: count })
}

/** Order-insensitive normal form for comparing groups. */
export function normalize(g: Group): string {
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return JSON.stringify({ ...g, people: byId(g.people), expenses: byId(g.expenses), settlements: byId(g.settlements) }, (_k, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    }
    return v
  })
}
