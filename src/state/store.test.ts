import { describe, expect, it } from 'vitest'
import { resetClock, stamp } from '../lib/clock'
import { KEY_DATA, KEY_UNDO, emptyDoc, memoryStorage, writeUndo } from '../lib/storage'
import { addPerson, createGroup, deleteGroup } from './actions'
import { ReadOnlyError, Store } from './store'

function fakeTimers() {
  let pending: (() => void) | null = null
  return {
    setTimer: (fn: () => void) => {
      pending = fn
      return 1
    },
    clearTimer: () => {
      pending = null
    },
    run: () => {
      const p = pending
      pending = null
      p?.()
    },
    get pending() {
      return pending !== null
    },
  }
}

describe('Store', () => {
  it('debounces saves and flushes synchronously', () => {
    resetClock(0)
    const s = memoryStorage()
    const t = fakeTimers()
    const store = new Store({ storage: s, ...t })
    store.update((d) => createGroup(d, { name: 'Trip', currencySymbol: '$', people: ['Ada'] })[0])
    expect(s.getItem(KEY_DATA)).toBeNull()
    expect(t.pending).toBe(true)
    store.flush()
    expect(JSON.parse(s.getItem(KEY_DATA) ?? '{}').groups).toHaveLength(1)
    expect(t.pending).toBe(false)
  })

  it('read-only (newer schema): no write on flush, mutations blocked', () => {
    const raw = JSON.stringify({ schemaVersion: 42, groups: [], settings: { theme: 'system', defaultCurrencySymbol: '$' }, lastStamp: 0 })
    const s = memoryStorage({ [KEY_DATA]: raw })
    const store = new Store({ storage: s, ...fakeTimers() })
    expect(store.getState().readOnly).toBe(true)
    expect(() => store.update((d) => ({ ...d }))).toThrow(ReadOnlyError)
    store.flush()
    expect(s.getItem(KEY_DATA)).toBe(raw)
  })

  it('a storage event replaces the document (no merge: a deleted group stays deleted)', () => {
    resetClock(0)
    const s = memoryStorage()
    const t = fakeTimers()
    const store = new Store({ storage: s, ...t })
    let gid = ''
    store.update((d) => {
      const [n, id] = createGroup(d, { name: 'Trip', currencySymbol: '$', people: ['Ada'] })
      gid = id
      return n
    })
    store.flush()
    // Other tab deletes the group and saves.
    const other = deleteGroup(store.getState().doc, gid)
    // This tab has a pending edit that must be cancelled.
    store.update((d) => addPerson(d, gid, 'Ben'))
    expect(t.pending).toBe(true)
    const newValue = JSON.stringify(other)
    s.setItem(KEY_DATA, newValue)
    expect(store.handleStorageEvent(KEY_DATA, newValue)).toBe(true)
    expect(t.pending).toBe(false)
    expect(store.getState().doc.groups).toHaveLength(0)
    expect(store.getState().otherTabVersion).toBe(1)
    store.flush() // nothing dirty → no write that could resurrect the group
    expect(JSON.parse(s.getItem(KEY_DATA) ?? '{}').groups).toHaveLength(0)
  })

  it('null newValue (erase all in other tab) → empty document', () => {
    const s = memoryStorage({ [KEY_DATA]: JSON.stringify({ ...emptyDoc() }) })
    const store = new Store({ storage: s, ...fakeTimers() })
    store.handleStorageEvent(KEY_DATA, null)
    expect(store.getState().doc.groups).toEqual([])
  })

  it('any local edit expires the import Undo', () => {
    const s = memoryStorage()
    const store = new Store({ storage: s, ...fakeTimers() })
    writeUndo(s, { groupId: 'G', before: null, afterStamp: 1 })
    store.setUndoAvailable(true)
    stamp()
    expect(s.getItem(KEY_UNDO)).toBeNull()
    expect(store.getState().undoAvailable).toBe(false)
  })
})
