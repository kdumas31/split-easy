import { describe, expect, it } from 'vitest'
import { draftFromSplit, evaluateDraft } from '../components/splitDraft'
import { computeTotals } from '../lib/balances'
import { resetClock } from '../lib/clock'
import { emptyDoc } from '../lib/storage'
import { livePeople, type Group } from '../lib/types'
import { createGroup, saveExpense } from './actions'

// Review item 1: the editor previews with the same id it saves with, so the
// preview of a $100 / 3-way split is exactly what the saved expense charges.
describe('expense editor: preview matches saved expense', () => {
  it('$100 split 3 ways: preview shares === saved shares for every id', () => {
    resetClock(0)
    const [doc0, gid] = createGroup(emptyDoc(), { name: 'Trip', currencySymbol: '$', people: ['Ada', 'Ben', 'Cy'] })
    const group0 = doc0.groups.find((g) => g.id === gid) as Group
    const people = livePeople(group0)
    const draft = draftFromSplit(null, people)
    const extraCentOwners = new Set<string>()

    for (let i = 0; i < 40; i++) {
      const draftId = `exp-${i}-${(i * 7919).toString(36)}`
      const preview = evaluateDraft(draft, 10000, people, draftId, '$')
      expect(preview.ok).toBe(true)
      if (!preview.ok) return
      const [doc1, savedId] = saveExpense(doc0, gid, draftId, {
        title: 'Cabin',
        amountCents: 10000,
        paidBy: people[0]!.id,
        split: preview.split,
        date: '2026-11-20',
      })
      expect(savedId).toBe(draftId)
      const saved = doc1.groups.find((g) => g.id === gid) as Group
      expect(saved.expenses).toHaveLength(1)
      const totals = computeTotals(saved)
      for (const p of people) expect(totals.get(p.id)?.share).toBe(preview.shares.get(p.id))
      const shares = [...preview.shares.values()].sort()
      expect(shares).toEqual([3333, 3333, 3334])
      for (const [pid, c] of preview.shares) if (c === 3334) extraCentOwners.add(pid)
    }
    // The extra cent really does depend on the id, so a different preview id could have moved it.
    expect(extraCentOwners.size).toBeGreaterThan(1)
  })
})
