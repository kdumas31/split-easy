// "Lakehouse Weekend" demo group. Fictional people, fresh ids every time.

import { todayLocal } from './dates'
import type { Category, Expense, Group, Id, Split } from './types'

function daysAgo(n: number, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n)
  return todayLocal(d)
}

export function makeDemoGroup(newId: () => Id, stamp: () => number, now: Date = new Date()): Group {
  const t = stamp()
  const [maya, theo, priya, sam] = [newId(), newId(), newId(), newId()] as [Id, Id, Id, Id]
  const all = [maya, theo, priya, sam]
  const expenses: Expense[] = []
  const add = (title: string, cents: number, paidBy: Id, split: Split, category: Category, day: number, note?: string) => {
    const s = stamp()
    const e: Expense = { id: newId(), title, amountCents: cents, paidBy, split, category, date: daysAgo(day, now), createdAt: s, updatedAt: s }
    if (note) e.note = note
    expenses.push(e)
  }
  add('Cabin rental', 84000, maya, { mode: 'equal', participants: all }, 'lodging', 3, 'Two nights, booked back in spring')
  add('Gas for the drive up', 6240, priya, { mode: 'equal', participants: all }, 'transport', 3)
  add('Groceries', 10000, theo, { mode: 'equal', participants: [maya, theo, priya] }, 'groceries', 3, 'Sam drove up the next morning')
  add('Firewood and ice', 2400, theo, { mode: 'equal', participants: all }, 'utilities', 2)
  add('Kayak rental', 12000, sam, { mode: 'shares', weights: { [maya]: 1, [theo]: 1, [priya]: 2, [sam]: 0 } }, 'activities', 2, 'Priya took the double kayak')
  add('Pizza night', 7350, maya, { mode: 'equal', participants: all }, 'food', 2)
  add('Farmers market', 3825, sam, { mode: 'exact', amounts: { [maya]: 1000, [theo]: 825, [priya]: 0, [sam]: 2000 } }, 'groceries', 1)
  add('Lake souvenirs', 4500, priya, { mode: 'exact', amounts: { [priya]: 3000, [sam]: 1500 } }, 'shopping', 1)
  add('Parking pass', 1500, sam, { mode: 'equal', participants: all }, 'other', 1)

  const ps = stamp()
  return {
    id: newId(),
    name: 'Lakehouse Weekend',
    emoji: '🛶',
    currencySymbol: '$',
    isDemo: true,
    createdAt: t,
    metaUpdatedAt: t,
    people: [
      { id: maya, name: 'Maya', updatedAt: t },
      { id: theo, name: 'Theo', updatedAt: t },
      { id: priya, name: 'Priya', updatedAt: t },
      { id: sam, name: 'Sam', updatedAt: t },
    ],
    expenses,
    settlements: [{ id: newId(), from: theo, to: maya, amountCents: 10000, date: daysAgo(1, now), updatedAt: ps }],
  }
}
