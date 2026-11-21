import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { arbCopies, normalize } from './arb.testutil'
import { computeBalances } from './balances'
import { onStamp, resetClock, stamp } from './clock'
import { canonical, copyWithNewIds, maxStamp, mergeGroup } from './share/merge'
import { KEY_UNDO, applyUndo, clearUndo, memoryStorage, readUndo, writeUndo } from './storage'
import type { Expense, Group } from './types'

const ex = (id: string, title: string, updatedAt: number, over: Partial<Expense> = {}): Expense => ({
  id,
  title,
  amountCents: 1000,
  paidBy: 'a',
  split: { mode: 'equal', participants: ['a', 'b'] },
  date: '2026-05-01',
  createdAt: 1,
  updatedAt,
  ...over,
})

function g(over: Partial<Group> = {}): Group {
  return {
    id: 'G',
    name: 'Trip',
    currencySymbol: '$',
    createdAt: 1,
    metaUpdatedAt: 1,
    people: [
      { id: 'a', name: 'Ada', updatedAt: 1 },
      { id: 'b', name: 'Ben', updatedAt: 1 },
    ],
    expenses: [],
    settlements: [],
    ...over,
  }
}

let n = 0
const seqId = () => `N${String(++n).padStart(6, '0')}`

afterEach(() => vi.restoreAllMocks())

describe('mergeGroup fixed cases', () => {
  it('keeps local-only, adds incoming-only', () => {
    const local = g({ expenses: [ex('e1', 'Mine', 5)] })
    const inc = g({ expenses: [ex('e2', 'Theirs', 6)] })
    const { merged, report } = mergeGroup(local, inc)
    expect(merged.expenses.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    expect(report.added).toEqual({ count: 1, titles: ['Theirs'] })
    expect(report.keptLocal.titles).toContain('Mine')
  })

  it('newer edit wins each way', () => {
    const local = g({ expenses: [ex('e1', 'Local newer', 9)] })
    const inc = g({ expenses: [ex('e1', 'Their older', 4)] })
    expect((mergeGroup(local, inc).merged.expenses[0] as Expense).title).toBe('Local newer')
    expect(mergeGroup(local, inc).report.localWins.count).toBe(1)
    const r2 = mergeGroup(inc, local)
    expect((r2.merged.expenses[0] as Expense).title).toBe('Local newer')
    expect(r2.report.updated).toEqual({ count: 1, titles: ['Local newer'] })
  })

  it('newer tombstone deletes; older tombstone loses', () => {
    const local = g({ expenses: [ex('e1', 'Dinner', 5)] })
    const r1 = mergeGroup(local, g({ expenses: [{ id: 'e1', updatedAt: 6, deleted: true }] }))
    expect(r1.merged.expenses[0]).toEqual({ id: 'e1', updatedAt: 6, deleted: true })
    expect(r1.report.removed).toEqual({ count: 1, titles: ['Dinner'] })
    const r2 = mergeGroup(local, g({ expenses: [{ id: 'e1', updatedAt: 4, deleted: true }] }))
    expect((r2.merged.expenses[0] as Expense).title).toBe('Dinner')
  })

  it('tie: same stamp, different content → greater canonical JSON wins, both ways', () => {
    const a = g({ expenses: [ex('e1', 'Alpha', 5)] })
    const b = g({ expenses: [ex('e1', 'Bravo', 5)] })
    const want = canonical(ex('e1', 'Alpha', 5)) > canonical(ex('e1', 'Bravo', 5)) ? 'Alpha' : 'Bravo'
    expect((mergeGroup(a, b).merged.expenses[0] as Expense).title).toBe(want)
    expect((mergeGroup(b, a).merged.expenses[0] as Expense).title).toBe(want)
  })

  it('meta: greater metaUpdatedAt wins', () => {
    const r = mergeGroup(g({ name: 'Old', metaUpdatedAt: 2 }), g({ name: 'New', metaUpdatedAt: 3, emoji: '🛶' }))
    expect(r.merged.name).toBe('New')
    expect(r.merged.emoji).toBe('🛶')
    expect(r.report.metaChanged).toBe(true)
  })

  it('revives a referenced tombstoned person with their name and updatedAt = M + 1', () => {
    const local = g({ people: [{ id: 'a', name: 'Ada', updatedAt: 1 }, { id: 'b', name: 'Ben', updatedAt: 1 }], expenses: [ex('e1', 'Dinner', 3)] })
    const inc = g({ people: [{ id: 'a', name: 'Ada', updatedAt: 1 }, { id: 'b', name: 'Ben (old)', updatedAt: 7, deleted: true }], metaUpdatedAt: 40 })
    const { merged, report } = mergeGroup(local, inc)
    const b = merged.people.find((p) => p.id === 'b')
    expect(b).toEqual({ id: 'b', name: 'Ben', updatedAt: 41 })
    expect(report.revived).toEqual({ count: 1, titles: ['Ben'] })
    expect(mergeGroup(inc, local).merged.people.find((p) => p.id === 'b')).toEqual(b)
  })

  it('revival falls back to the name carried on the tombstone', () => {
    const local = g({ people: [{ id: 'a', name: 'Ada', updatedAt: 1 }, { id: 'b', name: 'Bea', updatedAt: 2, deleted: true }], expenses: [ex('e1', 'Dinner', 3)] })
    const inc = g({ people: [{ id: 'a', name: 'Ada', updatedAt: 1 }, { id: 'b', name: 'Bea', updatedAt: 2, deleted: true }] })
    expect(mergeGroup(local, inc).merged.people.find((p) => p.id === 'b')?.name).toBe('Bea')
  })

  it('report titles payments as "Payment: Ben → Ada $10.00"', () => {
    const inc = g({ settlements: [{ id: 't1', from: 'b', to: 'a', amountCents: 1000, date: '2026-05-02', updatedAt: 3 }] })
    expect(mergeGroup(g(), inc).report.added.titles).toEqual(['Payment: Ben → Ada $10.00'])
  })

  it('never reads the clock', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock read!')
    })
    const local = g({ expenses: [ex('e1', 'Dinner', 3)] })
    const inc = g({ people: [{ id: 'a', name: 'Ada', updatedAt: 1 }, { id: 'b', name: 'Ben', updatedAt: 9, deleted: true }] })
    expect(() => mergeGroup(local, inc)).not.toThrow()
  })
})

