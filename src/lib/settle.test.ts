import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeBalances, computeTotals, groupTotal } from './balances'
import { arbGroup } from './arb.testutil'
import { settleUp, sortTransfers } from './settle'
import type { Group, Transfer } from './types'

const D = 100 // dollars → cents
const fmt = (ts: Transfer[]) => ts.map((t) => `${t.from}->${t.to}:${t.amountCents}`)

function apply(bal: Map<string, number>, ts: Transfer[]) {
  const b = new Map(bal)
  for (const t of ts) {
    b.set(t.from, (b.get(t.from) ?? 0) + t.amountCents)
    b.set(t.to, (b.get(t.to) ?? 0) - t.amountCents)
  }
  return b
}

/** Brute-force oracle: min transfers = n − (max number of disjoint zero-sum groups). */
function oracleMin(vals: number[]): number {
  const xs = vals.filter((v) => v !== 0)
  let best = 0
  const rec = (rest: number[], k: number) => {
    if (rest.length === 0) {
      best = Math.max(best, k)
      return
    }
    // the first remaining person belongs to some zero-sum group containing them
    const [first, ...others] = rest as [number, ...number[]]
    const m = others.length
    for (let mask = 0; mask < 1 << m; mask++) {
      let s = first
      for (let i = 0; i < m; i++) if (mask & (1 << i)) s += others[i] as number
      if (s !== 0) continue
      rec(
        others.filter((_, i) => !(mask & (1 << i))),
        k + 1,
      )
    }
  }
  rec(xs, 0)
  return xs.length - best
}

const arbBalances = (maxN: number) =>
  fc.array(fc.integer({ min: -5000, max: 5000 }), { minLength: 1, maxLength: maxN - 1 }).map((xs) => {
    const s = xs.reduce((a, b) => a + b, 0)
    const all = [...xs, -s]
    return new Map(all.map((v, i) => [`p${String(i).padStart(2, '0')}`, v]))
  })

