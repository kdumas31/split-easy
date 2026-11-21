// The app's singleton store, bound to localStorage and page lifecycle events.

import { useSyncExternalStore } from 'react'
import { memoryStorage, type StorageLike } from '../lib/storage'
import type { DataDoc, Group, Id } from '../lib/types'
import { ReadOnlyError, Store, type StoreState } from './store'
import { toast } from '../components/toastBus'

function pickStorage(): StorageLike {
  try {
    const k = 'split-easy:probe'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return window.localStorage
  } catch {
    return memoryStorage()
  }
}

export const store = new Store({
  storage: pickStorage(),
  onQuota: () => toast({ message: "Couldn't save: this browser's storage is full. Download a group file to keep a copy." }),
  onFirstSave: () => {
    void navigator.storage?.persist?.().catch(() => undefined)
  },
})

// Flush synchronously before the page is hidden or frozen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush()
})
window.addEventListener('pagehide', () => store.flush())
window.addEventListener('storage', (e) => {
  if (e.storageArea !== window.localStorage) return
  if (store.handleStorageEvent(e.key, e.newValue)) {
    window.dispatchEvent(new CustomEvent('split-easy:other-tab'))
  }
})

export function useStore(): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState)
}

export function useDoc(): DataDoc {
  return useStore().doc
}

export function useGroup(gid: Id | undefined): Group | undefined {
  const doc = useDoc()
  return gid ? doc.groups.find((g) => g.id === gid) : undefined
}

/** Run a mutating action; shows a friendly toast when blocked (read-only mode). */
export function act(fn: (doc: DataDoc) => DataDoc): boolean {
  try {
    store.update(fn)
    return true
  } catch (e) {
    if (e instanceof ReadOnlyError) {
      toast({ message: e.message })
      return false
    }
    throw e
  }
}

/** Like act, but for actions that also return a value (e.g. a new id). */
export function actWith<T>(fn: (doc: DataDoc) => [DataDoc, T]): T | undefined {
  let out: T | undefined
  const ok = act((doc) => {
    const [next, v] = fn(doc)
    out = v
    return next
  })
  return ok ? out : undefined
}