describe('save as a separate copy', () => {
  it('re-ids everything and rewrites every reference', () => {
    const src = g({
      people: [
        { id: 'a', name: 'Ada', updatedAt: 1 },
        { id: 'b', name: 'Ben', updatedAt: 1 },
        { id: 'c', name: 'Cy', updatedAt: 1, deleted: true },
      ],
      expenses: [
        ex('e1', 'Eq', 2),
        ex('e2', 'Sh', 2, { paidBy: 'b', split: { mode: 'shares', weights: { a: 1, b: 2 } } }),
        ex('e3', 'Ex', 2, { split: { mode: 'exact', amounts: { a: 400, b: 600 } } }),
        { id: 'e4', updatedAt: 3, deleted: true },
      ],
      settlements: [{ id: 't1', from: 'b', to: 'a', amountCents: 50, date: '2026-05-02', updatedAt: 4 }, { id: 't2', updatedAt: 4, deleted: true }],
    })
    const copy = copyWithNewIds(src, seqId)
    const orig = new Set(['G', 'a', 'b', 'c', 'e1', 'e2', 'e3', 'e4', 't1', 't2'])
    const json = JSON.stringify(copy)
    for (const id of orig) expect(json.includes(`"${id}"`), id).toBe(false)
    expect(copy.name).toBe('Trip (copy)')
    expect(Object.fromEntries(computeBalances(copy)).constructor).toBe(Object)
    const balOrig = [...computeBalances(src).values()].sort()
    const balCopy = [...computeBalances(copy).values()].sort()
    expect(balCopy).toEqual(balOrig)
  })

  it('long names are trimmed to fit', () => {
    const copy = copyWithNewIds(g({ name: 'x'.repeat(60) }), seqId)
    expect([...copy.name].length).toBe(60)
    expect(copy.name.endsWith(' (copy)')).toBe(true)
  })
})