describe('settleUp fixed cases', () => {
  it('example D beats greedy: 3 transfers', () => {
    const bal = new Map([
      ['Ada', 50 * D],
      ['Ben', 40 * D],
      ['Cy', 30 * D],
      ['Dee', -50 * D],
      ['Eli', -70 * D],
    ])
    expect(fmt(settleUp(bal))).toEqual(['Dee->Ada:5000', 'Eli->Ben:4000', 'Eli->Cy:3000'])
  })

  it('example E: golden display order', () => {
    const bal = new Map([
      ['Ada', 400 * D],
      ['Ben', -120 * D],
      ['Cy', -80 * D],
      ['Dee', -200 * D],
    ])
    expect(fmt(settleUp(bal))).toEqual(['Ben->Ada:12000', 'Cy->Ada:8000', 'Dee->Ada:20000'])
  })

  it('sortTransfers: fixed golden order regardless of input order', () => {
    const t = (from: string, to: string, amountCents: number): Transfer => ({ from, to, amountCents })
    const golden = ['Ben->Ada:12000', 'Cy->Ada:8000', 'Dee->Ada:20000']
    const inputs = [
      [t('Dee', 'Ada', 20000), t('Ben', 'Ada', 12000), t('Cy', 'Ada', 8000)],
      [t('Cy', 'Ada', 8000), t('Dee', 'Ada', 20000), t('Ben', 'Ada', 12000)],
    ]
    for (const ts of inputs) expect(fmt(sortTransfers(ts))).toEqual(golden)
  })

  it('sortTransfers: locale-free name rule (case-folded, then UTF-16 code units, then id)', () => {
    const names: Record<string, string> = { p1: 'éclair', p2: 'Zed', p3: 'ada', p4: 'Ada', p5: 'Bo', p6: 'Bo' }
    const nameOf = (id: string) => names[id] ?? id
    const ts: Transfer[] = ['p1', 'p2', 'p3', 'p6', 'p4', 'p5'].map((from) => ({ from, to: 'x', amountCents: 1 }))
    // 'Ada' < 'ada' (raw tiebreak), 'Zed' < 'éclair' (code units, not locale), equal names fall back to id.
    expect(sortTransfers(ts, nameOf).map((x) => x.from)).toEqual(['p4', 'p3', 'p5', 'p6', 'p2', 'p1'])
  })

  it('empty / balanced / single / two people', () => {
    expect(settleUp(new Map())).toEqual([])
    expect(settleUp(new Map([['a', 0], ['b', 0]]))).toEqual([])
    expect(settleUp(new Map([['a', 0]]))).toEqual([])
    expect(fmt(settleUp(new Map([['a', 500], ['b', -500]])))).toEqual(['b->a:500'])
  })

  it('two optimal partitions → the smallest-bitmask one is chosen', () => {
    // sorted by (balance, id): a=-10 (bit0), b=-10 (bit1), c=+10 (bit2), d=+10 (bit3).
    // Both {a,c}{b,d} and {a,d}{b,c} are optimal; smallest atomic mask containing bit0 is a+c (0b0101).
    const bal = new Map([
      ['c', 10],
      ['d', 10],
      ['a', -10],
      ['b', -10],
    ])
    expect(fmt(settleUp(bal))).toEqual(['a->c:10', 'b->d:10'])
  })

  it('names drive the display order when given', () => {
    const names: Record<string, string> = { x1: 'Zed', x2: 'Amy', x3: 'Bo' }
    const ts = settleUp(new Map([['x1', -5], ['x2', -5], ['x3', 10]]), (id) => names[id] ?? id)
    expect(fmt(ts)).toEqual(['x2->x3:5', 'x1->x3:5'])
  })

  it('17+ nonzero people uses the fallback and still settles', () => {
    const bal = new Map<string, number>()
    for (let i = 0; i < 20; i++) bal.set(`p${String(i).padStart(2, '0')}`, i % 2 ? 100 + i : -(100 + i - 1))
    const s = [...bal.values()].reduce((a, b) => a + b, 0)
    bal.set('z', -s)
    const ts = settleUp(bal)
    for (const v of apply(bal, ts).values()) expect(v).toBe(0)
    expect(ts.length).toBeLessThanOrEqual(20)
  })

  it('rejects balances that do not sum to zero', () => {
    expect(() => settleUp(new Map([['a', 1]]))).toThrow()
  })
})

describe('settleUp properties', () => {
  it('zeroes every balance, positive integer amounts, no self-transfers, ≤ n−1, deterministic', () => {
    fc.assert(
      fc.property(arbBalances(14), (bal) => {
        const ts = settleUp(bal)
        for (const v of apply(bal, ts).values()) expect(v).toBe(0)
        const n = [...bal.values()].filter((v) => v !== 0).length
        expect(ts.length).toBeLessThanOrEqual(Math.max(0, n - 1))
        for (const t of ts) {
          expect(Number.isSafeInteger(t.amountCents) && t.amountCents > 0).toBe(true)
          expect(t.from).not.toBe(t.to)
        }
        expect(settleUp(new Map([...bal].reverse()))).toEqual(ts)
      }),
      { numRuns: 100 },
    )
  })

  it('count equals the brute-force oracle (n ≤ 7, 20 runs)', () => {
    fc.assert(
      fc.property(
        // small values make zero-sum subgroups common
        fc.array(fc.integer({ min: -4, max: 4 }), { minLength: 1, maxLength: 6 }).map((xs) => {
          const s = xs.reduce((a, b) => a + b, 0)
          return new Map([...xs, -s].map((v, i) => [`p${i}`, v * 100]))
        }),
        (bal) => {
          expect(settleUp(bal).length).toBe(oracleMin([...bal.values()]))
        },
      ),
      { numRuns: 20 },
    )
  })

  it('fallback path (n > 16) settles everything', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -9999, max: 9999 }), { minLength: 17, maxLength: 30 }), (xs) => {
        const s = xs.reduce((a, b) => a + b, 0)
        const bal = new Map([...xs, -s].map((v, i) => [`p${String(i).padStart(2, '0')}`, v]))
        const ts = settleUp(bal)
        for (const v of apply(bal, ts).values()) expect(v).toBe(0)
        const n = [...bal.values()].filter((v) => v !== 0).length
        expect(ts.length).toBeLessThanOrEqual(Math.max(0, n - 1))
      }),
      { numRuns: 30 },
    )
  })
})

