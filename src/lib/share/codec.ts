// Group ⇄ compact wire JSON ⇄ lz-string URL fragment (PLAN.md §4 Share URL).

import LZString from 'lz-string'
import { CATEGORIES, type Category, type ExpenseRec, type Group, type Person, type SettlementRec, type Split } from '../types'
import { ValidationError, validateGroup } from '../validate'

export const SHARE_PREFIX = 's1.'
export const MAX_PAYLOAD_CHARS = 200_000
export const MAX_JSON_CHARS = 2_000_000
export const LINK_NOTE_CHARS = 6_000
export const LINK_MAX_CHARS = 60_000

export type DecodeErrorCode = 'version' | 'empty' | 'too-long' | 'corrupt' | 'invalid'

export class DecodeError extends Error {
  readonly code: DecodeErrorCode
  readonly detail: string | undefined
  constructor(code: DecodeErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'DecodeError'
    this.code = code
    this.detail = detail
  }
}

const MESSAGES: Record<DecodeErrorCode, string> = {
  version: 'This link was made by a newer Split Easy. Refresh to update.',
  empty: 'This link has no group in it. Ask for the link again.',
  'too-long': 'This link is too big to open. Ask for the group file instead.',
  corrupt: "This link looks cut off or damaged. Some chat apps trim long links. Ask for the link again, or for the group file.",
  invalid: "This link has data Split Easy can't trust, so nothing was imported.",
}

type Wire = {
  v: 1
  g: [string, string, string, string | 0, number | 0, number, number]
  p: unknown[][]
  e: unknown[][]
  t: unknown[][]
}

const MODES = ['equal', 'shares', 'exact'] as const

function splitToWire(s: Split): [number, unknown] {
  switch (s.mode) {
    case 'equal':
      return [0, [...s.participants]]
    case 'shares':
      return [1, Object.entries(s.weights)]
    case 'exact':
      return [2, Object.entries(s.amounts)]
  }
}

export function groupToWire(g: Group): Wire {
  return {
    v: 1,
    g: [g.id, g.name, g.currencySymbol, g.emoji ?? 0, g.settledAt ?? 0, g.createdAt, g.metaUpdatedAt],
    p: g.people.map((p) => (p.deleted ? [p.id, p.updatedAt, 1, p.name] : [p.id, p.name, p.updatedAt])),
    e: g.expenses.map((e) => {
      if ('deleted' in e) return [e.id, e.updatedAt, 1]
      const [mode, data] = splitToWire(e.split)
      return [e.id, e.title, e.amountCents, e.paidBy, mode, data, e.date, e.category ?? 0, e.note ?? 0, e.createdAt, e.updatedAt]
    }),
    t: g.settlements.map((s) => ('deleted' in s ? [s.id, s.updatedAt, 1] : [s.id, s.from, s.to, s.amountCents, s.date, s.updatedAt])),
  }
}

const bad = (path: string, msg: string): never => {
  throw new ValidationError(path, msg)
}

const isTombRow = (r: unknown[]) => typeof r[1] === 'number' && r[2] === 1

/** `0` means absent; empty string is not a valid value. */
function opt(v: unknown, path: string): unknown {
  if (v === 0) return undefined
  if (v === '') bad(path, 'empty value not allowed (use 0 for absent)')
  return v
}

function pairs(data: unknown, path: string): Record<string, unknown> {
  if (!Array.isArray(data)) return bad(path, 'must be a list of pairs')
  const out: Record<string, unknown> = {}
  const seen = new Set<unknown>()
  data.forEach((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2) bad(`${path}[${i}]`, 'must be a [person, number] pair')
    const [k, n] = pair as [unknown, unknown]
    if (typeof k !== 'string') bad(`${path}[${i}]`, 'person id must be text')
    if (seen.has(k)) bad(path, `duplicate person ${String(k)}`)
    seen.add(k)
    if (k === '__proto__') bad(`${path}[${i}]`, 'invalid id')
    out[k as string] = n
  })
  return out
}