describe('undo', () => {
  it('undo of a newly saved group removes it; undo of a merge restores it', () => {
    const before = g({ name: 'Before' })
    const after = g({ name: 'After' })
    const other = g({ id: 'Other' })
    expect(applyUndo([other, after], { groupId: 'G', before: null, afterStamp: 1 })).toEqual([other])
    expect(applyUndo([other, after], { groupId: 'G', before, afterStamp: 1 })).toEqual([other, before])
  })

  it('expires on the next local edit and on the next import', () => {
    const s = memoryStorage()
    resetClock(0)
    const off = onStamp(() => clearUndo(s))
    writeUndo(s, { groupId: 'G', before: null, afterStamp: 1 })
    expect(readUndo(s)).not.toBeNull()
    stamp() // any local edit
    expect(s.getItem(KEY_UNDO)).toBeNull()
    off()
    // next import overwrites/clears the previous record
    writeUndo(s, { groupId: 'G', before: g(), afterStamp: 2 })
    clearUndo(s)
    writeUndo(s, { groupId: 'H', before: null, afterStamp: 3 })
    expect(readUndo(s)?.groupId).toBe('H')
  })
})

describe('merge properties', () => {
  it('idempotent: merge(a, a) ≡ a', () => {
    fc.assert(
      fc.property(arbCopies(1), ([a]) => {
        expect(normalize(mergeGroup(a!, a!).merged)).toBe(normalize(a!))
      }),
    )
  })

  it('commutative: merge(a, b) ≡ merge(b, a)', () => {
    fc.assert(
      fc.property(arbCopies(2), ([a, b]) => {
        expect(normalize(mergeGroup(a!, b!).merged)).toBe(normalize(mergeGroup(b!, a!).merged))
      }),
    )
  })

  it('associative: merge(merge(a, b), c) ≡ merge(a, merge(b, c))', () => {
    fc.assert(
      fc.property(arbCopies(3), ([a, b, c]) => {
        const left = mergeGroup(mergeGroup(a!, b!).merged, c!).merged
        const right = mergeGroup(a!, mergeGroup(b!, c!).merged).merged
        expect(normalize(left)).toBe(normalize(right))
      }),
    )
  })

  it('local-only ids survive; deletes only by a newer-or-tie-winning tombstone; Σ balances 0', () => {
    fc.assert(
      fc.property(arbCopies(2), ([a, b]) => {
        const { merged } = mergeGroup(a!, b!)
        for (const coll of ['people', 'expenses', 'settlements'] as const) {
          const mIds = new Map(merged[coll].map((r) => [r.id, r]))
          for (const l of a![coll]) {
            const m = mIds.get(l.id)
            expect(m, `${coll} ${l.id}`).toBeDefined()
            if (!('deleted' in l && l.deleted) && m && 'deleted' in m && m.deleted) {
              const i = b![coll].find((r) => r.id === l.id)
              expect(i && 'deleted' in i && i.deleted).toBe(true)
              expect(i!.updatedAt).toBeGreaterThanOrEqual(l.updatedAt)
            }
          }
        }
        expect([...computeBalances(merged).values()].reduce((x, y) => x + y, 0)).toBe(0)
      }),
    )
  })

  it('commutative even when revival happens', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 }), fc.boolean(), (s1, s2, delBoth) => {
        const a = g({ people: [{ id: 'a', name: 'Ada', updatedAt: 1 }, { id: 'b', name: 'Ben', updatedAt: s1, ...(delBoth ? { deleted: true as const } : {}) }], expenses: [ex('e1', 'D', 2)] })
        const b = g({ people: [{ id: 'a', name: 'Ada', updatedAt: 1 }, { id: 'b', name: 'Benny', updatedAt: s2, deleted: true }] })
        const ab = mergeGroup(a, b).merged
        expect(normalize(ab)).toBe(normalize(mergeGroup(b, a).merged))
        expect(ab.people.find((p) => p.id === 'b')?.deleted).toBeUndefined()
        expect(maxStamp(ab)).toBeGreaterThanOrEqual(Math.max(maxStamp(a), maxStamp(b)))
      }),
      { numRuns: 50 },
    )
  })
})
