// localStorage layout, load/save, versioning (PLAN.md §3). Data is never silently thrown away.

import { migrate, schemaOf } from './migrations'
import { CURRENT_SCHEMA, type DataDoc, type Group, type Settings, type Theme } from './types'
import { validateGroup, validateGroups, validateSettings } from './validate'

export const KEY_DATA = 'split-easy:data'
export const KEY_THEME = 'split-easy:theme'
export const KEY_UNDO = 'split-easy:undo'
export const backupKey = (n: number) => `split-easy:backup:v${n}`
export const corruptKey = (ts: number) => `split-easy:corrupt:${ts}`

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function defaultSettings(): Settings {
  return { theme: 'system', defaultCurrencySymbol: '$' }
}

export function emptyDoc(): DataDoc {
  return { schemaVersion: CURRENT_SCHEMA, groups: [], settings: defaultSettings(), lastStamp: 0 }
}

export type LoadNotice = 'corrupt' | 'newer' | 'migrated' | null

export interface LoadResult {
  doc: DataDoc
  readOnly: boolean
  notice: LoadNotice
  /** For "corrupt": the key where the raw text was kept. */
  corruptKey?: string
}

type Raw = Record<string, unknown>

function validateDoc(raw: Raw): DataDoc {
  const settings = validateSettings(raw.settings)
  const groups = validateGroups(raw.groups)
  const lastStamp = typeof raw.lastStamp === 'number' && Number.isSafeInteger(raw.lastStamp) && raw.lastStamp >= 0 ? raw.lastStamp : 0
  return { schemaVersion: CURRENT_SCHEMA, groups, settings, lastStamp }
}

/** Pure parse (no writes). Used directly for `storage` events from other tabs. */
export function parseDoc(raw: string | null): { ok: true; doc: DataDoc; readOnly: boolean; fromVersion: number } | { ok: false } {
  if (raw === null) return { ok: true, doc: emptyDoc(), readOnly: false, fromVersion: CURRENT_SCHEMA }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false }
  const v = schemaOf(parsed as Raw)
  if (v > CURRENT_SCHEMA) {
    // Newer data than this build understands: show what we can, never write.
    try {
      return { ok: true, doc: validateDoc(parsed as Raw), readOnly: true, fromVersion: v }
    } catch {
      return { ok: true, doc: emptyDoc(), readOnly: true, fromVersion: v }
    }
  }
  try {
    return { ok: true, doc: validateDoc(migrate(parsed as Raw)), readOnly: false, fromVersion: v }
  } catch {
    return { ok: false }
  }
}

export function loadDoc(storage: StorageLike, now: () => number = Date.now): LoadResult {
  const raw = storage.getItem(KEY_DATA)
  const res = parseDoc(raw)
  if (!res.ok) {
    const key = corruptKey(now())
    if (raw !== null) storage.setItem(key, raw)
    storage.removeItem(KEY_DATA)
    return { doc: emptyDoc(), readOnly: false, notice: 'corrupt', corruptKey: key }
  }
  if (res.readOnly) return { doc: res.doc, readOnly: true, notice: 'newer' }
  if (raw !== null && res.fromVersion < CURRENT_SCHEMA) {
    storage.setItem(backupKey(res.fromVersion), raw)
    storage.setItem(KEY_DATA, JSON.stringify(res.doc))
    return { doc: res.doc, readOnly: false, notice: 'migrated' }
  }
  return { doc: res.doc, readOnly: false, notice: null }
}

export class QuotaError extends Error {
  constructor() {
    super('Storage is full')
    this.name = 'QuotaError'
  }
}

/** Synchronous full-document write. Throws QuotaError when storage is full. */
export function saveDoc(storage: StorageLike, doc: DataDoc): void {
  try {
    storage.setItem(KEY_DATA, JSON.stringify(doc))
  } catch (e) {
    if (e instanceof Error && /quota/i.test(e.name + e.message)) throw new QuotaError()
    throw e
  }
}

export function readTheme(storage: StorageLike): Theme {
  const t = storage.getItem(KEY_THEME)
  return t === 'light' || t === 'dark' ? t : 'system'
}

// ---- Undo for the last import (PLAN.md §4 rule 6) ----

export interface UndoRecord {
  groupId: string
  before: Group | null // null = group was not on this device before
  afterStamp: number
}

export function writeUndo(storage: StorageLike, rec: UndoRecord): void {
  storage.setItem(KEY_UNDO, JSON.stringify(rec))
}

export function readUndo(storage: StorageLike): UndoRecord | null {
  const raw = storage.getItem(KEY_UNDO)
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Raw
    if (typeof o.groupId !== 'string' || typeof o.afterStamp !== 'number') return null
    const before = o.before === null ? null : validateGroup(o.before)
    return { groupId: o.groupId, before, afterStamp: o.afterStamp }
  } catch {
    return null
  }
}

export function clearUndo(storage: StorageLike): void {
  storage.removeItem(KEY_UNDO)
}

/** Apply an undo record to a list of groups: restore `before`, or remove the group if it was new. */
export function applyUndo(groups: Group[], rec: UndoRecord): Group[] {
  if (rec.before === null) return groups.filter((g) => g.id !== rec.groupId)
  const before = rec.before
  const has = groups.some((g) => g.id === rec.groupId)
  return has ? groups.map((g) => (g.id === rec.groupId ? before : g)) : [...groups, before]
}

/** In-memory StorageLike (tests, and a fallback when localStorage is unavailable). */
export function memoryStorage(init: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  }
}
