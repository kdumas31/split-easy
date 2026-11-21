import { describe, expect, it } from 'vitest'
import { getLastStamp, resetClock, stamp } from '../lib/clock'
import { newId } from '../lib/ids'
import { copyWithNewIds, mergeGroup, stampsSeen } from '../lib/share/merge'
import { KEY_DATA, emptyDoc, memoryStorage } from '../lib/storage'
import type { DataDoc, Group } from '../lib/types'
import { addPerson, createGroup } from './actions'
import { importAddGroup, importMergeGroup } from './importActions'
import { Store } from './store'

const noTimers = { setTimer: () => 1, clearTimer: () => undefined }
const FUTURE = Date.now() + 10 * 365 * 24 * 3600 * 1000

/** A group whose stamps are far ahead of this device's clock (another phone's edits). */
function foreignGroup(base?: Group): Group {
  resetClock(FUTURE)
  let doc: DataDoc = emptyDoc()
  let gid: string
  if (base) {
    doc = { ...doc, groups: [base] }
    gid = base.id
  } else {
    ;[doc, gid] = createGroup(doc, { name: 'Lake trip', currencySymbol: '$', people: ['Ada', 'Ben'] })
  }
  doc = addPerson(doc, gid, 'Cy')
  return doc.groups.find((g) => g.id === gid) as Group
}

function savedLastStamp(s: ReturnType<typeof memoryStorage>): number {
  return (JSON.parse(s.getItem(KEY_DATA) ?? '{}') as DataDoc).lastStamp
}

// Review item 2: the import must advance lastStamp inside the same store write.
describe('import advances the persisted clock', () => {
  it('save new: saved lastStamp >= stampsSeen(incoming), and survives a reload', () => {
    const incoming = foreignGroup()
    resetClock(0)
    const s = memoryStorage()
    const store = new Store({ storage: s, ...noTimers })
    store.update((d) => importAddGroup(d, incoming))
    store.flush()
    expect(savedLastStamp(s)).toBeGreaterThanOrEqual(stampsSeen(incoming))
    // Reload: a fresh clock starts from the saved lastStamp, so the next local edit wins.
    resetClock(0)
    new Store({ storage: s, ...noTimers })
    expect(getLastStamp()).toBeGreaterThanOrEqual(stampsSeen(incoming))
    expect(stamp()).toBeGreaterThan(stampsSeen(incoming))
  })

  it('merge: saved lastStamp >= stampsSeen(local, incoming, merged)', () => {
    resetClock(0)
    const s = memoryStorage()
    const store = new Store({ storage: s, ...noTimers })
    let gid = ''
    store.update((d) => {
      const [n, id] = createGroup(d, { name: 'Lake trip', currencySymbol: '$', people: ['Ada'] })
      gid = id
      return n
    })
    store.flush()
    const local = store.getState().doc.groups.find((g) => g.id === gid) as Group
    const incoming = foreignGroup(local)
    resetClock(0)
    const plan = mergeGroup(local, incoming)
    store.update((d) => importMergeGroup(d, local, incoming, plan.merged))
    store.flush()
    expect(savedLastStamp(s)).toBeGreaterThanOrEqual(stampsSeen(local, incoming, plan.merged))
  })

  it('save as copy: saved lastStamp >= stampsSeen(copy)', () => {
    const incoming = foreignGroup()
    resetClock(0)
    const copy = copyWithNewIds(incoming, newId)
    const s = memoryStorage()
    const store = new Store({ storage: s, ...noTimers })
    store.update((d) => importAddGroup(d, copy))
    store.flush()
    expect(savedLastStamp(s)).toBeGreaterThanOrEqual(stampsSeen(copy))
    expect(savedLastStamp(s)).toBeGreaterThanOrEqual(stampsSeen(incoming))
  })
})
