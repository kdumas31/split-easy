// Tiny external store holding the whole persisted document (PLAN.md §3).
// Framework-free so it can be unit tested in Node with a fake storage and fake timers.

import { getLastStamp, observeStamp, onStamp } from '../lib/clock'
import { KEY_DATA, KEY_THEME, QuotaError, clearUndo, loadDoc, parseDoc, readUndo, saveDoc, type LoadNotice, type StorageLike } from '../lib/storage'
import type { DataDoc } from '../lib/types'

export interface StoreState {
  doc: DataDoc
  readOnly: boolean
  loadNotice: LoadNotice
  corruptKey: string | undefined
  /** Increments whenever another tab replaced our document. */
  otherTabVersion: number
  undoAvailable: boolean
}

export interface StoreDeps {
  storage: StorageLike
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
  onQuota?: () => void
  onFirstSave?: () => void
}

export class ReadOnlyError extends Error {
  constructor() {
    super('This device has data from a newer Split Easy. Refresh to update.')
    this.name = 'ReadOnlyError'
  }
}

export const SAVE_DEBOUNCE_MS = 150

export class Store {
  private state: StoreState
  private listeners = new Set<() => void>()
  private timer: unknown = null
  private dirty = false
  private savedOnce = false
  private readonly deps: Required<Pick<StoreDeps, 'storage' | 'setTimer' | 'clearTimer'>> & StoreDeps

  constructor(deps: StoreDeps) {
    this.deps = {
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      ...deps,
    }
    const r = loadDoc(deps.storage)
    observeStamp(r.doc.lastStamp)
    this.state = {
      doc: r.doc,
      readOnly: r.readOnly,
      loadNotice: r.notice,
      corruptKey: r.corruptKey,
      otherTabVersion: 0,
      undoAvailable: readUndo(deps.storage) !== null,
    }
    // Any local edit (anything that calls stamp()) expires the import Undo.
    onStamp(() => {
      if (this.state.undoAvailable || deps.storage.getItem('split-easy:undo') !== null) {
        clearUndo(deps.storage)
        this.set({ undoAvailable: false })
      }
    })
  }

  getState = (): StoreState => this.state

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private set(patch: Partial<StoreState>): void {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  /** Apply a change to the document and schedule a debounced save. */
  update(fn: (doc: DataDoc) => DataDoc): void {
    if (this.state.readOnly) throw new ReadOnlyError()
    const next = fn(this.state.doc)
    if (next === this.state.doc) return
    this.set({ doc: { ...next, lastStamp: Math.max(next.lastStamp, getLastStamp()) } })
    this.dirty = true
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = this.deps.setTimer(() => {
      this.timer = null
      this.flush()
    }, SAVE_DEBOUNCE_MS)
  }

  /** Synchronous write (pagehide / visibilitychange). Never runs in read-only mode. */
  flush(): void {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer)
      this.timer = null
    }
    if (this.state.readOnly || !this.dirty) return
    try {
      saveDoc(this.deps.storage, this.state.doc)
      this.dirty = false
      if (!this.savedOnce) {
        this.savedOnce = true
        this.deps.onFirstSave?.()
      }
    } catch (e) {
      if (e instanceof QuotaError) this.deps.onQuota?.()
      else throw e
    }
  }

  /** Another tab wrote split-easy:data. Replace our document; never merge. */
  handleStorageEvent(key: string | null, newValue: string | null): boolean {
    if (key === KEY_THEME) return false
    if (key !== KEY_DATA && key !== null) {
      if (key === 'split-easy:undo') this.set({ undoAvailable: newValue !== null })
      return false
    }
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer)
      this.timer = null
    }
    this.dirty = false
    const raw = key === null ? this.deps.storage.getItem(KEY_DATA) : newValue
    const r = parseDoc(raw)
    if (!r.ok) return false
    observeStamp(r.doc.lastStamp)
    this.set({ doc: r.doc, readOnly: r.readOnly, otherTabVersion: this.state.otherTabVersion + 1, undoAvailable: readUndo(this.deps.storage) !== null })
    return true
  }

  setUndoAvailable(v: boolean): void {
    this.set({ undoAvailable: v })
  }

  dismissLoadNotice(): void {
    this.set({ loadNotice: null })
  }

  get storage(): StorageLike {
    return this.deps.storage
  }
}