/** Wire (already JSON-parsed) → validated Group. Throws ValidationError. */
export function wireToGroup(w: unknown): Group {
  if (typeof w !== 'object' || w === null || Array.isArray(w)) return bad('wire', 'must be an object')
  const o = w as Record<string, unknown>
  if (o.v !== 1) throw new DecodeError('version', MESSAGES.version)
  const g = o.g
  if (!Array.isArray(g) || g.length !== 7) return bad('g', 'must have 7 fields')
  for (const k of ['p', 'e', 't'] as const) if (!Array.isArray(o[k])) bad(k, 'must be a list')
  const rows = (k: 'p' | 'e' | 't') =>
    (o[k] as unknown[]).map((r, i) => (Array.isArray(r) ? (r as unknown[]) : bad(`${k}[${i}]`, 'must be a list')))

  const people: unknown[] = rows('p').map((r, i): Partial<Person> | unknown => {
    if (isTombRow(r)) {
      if (r.length !== 4) bad(`p[${i}]`, 'person tombstone must be [id, updatedAt, 1, name]')
      return { id: r[0], updatedAt: r[1], deleted: true, name: r[3] }
    }
    if (r.length !== 3) bad(`p[${i}]`, 'person must be [id, name, updatedAt]')
    return { id: r[0], name: r[1], updatedAt: r[2] }
  })

  const expenses: unknown[] = rows('e').map((r, i): Partial<ExpenseRec> | unknown => {
    if (isTombRow(r)) {
      if (r.length !== 3) bad(`e[${i}]`, 'expense tombstone must be [id, updatedAt, 1]')
      return { id: r[0], updatedAt: r[1], deleted: true }
    }
    if (r.length !== 11) bad(`e[${i}]`, 'expense must have 11 fields')
    const mode = MODES[r[4] as number]
    if (typeof r[4] !== 'number' || !mode) return bad(`e[${i}].mode`, 'unknown split mode')
    let split: unknown
    if (mode === 'equal') split = { mode, participants: r[5] }
    else if (mode === 'shares') split = { mode, weights: pairs(r[5], `e[${i}].weights`) }
    else split = { mode, amounts: pairs(r[5], `e[${i}].amounts`) }
    const e: Record<string, unknown> = {
      id: r[0],
      title: r[1],
      amountCents: r[2],
      paidBy: r[3],
      split,
      date: r[6],
      createdAt: r[9],
      updatedAt: r[10],
    }
    const cat = opt(r[7], `e[${i}].category`)
    if (cat !== undefined) {
      if (!(CATEGORIES as readonly unknown[]).includes(cat)) bad(`e[${i}].category`, 'unknown category')
      e.category = cat as Category
    }
    const note = opt(r[8], `e[${i}].note`)
    if (note !== undefined) e.note = note
    return e
  })

  const settlements: unknown[] = rows('t').map((r, i): Partial<SettlementRec> | unknown => {
    if (isTombRow(r)) {
      if (r.length !== 3) bad(`t[${i}]`, 'payment tombstone must be [id, updatedAt, 1]')
      return { id: r[0], updatedAt: r[1], deleted: true }
    }
    if (r.length !== 6) bad(`t[${i}]`, 'payment must have 6 fields')
    return { id: r[0], from: r[1], to: r[2], amountCents: r[3], date: r[4], updatedAt: r[5] }
  })

  const group: Record<string, unknown> = {
    id: g[0],
    name: g[1],
    currencySymbol: g[2],
    createdAt: g[5],
    metaUpdatedAt: g[6],
    people,
    expenses,
    settlements,
  }
  const emoji = opt(g[3], 'g.emoji')
  if (emoji !== undefined) group.emoji = emoji
  const settledAt = opt(g[4], 'g.settledAt')
  if (settledAt !== undefined) group.settledAt = settledAt
  return validateGroup(group)
}

export function encodeGroup(g: Group): string {
  return SHARE_PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify(groupToWire(g)))
}

export function shareUrl(origin: string, g: Group): string {
  return `${origin}/import#${encodeGroup(g)}`
}

export type LinkSize = 'ok' | 'long' | 'too-long'
export function linkSize(url: string): LinkSize {
  if (url.length <= LINK_NOTE_CHARS) return 'ok'
  if (url.length <= LINK_MAX_CHARS) return 'long'
  return 'too-long'
}

function friendly(e: unknown): DecodeError {
  if (e instanceof DecodeError) return e
  if (e instanceof ValidationError) return new DecodeError('invalid', MESSAGES.invalid, e.message)
  return new DecodeError('corrupt', MESSAGES.corrupt, e instanceof Error ? e.message : String(e))
}

export type DecodeResult = { ok: true; group: Group } | { ok: false; error: DecodeError }

/** Decode a raw fragment (with or without leading '#'). Never throws. Read location.hash raw. */
export function decodeFragment(raw: string): DecodeResult {
  try {
    const frag = raw.startsWith('#') ? raw.slice(1) : raw
    if (frag.length === 0) throw new DecodeError('empty', MESSAGES.empty)
    if (frag.length > MAX_PAYLOAD_CHARS + SHARE_PREFIX.length) throw new DecodeError('too-long', MESSAGES['too-long'])
    const m = /^s(\d+)\./.exec(frag)
    if (!m) throw new DecodeError('corrupt', MESSAGES.corrupt, 'missing version prefix')
    if (m[1] !== '1') throw new DecodeError('version', MESSAGES.version)
    const payload = frag.slice(m[0].length)
    if (payload.length === 0) throw new DecodeError('empty', MESSAGES.empty)
    const json = LZString.decompressFromEncodedURIComponent(payload)
    if (json === null || json === '') throw new DecodeError('corrupt', MESSAGES.corrupt, 'decompression failed')
    if (json.length > MAX_JSON_CHARS) throw new DecodeError('too-long', MESSAGES['too-long'])
    return { ok: true, group: parseWireJson(json) }
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
}

function parseWireJson(json: string): Group {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new DecodeError('corrupt', MESSAGES.corrupt, 'invalid JSON')
  }
  return wireToGroup(parsed)
}

/** Group file (.splitEasy.json): the same wire JSON, uncompressed. */
export function groupFileContents(g: Group): string {
  return JSON.stringify(groupToWire(g))
}

export function decodeGroupFile(text: string): DecodeResult {
  try {
    if (text.length > MAX_JSON_CHARS) throw new DecodeError('too-long', 'This file is too big to open.')
    return { ok: true, group: parseWireJson(text) }
  } catch (e) {
    const err = friendly(e)
    if (err.code === 'corrupt') return { ok: false, error: new DecodeError('corrupt', "This file isn't a Split Easy group file.", err.detail) }
    if (err.code === 'invalid') return { ok: false, error: new DecodeError('invalid', "This file has data Split Easy can't trust, so nothing was imported.", err.detail) }
    return { ok: false, error: err }
  }
}
