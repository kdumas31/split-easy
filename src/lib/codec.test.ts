import fc from 'fast-check'
import LZString from 'lz-string'
import { describe, expect, it } from 'vitest'
import { arbGroup, normalize } from './arb.testutil'
import { decodeFragment, decodeGroupFile, encodeGroup, groupFileContents, groupToWire, linkSize, shareUrl } from './share/codec'
import type { Group } from './types'

function base(): Group {
  return {
    id: 'g1',
    name: 'Ünïcode & "quotes" #&?+',
    emoji: '👩‍👩‍👧',
    currencySymbol: '€',
    createdAt: 1000,
    metaUpdatedAt: 1001,
    people: [
      { id: 'pA', name: '李小龙', updatedAt: 1002 },
      { id: 'pB', name: 'زين العابدين', updatedAt: 1003 },
      { id: 'pC', name: 'José "Pepe" +1 #?&', updatedAt: 1004 },
      { id: 'pD', name: 'Gone Person', updatedAt: 1005, deleted: true },
    ],
    expenses: [
      { id: 'e1', title: 'Café ☕ + croissants', amountCents: 1234, paidBy: 'pA', split: { mode: 'equal', participants: ['pA', 'pB'] }, category: 'food', note: 'a+b=c', date: '2026-01-02', createdAt: 1006, updatedAt: 1007 },
      { id: 'e2', title: 'Shares', amountCents: 999, paidBy: 'pB', split: { mode: 'shares', weights: { pA: 3, pB: 2, pC: 0 } }, date: '2026-01-03', createdAt: 1008, updatedAt: 1009 },
      { id: 'e3', title: 'Exact', amountCents: 500, paidBy: 'pC', split: { mode: 'exact', amounts: { pA: 250, pC: 250 } }, date: '2026-01-04', createdAt: 1010, updatedAt: 1011 },
      { id: 'e4', updatedAt: 1012, deleted: true },
    ],
    settlements: [
      { id: 't1', from: 'pB', to: 'pA', amountCents: 100, date: '2026-01-05', updatedAt: 1013 },
      { id: 't2', updatedAt: 1014, deleted: true },
    ],
  }
}

const frag = (w: unknown) => 's1.' + LZString.compressToEncodedURIComponent(JSON.stringify(w))

