import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { allocate, computeShares, SplitError } from './split'

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
const obj = (m: Map<string, number>) => Object.fromEntries(m)

const arbIds = (min: number, max: number) => fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/), { minLength: min, maxLength: max })

describe('equal split', () => {
  it('example A: $100.00 among Ada, Ben, Cy → Ben gets the extra cent', () => {
    const r = computeShares(10000, { mode: 'equal', participants: ['p_ada', 'p_ben', 'p_cy'] }, 'e_groceries')
    expect(obj(r)).toEqual({ p_ada: 3333, p_ben: 3334, p_cy: 3333 })
  })

  it('single person gets everything', () => {
    expect(obj(computeShares(777, { mode: 'equal', participants: ['a'] }, 'x'))).toEqual({ a: 777 })
  })

  it('total 0 → everyone 0', () => {
    expect(obj(computeShares(0, { mode: 'equal', participants: ['a', 'b', 'c'] }, 'x'))).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('1¢ among 3 → exactly one person gets it, chosen by rotation', () => {
    const r = computeShares(1, { mode: 'equal', participants: ['a', 'b', 'c'] }, 'e_groceries')
    expect([...r.values()].sort()).toEqual([0, 0, 1])
    expect(r.get('b')).toBe(1) // rotation 1 → order [b, c, a]
  })

  it('50 people', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `p${String(i).padStart(2, '0')}`)
    const r = computeShares(100_001, { mode: 'equal', participants: ids }, 'big')
    expect(sum(r)).toBe(100_001)
    const vals = [...r.values()]
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1)
    expect(vals.filter((v) => v === 2001).length).toBe(1)
  })

  it('rejects empty participants and non-integer totals', () => {
    expect(() => computeShares(100, { mode: 'equal', participants: [] }, 'x')).toThrow(SplitError)
    expect(() => computeShares(1.5, { mode: 'equal', participants: ['a'] }, 'x')).toThrow()
    expect(() => computeShares(-1, { mode: 'equal', participants: ['a'] }, 'x')).toThrow(SplitError)
    expect(() => computeShares(1_000_000_001, { mode: 'equal', participants: ['a'] }, 'x')).toThrow(SplitError)
  })

  it('rejects unknown people when members are given', () => {
    expect(() => computeShares(100, { mode: 'equal', participants: ['a', 'zz'] }, 'x', ['a', 'b'])).toThrow(/not in this group/)
  })

  it('properties: Σ = total, ≥ 0, max−min ≤ 1, deterministic, order-independent', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), arbIds(1, 30), fc.string(), (total, ids, eid) => {
        const r1 = computeShares(total, { mode: 'equal', participants: ids }, eid)
        const r2 = computeShares(total, { mode: 'equal', participants: [...ids].reverse() }, eid)
        expect(sum(r1)).toBe(total)
        const vals = [...r1.values()]
        expect(Math.min(...vals)).toBeGreaterThanOrEqual(0)
        expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1)
        expect(obj(r1)).toEqual(obj(r2))
        expect(obj(computeShares(total, { mode: 'equal', participants: ids }, eid))).toEqual(obj(r1))
      }),
    )
  })

  it('rotation spreads extra cents across expenses', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 300; i++) {
      const r = computeShares(100, { mode: 'equal', participants: ['a', 'b', 'c'] }, `exp${i}`)
      for (const [k, v] of r) if (v === 34) counts[k]!++
    }
    for (const k of ['a', 'b', 'c']) expect(counts[k]).toBeGreaterThan(50)
  })
})

describe('shares split', () => {
  it('example B: $100.01 with weights 2/1/1 → Ada $50.01', () => {
    const r = computeShares(10001, { mode: 'shares', weights: { p_ada: 2, p_ben: 1, p_cy: 1 } }, 'e_pizza')
    expect(obj(r)).toEqual({ p_ada: 5001, p_ben: 2500, p_cy: 2500 })
  })

  it('zero-weight and omitted members get 0', () => {
    const r = computeShares(900, { mode: 'shares', weights: { a: 1, b: 2, c: 0 } }, 'x', ['a', 'b', 'c', 'd'])
    expect(obj(r)).toEqual({ a: 300, b: 600, c: 0, d: 0 })
  })

  it('rejects bad weights and totals', () => {
    expect(() => computeShares(100, { mode: 'shares', weights: { a: 0, b: 0 } }, 'x')).toThrow(/above 0/)
    expect(() => computeShares(100, { mode: 'shares', weights: { a: 1.5 } }, 'x')).toThrow(SplitError)
    expect(() => computeShares(100, { mode: 'shares', weights: { a: 101 } }, 'x')).toThrow(SplitError)
    expect(() => computeShares(100, { mode: 'shares', weights: { a: -1, b: 2 } }, 'x')).toThrow(SplitError)
    expect(() => computeShares(1_000_000_001, { mode: 'shares', weights: { a: 1 } }, 'x')).toThrow(SplitError)
    expect(() => allocate(100, [['a', 1], ['a', 1]], 'x')).toThrow(SplitError)
  })

  it('properties: Σ = total, within 1¢ of exact proportion, order-independent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        arbIds(1, 20).chain((ids) => fc.tuple(fc.constant(ids), fc.array(fc.integer({ min: 0, max: 100 }), { minLength: ids.length, maxLength: ids.length }))),
        fc.string(),
        (total, [ids, ws], eid) => {
          fc.pre(ws.some((w) => w > 0))
          const pairs = ids.map((id, i) => [id, ws[i] as number] as const)
          const W = ws.reduce((a, b) => a + b, 0)
          const r = allocate(total, pairs, eid)
          expect(sum(r)).toBe(total)
          for (const [id, w] of pairs) expect(Math.abs((r.get(id) as number) - (total * w) / W)).toBeLessThan(1)
          expect(obj(allocate(total, [...pairs].reverse(), eid))).toEqual(obj(r))
        },
      ),
    )
  })
})

describe('exact split', () => {
  it('example C: 1¢ short is rejected with the standard wording', () => {
    try {
      computeShares(4500, { mode: 'exact', amounts: { a: 2000, b: 1500, c: 999 } }, 'x')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(SplitError)
      expect((e as SplitError).message).toBe('1¢ left to assign')
      expect((e as SplitError).diff).toBe(1)
    }
  })

  it('over the total', () => {
    expect(() => computeShares(4500, { mode: 'exact', amounts: { a: 4540 } }, 'x')).toThrow('40¢ over the total')
  })

  it('negative and unknown rejected, zeros allowed', () => {
    expect(() => computeShares(100, { mode: 'exact', amounts: { a: 200, b: -100 } }, 'x')).toThrow(SplitError)
    expect(() => computeShares(100, { mode: 'exact', amounts: { zz: 100 } }, 'x', ['a'])).toThrow(SplitError)
    expect(obj(computeShares(100, { mode: 'exact', amounts: { a: 100, b: 0 } }, 'x'))).toEqual({ a: 100, b: 0 })
  })

  it('valid exact input returns exactly the input amounts', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.stringMatching(/^[a-z]{1,4}$/), fc.integer({ min: 0, max: 10_000_000 }), { minKeys: 1, maxKeys: 10 }), (amounts) => {
        const total = Object.values(amounts).reduce((a, b) => a + b, 0)
        expect(obj(computeShares(total, { mode: 'exact', amounts }, 'x'))).toEqual(amounts)
      }),
    )
  })
})
