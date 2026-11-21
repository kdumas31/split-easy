import { describe, expect, it } from 'vitest'
import { csvFilename, groupToCsv, slugify, textCell } from './csv'
import { makeDemoGroup } from './demo'
import type { Group } from './types'

/** Minimal RFC 4180 parser for the test. */
function parse(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i] as string
    if (q) {
      if (ch === '"' && csv[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r' && csv[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else cell += ch
  }
  return rows
}

const g: Group = {
  id: 'g1',
  name: 'Café Night!',
  currencySymbol: '$',
  createdAt: 1,
  metaUpdatedAt: 1,
  people: [
    { id: 'a', name: 'Ada', updatedAt: 1 },
    { id: 'b', name: '=Ben', updatedAt: 1 },
    { id: 'c', name: 'Cy, Jr.', updatedAt: 1 },
  ],
  expenses: [
    { id: 'e_groceries', title: 'Groceries "bulk"', amountCents: 10000, paidBy: 'a', split: { mode: 'equal', participants: ['a', 'b', 'c'] }, category: 'groceries', note: 'line1\nline2', date: '2026-03-01', createdAt: 1, updatedAt: 1 },
    { id: 'e2', title: '+1 tickets', amountCents: 3001, paidBy: 'c', split: { mode: 'shares', weights: { a: 1, b: 1 } }, date: '2026-03-02', createdAt: 2, updatedAt: 2 },
    { id: 'e3', updatedAt: 3, deleted: true },
  ],
  settlements: [{ id: 't1', from: 'b', to: 'a', amountCents: 500, date: '2026-03-03', updatedAt: 4 }],
}

describe('csv', () => {
  const csv = groupToCsv(g)
  const rows = parse(csv.slice(1))

  it('starts with a UTF-8 BOM and the header', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(rows[0]).toEqual(['Type', 'Date', 'Description', 'Category', 'Paid by', 'Paid to', 'Amount', 'Split', 'Ada', "'=Ben", 'Cy, Jr.', 'Note'])
  })

  it('escapes quotes, commas, newlines and guards formulas', () => {
    expect(rows[1]?.[2]).toBe('Groceries "bulk"')
    expect(rows[1]?.[11]).toBe('line1\nline2')
    expect(rows[2]?.[2]).toBe("'+1 tickets")
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) expect(textCell(`${lead}x`).replace(/^"/, '').startsWith(`'${lead}`)).toBe(true)
    expect(textCell('plain')).toBe('plain')
  })

  it('skips deleted records; payments have blank shares', () => {
    expect(rows.length).toBe(4)
    const pay = rows[3] as string[]
    expect(pay[0]).toBe('Payment')
    expect(pay[4]).toBe("'=Ben")
    expect(pay[5]).toBe('Ada')
    expect(pay[6]).toBe('5.00')
    expect(pay.slice(8, 11)).toEqual(['', '', ''])
  })

  it('Type=Expense share columns sum to the amount', () => {
    const check = (rs: string[][], nPeople: number) => {
      for (const r of rs.slice(1)) {
        if (r[0] !== 'Expense') continue
        const shares = r.slice(8, 8 + nPeople).map((x) => Math.round(Number(x) * 100))
        expect(shares.reduce((a, b) => a + b, 0)).toBe(Math.round(Number(r[6]) * 100))
      }
    }
    check(rows, 3)
    let i = 0
    let t = 0
    const demo = makeDemoGroup(() => `D${String(++i).padStart(5, '0')}`, () => ++t)
    check(parse(groupToCsv(demo).slice(1)), 4)
  })

  it('filename', () => {
    expect(csvFilename(g, '2026-11-20')).toBe('split-easy-cafe-night-2026-11-20.csv')
    expect(slugify('🛶🛶')).toBe('group')
  })
})