describe('share codec', () => {
  it('round-trips unicode, tombstones, all split modes', () => {
    const g = base()
    const r = decodeFragment('#' + encodeGroup(g))
    expect(r.ok).toBe(true)
    if (r.ok) expect(normalize(r.group)).toBe(normalize(g))
  })

  it('person tombstone keeps its name on the wire', () => {
    const w = groupToWire(base())
    expect(w.p[3]).toEqual(['pD', 1005, 1, 'Gone Person'])
    expect(w.e[3]).toEqual(['e4', 1012, 1])
  })

  it('numeric 0 decodes as absent', () => {
    const g = base()
    delete g.emoji
    const e1 = g.expenses[0] as { category?: string; note?: string }
    delete e1.category
    delete e1.note
    const w = groupToWire(g)
    expect(w.g[3]).toBe(0)
    expect(w.g[4]).toBe(0)
    const r = decodeFragment(frag(w))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect('emoji' in r.group).toBe(false)
      expect('settledAt' in r.group).toBe(false)
      expect('category' in (r.group.expenses[0] as object)).toBe(false)
      expect('note' in (r.group.expenses[0] as object)).toBe(false)
    }
  })

  it('empty string for an optional field is rejected', () => {
    const w = groupToWire(base())
    ;(w.e[0] as unknown[])[8] = ''
    expect(decodeFragment(frag(w)).ok).toBe(false)
  })

  it('"+" survives in the fragment (never through URLSearchParams)', () => {
    const enc = encodeGroup(base())
    expect(/^[A-Za-z0-9+\-$.]+$/.test(enc)).toBe(true)
    const url = new URL(shareUrl('https://split.example', base()))
    expect(decodeFragment(url.hash).ok).toBe(true)
  })

  const bad: Array<[string, (w: ReturnType<typeof groupToWire>) => void]> = [
    ['invalid cents', (w) => void ((w.e[0] as unknown[])[2] = 12.5)],
    ['over-cap amount', (w) => void ((w.t[0] as unknown[])[3] = 1_000_000_001)],
    ['zero amount', (w) => void ((w.t[0] as unknown[])[3] = 0)],
    ['weight > 100', (w) => void ((w.e[1] as unknown[])[5] = [['pA', 101], ['pB', 1]])],
    ['duplicate ids', (w) => void w.p.push(['pA', 'Dup', 1])],
    ['duplicate split keys', (w) => void ((w.e[1] as unknown[])[5] = [['pA', 1], ['pA', 2]])],
    ['duplicate equal participants', (w) => void ((w.e[0] as unknown[])[5] = ['pA', 'pA'])],
    ['from === to', (w) => void ((w.t[0] as unknown[])[2] = 'pB')],
    ['dangling reference', (w) => void ((w.e[0] as unknown[])[3] = 'nobody')],
    ['exact sum mismatch', (w) => void ((w.e[2] as unknown[])[5] = [['pA', 250], ['pC', 249]])],
    ['bad tombstone shape', (w) => void (w.e[3] = ['e4', 1012, 1, 'extra'])],
    ['nameless person tombstone', (w) => void (w.p[3] = ['pD', 1005, 1])],
    ['unknown mode', (w) => void ((w.e[0] as unknown[])[4] = 7)],
    ['__proto__ key', (w) => void ((w.e[1] as unknown[])[5] = [['__proto__', 1]])],
  ]
  it.each(bad)('rejects %s with a typed error', (_name, mutate) => {
    const w = groupToWire(base())
    mutate(w)
    const r = decodeFragment(frag(w))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('invalid')
  })

  it('unknown version, truncated, garbage, oversize, empty → friendly errors, no throw', () => {
    const enc = encodeGroup(base())
    const cases: Array<[string, string]> = [
      ['s2.abc', 'version'],
      [enc.slice(0, Math.floor(enc.length / 2)), 'corrupt'],
      ['s1.!!!not-lz!!!', 'corrupt'],
      ['hello', 'corrupt'],
      ['', 'empty'],
      ['s1.', 'empty'],
      ['s1.' + 'A'.repeat(200_001), 'too-long'],
      [frag({ v: 2 }), 'version'],
      [frag([1, 2, 3]), 'invalid'],
      ['s1.' + LZString.compressToEncodedURIComponent('{not json'), 'corrupt'],
    ]
    for (const [input, code] of cases) {
      const r = decodeFragment(input)
      expect(r.ok, input.slice(0, 20)).toBe(false)
      if (!r.ok) expect(r.error.code, input.slice(0, 20)).toBe(code)
    }
  })

  it('group file uses the same path', () => {
    const r = decodeGroupFile(groupFileContents(base()))
    expect(r.ok).toBe(true)
    expect(decodeGroupFile('nope').ok).toBe(false)
  })

  it('decode(encode(g)) ≡ g for random groups', () => {
    fc.assert(
      fc.property(arbGroup(), (g) => {
        const r = decodeFragment(encodeGroup(g))
        if (!r.ok) throw new Error(r.error.detail ?? r.error.message)
        expect(normalize(r.group)).toBe(normalize(g))
      }),
      { numRuns: 100 },
    )
  })

  it('a 30-person / 300-expense group round-trips (size reported)', () => {
    const people = Array.from({ length: 30 }, (_, i) => ({ id: `Pq${String(i).padStart(10, '0')}`, name: `Person ${i}`, updatedAt: 1_763_600_000_000 + i }))
    const ids = people.map((p) => p.id)
    const expenses = Array.from({ length: 300 }, (_, i) => ({
      id: `Ex${String(i).padStart(10, '0')}`,
      title: ['Dinner', 'Groceries', 'Gas', 'Tickets', 'Coffee'][i % 5] as string,
      amountCents: 1000 + i * 37,
      paidBy: ids[i % 30] as string,
      split: { mode: 'equal' as const, participants: ids.slice(0, 2 + (i % 6)) },
      date: `2026-07-${String(1 + (i % 28)).padStart(2, '0')}`,
      createdAt: 1_763_700_000_000 + i * 1000,
      updatedAt: 1_763_700_000_000 + i * 1000,
    }))
    const g: Group = { id: 'BigGroup0001', name: 'Big trip', currencySymbol: '$', createdAt: 1_763_600_000_000, metaUpdatedAt: 1_763_600_000_000, people, expenses, settlements: [] }
    const url = shareUrl('https://split-easy.vercel.app', g)
    const r = decodeFragment(new URL(url).hash)
    expect(r.ok).toBe(true)
    console.info(`[size] 30 people / 300 expenses → share URL ${url.length} chars (${linkSize(url)})`)
    const small: Group = { ...g, people: people.slice(0, 4), expenses: expenses.slice(0, 40).map((e) => ({ ...e, paidBy: ids[0] as string, split: { mode: 'equal' as const, participants: ids.slice(0, 4) } })) }
    console.info(`[size] 4 people / 40 expenses → ${shareUrl('https://split-easy.vercel.app', small).length} chars`)
  })

  it('linkSize thresholds', () => {
    expect(linkSize('x'.repeat(6000))).toBe('ok')
    expect(linkSize('x'.repeat(6001))).toBe('long')
    expect(linkSize('x'.repeat(60000))).toBe('long')
    expect(linkSize('x'.repeat(60001))).toBe('too-long')
  })
})
