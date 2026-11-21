import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fnv1a32 } from './hash'

describe('fnv1a32', () => {
  it('matches the pinned regression values', () => {
    expect(fnv1a32('e_groceries')).toBe(2180723260)
    expect(fnv1a32('e_pizza')).toBe(1531476333)
    expect(fnv1a32('')).toBe(2166136261)
  })

  it('the signed value would give the wrong rotation for e_groceries', () => {
    const unsigned = fnv1a32('e_groceries')
    const signed = unsigned | 0
    expect(signed).toBe(-2114244036)
    expect(Math.abs(signed % 3)).toBe(0) // wrong answer (would favour Ada)
    expect(unsigned % 3).toBe(1) // right answer (Ben)
  })

  it('always returns an unsigned 32-bit integer', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = fnv1a32(s)
        expect(Number.isInteger(h)).toBe(true)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThanOrEqual(2 ** 32 - 1)
      }),
    )
  })
})
