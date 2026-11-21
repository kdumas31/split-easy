import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import { makeDemoGroup } from './demo'
import { newId } from './ids'
import { liveExpenses } from './types'
import { validateGroup } from './validate'
import { todayLocal } from './dates'

describe('demo trip', () => {
  let t = 1_763_000_000_000
  const demo = makeDemoGroup(newId, () => ++t, new Date(2026, 10, 20))

  it('validates and balances sum to 0', () => {
    expect(() => validateGroup(demo)).not.toThrow()
    expect([...computeBalances(demo).values()].reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('uses all three split modes and every category', () => {
    const ex = liveExpenses(demo)
    expect(new Set(ex.map((e) => e.split.mode))).toEqual(new Set(['equal', 'shares', 'exact']))
    expect(new Set(ex.map((e) => e.category)).size).toBe(8)
    expect(ex.length).toBe(9)
    expect(demo.settlements.length).toBe(1)
    expect(demo.isDemo).toBe(true)
  })

  it('has at least one equal split with a remainder', () => {
    const uneven = liveExpenses(demo).filter((e) => e.split.mode === 'equal' && e.amountCents % e.split.participants.length !== 0)
    expect(uneven.length).toBeGreaterThan(0)
  })

  it('gets fresh ids every time', () => {
    const again = makeDemoGroup(newId, () => ++t)
    expect(again.id).not.toBe(demo.id)
    expect(again.people[0]?.id).not.toBe(demo.people[0]?.id)
  })

  it('dates are local calendar dates', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(liveExpenses(demo)[0]?.date).toBe('2026-11-17')
  })
})
