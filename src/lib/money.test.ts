import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatCents, formatDiff, parseCents, plainCents, remainderMessage } from './money'

describe('parseCents', () => {
  it.each([
    ['12', 1200],
    ['12.3', 1230],
    ['12.30', 1230],
    ['.5', 50],
    ['0', 0],
    ['0.01', 1],
    ['1,234.56', 123456],
    ['12,345', 1234500],
    ['12,50', 1250],
    ['3,5', 350],
    ['$12,345', 1234500],
    ['$ 7.25', 725],
    ['€9', 900],
    ['  42  ', 4200],
    ['10000000', 1_000_000_000],
    ['10000000.00', 1_000_000_000],
    ['1,000,000.00', 100_000_000],
  ])('%s → %i', (input, cents) => {
    expect(parseCents(input)).toBe(cents)
  })

  it.each(['12.345', '-1', '1e3', 'abc', '', '   ', '.', '$', '10000000.01', '1,23,4', '12,3456', '1,234,5', '100000000', '1.2.3', '12,'])('rejects %j', (input) => {
    expect(parseCents(input)).toBeNull()
  })

  it('round-trips formatCents for 0…10^9', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (c) => {
        expect(parseCents(formatCents(c, '$').slice(1))).toBe(c)
        expect(parseCents(formatCents(c, '$'))).toBe(c)
        expect(parseCents(plainCents(c))).toBe(c)
      }),
    )
  })
})

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [1, '$0.01'],
    [5, '$0.05'],
    [100, '$1.00'],
    [123456789, '$1,234,567.89'],
    [100000, '$1,000.00'],
    [-4210, '−$42.10'],
  ])('%i → %s', (c, s) => {
    expect(formatCents(c)).toBe(s)
  })

  it('uses the symbol given', () => {
    expect(formatCents(12345, '€')).toBe('€123.45')
    expect(formatCents(12345, 'CHF')).toBe('CHF123.45')
    expect(formatCents(12345, '')).toBe('123.45')
  })

  it('throws on non-integer or unsafe input', () => {
    expect(() => formatCents(1.5)).toThrow()
    expect(() => formatCents(Number.NaN)).toThrow()
    expect(() => formatCents(2 ** 53)).toThrow()
  })
})

describe('remainder wording', () => {
  it('is the single phrase used everywhere', () => {
    expect(remainderMessage(1)).toBe('1¢ left to assign')
    expect(remainderMessage(125)).toBe('$1.25 left to assign')
    expect(remainderMessage(-40)).toBe('40¢ over the total')
    expect(remainderMessage(-140)).toBe('$1.40 over the total')
    expect(remainderMessage(0)).toBeNull()
    expect(formatDiff(99)).toBe('99¢')
  })
})
