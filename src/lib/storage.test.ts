import { describe, expect, it } from 'vitest'
import { KEY_DATA, backupKey, emptyDoc, loadDoc, memoryStorage, parseDoc, saveDoc } from './storage'
import { CURRENT_SCHEMA, type Group } from './types'

const group: Group = {
  id: 'g1',
  name: 'House',
  currencySymbol: '$',
  createdAt: 10,
  metaUpdatedAt: 10,
  people: [
    { id: 'a', name: 'Ada', updatedAt: 10 },
    { id: 'b', name: 'Ben', updatedAt: 10 },
  ],
  expenses: [{ id: 'e1', title: 'Rent', amountCents: 200000, paidBy: 'a', split: { mode: 'equal', participants: ['a', 'b'] }, date: '2026-11-01', createdAt: 11, updatedAt: 11 }],
  settlements: [],
}

describe('storage', () => {
  it('empty storage → defaults', () => {
    const r = loadDoc(memoryStorage())
    expect(r.doc).toEqual(emptyDoc())
    expect(r.readOnly).toBe(false)
    expect(r.notice).toBeNull()
  })

  it('round-trips a saved document', () => {
    const s = memoryStorage()
    const doc = { ...emptyDoc(), groups: [group], lastStamp: 11 }
    saveDoc(s, doc)
    expect(loadDoc(s).doc).toEqual(doc)
  })

  it('v0 fixture migrates and a backup is written first', () => {
    const v0 = {
      schemaVersion: 0,
      theme: 'dark',
      groups: [{ ...group, currencySymbol: undefined, metaUpdatedAt: undefined }],
    }
    const raw = JSON.stringify(v0)
    const s = memoryStorage({ [KEY_DATA]: raw })
    const r = loadDoc(s)
    expect(r.notice).toBe('migrated')
    expect(s.getItem(backupKey(0))).toBe(raw)
    expect(r.doc.schemaVersion).toBe(CURRENT_SCHEMA)
    expect(r.doc.settings.theme).toBe('dark')
    expect(r.doc.groups[0]?.currencySymbol).toBe('$')
    expect(r.doc.groups[0]?.metaUpdatedAt).toBe(10)
    expect(JSON.parse(s.getItem(KEY_DATA) ?? '{}').schemaVersion).toBe(1)
  })

  it('corrupt JSON is kept aside, not lost', () => {
    const s = memoryStorage({ [KEY_DATA]: '{oops' })
    const r = loadDoc(s, () => 12345)
    expect(r.notice).toBe('corrupt')
    expect(r.corruptKey).toBe('split-easy:corrupt:12345')
    expect(s.getItem('split-easy:corrupt:12345')).toBe('{oops')
    expect(r.doc.groups).toEqual([])
  })

  it('invalid (but parseable) data is also kept aside', () => {
    const bad = JSON.stringify({ schemaVersion: 1, groups: [{ ...group, expenses: [{ ...group.expenses[0], amountCents: 1.5 }] }], settings: { theme: 'system', defaultCurrencySymbol: '$' }, lastStamp: 0 })
    const s = memoryStorage({ [KEY_DATA]: bad })
    const r = loadDoc(s, () => 7)
    expect(r.notice).toBe('corrupt')
    expect(s.getItem('split-easy:corrupt:7')).toBe(bad)
  })

  it('newer schema → read-only', () => {
    const raw = JSON.stringify({ schemaVersion: 99, groups: [group], settings: { theme: 'system', defaultCurrencySymbol: '$' }, lastStamp: 0 })
    const s = memoryStorage({ [KEY_DATA]: raw })
    const r = loadDoc(s)
    expect(r.readOnly).toBe(true)
    expect(r.notice).toBe('newer')
    expect(s.getItem(KEY_DATA)).toBe(raw) // untouched
  })

  it('parseDoc(null) → empty document (other tab erased everything)', () => {
    const r = parseDoc(null)
    expect(r.ok && r.doc.groups.length).toBe(0)
  })
})