const P = (id: string, name: string) => ({ id, name, updatedAt: 1 })

function exampleE(): Group {
  const all = ['ada', 'ben', 'cy', 'dee']
  const ex = (id: string, title: string, cents: number, paidBy: string) => ({
    id,
    title,
    amountCents: cents,
    paidBy,
    split: { mode: 'equal' as const, participants: all },
    date: '2026-07-04',
    createdAt: 1,
    updatedAt: 1,
  })
  return {
    id: 'g',
    name: 'Mini trip',
    currencySymbol: '$',
    createdAt: 1,
    metaUpdatedAt: 1,
    people: [P('ada', 'Ada'), P('ben', 'Ben'), P('cy', 'Cy'), P('dee', 'Dee')],
    expenses: [ex('e1', 'Cabin', 60000, 'ada'), ex('e2', 'Gas', 8000, 'ben'), ex('e3', 'Dinner', 12000, 'cy')],
    settlements: [],
  }
}

describe('balances', () => {
  it('example E balances and transfers', () => {
    const g = exampleE()
    const bal = computeBalances(g)
    expect(Object.fromEntries(bal)).toEqual({ ada: 40000, ben: -12000, cy: -8000, dee: -20000 })
    expect(groupTotal(g)).toBe(80000)
    const names: Record<string, string> = { ada: 'Ada', ben: 'Ben', cy: 'Cy', dee: 'Dee' }
    expect(fmt(settleUp(bal, (id) => names[id] ?? id))).toEqual(['ben->ada:12000', 'cy->ada:8000', 'dee->ada:20000'])
  })

  it('a recorded payment shifts balances (Mark paid)', () => {
    const g = exampleE()
    g.settlements.push({ id: 't1', from: 'ben', to: 'ada', amountCents: 12000, date: '2026-07-05', updatedAt: 2 })
    const bal = computeBalances(g)
    expect(bal.get('ben')).toBe(0)
    expect(bal.get('ada')).toBe(28000)
    expect(settleUp(bal).length).toBe(2)
  })

  it('deleted records are ignored', () => {
    const g = exampleE()
    g.expenses[0] = { id: 'e1', updatedAt: 5, deleted: true }
    g.settlements.push({ id: 't1', updatedAt: 3, deleted: true })
    expect(groupTotal(g)).toBe(20000)
    expect([...computeBalances(g).values()].reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('payer outside the participant list', () => {
    const g = exampleE()
    g.expenses = [{ id: 'k', title: 'Kids tickets', amountCents: 3000, paidBy: 'ada', split: { mode: 'equal', participants: ['ben', 'cy'] }, date: '2026-07-04', createdAt: 1, updatedAt: 1 }]
    const t = computeTotals(g)
    expect(t.get('ada')).toMatchObject({ paid: 3000, share: 0, balance: 3000 })
    expect(t.get('ben')?.balance).toBe(-1500)
  })

  it('Σ balances = 0 for random groups (1–30 people, up to 200 expenses)', () => {
    fc.assert(
      fc.property(arbGroup({ maxPeople: 30, maxExpenses: 200 }), (g) => {
        const s = [...computeBalances(g).values()].reduce((a, b) => a + b, 0)
        expect(s).toBe(0)
      }),
      { numRuns: 40 },
    )
  })
})
