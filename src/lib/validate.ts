// Hand-written guards for stored and imported data (PLAN.md §4 Validation).
// validateGroup returns a clean copy (unknown fields dropped) or throws ValidationError.

import { isValidDate } from './dates'
import { ID_RE } from './ids'
import { remainderMessage } from './money'
import {
  CATEGORIES,
  MAX_CENTS,
  MAX_WEIGHT,
  type Category,
  type Expense,
  type ExpenseRec,
  type Group,
  type Id,
  type Person,
  type Settlement,
  type SettlementRec,
  type Settings,
  type Split,
  type Theme,
} from './types'

export class ValidationError extends Error {
  readonly path: string
  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'ValidationError'
    this.path = path
  }
}

const fail = (path: string, msg: string): never => {
  throw new ValidationError(path, msg)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export const LIMITS = {
  personName: 40,
  title: 80,
  groupName: 60,
  note: 280,
  currency: 3,
} as const

export function charLength(s: string): number {
  return [...s].length
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

export function graphemeCount(s: string): number {
  if (!segmenter) return charLength(s)
  let n = 0
  for (const _ of segmenter.segment(s)) n++
  return n
}

export function isOneGrapheme(s: string): boolean {
  return s.trim() === s && s.length > 0 && graphemeCount(s) === 1 && !/^[\p{L}\p{N}\s]$/u.test(s)
}

function str(v: unknown, path: string, min: number, max: number, trim = true): string {
  if (typeof v !== 'string') return fail(path, 'must be text')
  const s = trim ? v.trim() : v
  const n = charLength(s)
  if (n < min || n > max) fail(path, `must be ${min}–${max} characters`)
  return s
}

function id(v: unknown, path: string): Id {
  if (typeof v !== 'string' || !ID_RE.test(v)) return fail(path, 'is not a valid id')
  return v
}

function stampOf(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return fail(path, 'is not a valid timestamp')
  return v
}

function cents(v: unknown, path: string, min: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return fail(path, 'must be a whole number of cents')
  if (v < min || v > MAX_CENTS) fail(path, `must be between ${min} and ${MAX_CENTS} cents`)
  return v
}

function date(v: unknown, path: string): string {
  if (!isValidDate(v)) return fail(path, 'is not a valid date (YYYY-MM-DD)')
  return v
}

function uniqueIds<T extends { id: Id }>(rows: T[], path: string): void {
  const seen = new Set<Id>()
  for (const r of rows) {
    if (seen.has(r.id)) fail(path, `duplicate id ${r.id}`)
    seen.add(r.id)
  }
}

function person(v: unknown, path: string): Person {
  if (!isObj(v)) return fail(path, 'must be an object')
  const p: Person = {
    id: id(v.id, `${path}.id`),
    name: str(v.name, `${path}.name`, 1, LIMITS.personName),
    updatedAt: stampOf(v.updatedAt, `${path}.updatedAt`),
  }
  if (v.deleted !== undefined) {
    if (v.deleted !== true) fail(`${path}.deleted`, 'must be true when present')
    p.deleted = true
  }
  return p
}

function split(v: unknown, path: string, known: Set<Id>, total: number): Split {
  if (!isObj(v)) return fail(path, 'must be an object')
  const ref = (pid: unknown, p: string) => {
    const x = id(pid, p)
    if (!known.has(x)) fail(p, `refers to unknown person ${x}`)
    return x
  }
  switch (v.mode) {
    case 'equal': {
      if (!Array.isArray(v.participants) || v.participants.length === 0) return fail(`${path}.participants`, 'needs at least one person')
      const seen = new Set<Id>()
      const participants = v.participants.map((pid, i) => {
        const x = ref(pid, `${path}.participants[${i}]`)
        if (seen.has(x)) fail(`${path}.participants`, `duplicate person ${x}`)
        seen.add(x)
        return x
      })
      return { mode: 'equal', participants }
    }
    case 'shares': {
      if (!isObj(v.weights)) return fail(`${path}.weights`, 'must be an object')
      const weights: Record<Id, number> = {}
      let any = false
      for (const [k, w] of Object.entries(v.weights)) {
        ref(k, `${path}.weights.${k}`)
        if (typeof w !== 'number' || !Number.isInteger(w) || w < 0 || w > MAX_WEIGHT) fail(`${path}.weights.${k}`, 'must be a whole number 0–100')
        if ((w as number) > 0) any = true
        weights[k] = w as number
      }
      if (!any) fail(`${path}.weights`, 'at least one weight must be above 0')
      return { mode: 'shares', weights }
    }
    case 'exact': {
      if (!isObj(v.amounts)) return fail(`${path}.amounts`, 'must be an object')
      const amounts: Record<Id, number> = {}
      let sum = 0
      for (const [k, a] of Object.entries(v.amounts)) {
        ref(k, `${path}.amounts.${k}`)
        amounts[k] = cents(a, `${path}.amounts.${k}`, 0)
        sum += amounts[k] as number
      }
      if (sum !== total) fail(`${path}.amounts`, remainderMessage(total - sum) ?? 'mismatch')
      return { mode: 'exact', amounts }
    }
    default:
      return fail(`${path}.mode`, 'unknown split mode')
  }
}

function tombOrNull(v: Obj, path: string): { id: Id; updatedAt: number; deleted: true } | null {
  if (v.deleted === undefined) return null
  if (v.deleted !== true) fail(`${path}.deleted`, 'must be true when present')
  return { id: id(v.id, `${path}.id`), updatedAt: stampOf(v.updatedAt, `${path}.updatedAt`), deleted: true }
}

function expense(v: unknown, path: string, known: Set<Id>, minAmount: number): ExpenseRec {
  if (!isObj(v)) return fail(path, 'must be an object')
  const t = tombOrNull(v, path)
  if (t) return t
  const amountCents = cents(v.amountCents, `${path}.amountCents`, minAmount)
  const paidBy = id(v.paidBy, `${path}.paidBy`)
  if (!known.has(paidBy)) fail(`${path}.paidBy`, `refers to unknown person ${paidBy}`)
  const e: Expense = {
    id: id(v.id, `${path}.id`),
    title: str(v.title, `${path}.title`, 1, LIMITS.title),
    amountCents,
    paidBy,
    split: split(v.split, `${path}.split`, known, amountCents),
    date: date(v.date, `${path}.date`),
    createdAt: stampOf(v.createdAt, `${path}.createdAt`),
    updatedAt: stampOf(v.updatedAt, `${path}.updatedAt`),
  }
  if (v.category !== undefined) {
    if (typeof v.category !== 'string' || !(CATEGORIES as readonly string[]).includes(v.category)) fail(`${path}.category`, 'unknown category')
    e.category = v.category as Category
  }
  if (v.note !== undefined) {
    const note = str(v.note, `${path}.note`, 1, LIMITS.note)
    e.note = note
  }
  return e
}

function settlement(v: unknown, path: string, known: Set<Id>, minAmount: number): SettlementRec {
  if (!isObj(v)) return fail(path, 'must be an object')
  const t = tombOrNull(v, path)
  if (t) return t
  const from = id(v.from, `${path}.from`)
  const to = id(v.to, `${path}.to`)
  if (!known.has(from)) fail(`${path}.from`, `refers to unknown person ${from}`)
  if (!known.has(to)) fail(`${path}.to`, `refers to unknown person ${to}`)
  if (from === to) fail(path, 'a payment needs two different people')
  const s: Settlement = {
    id: id(v.id, `${path}.id`),
    from,
    to,
    amountCents: cents(v.amountCents, `${path}.amountCents`, minAmount),
    date: date(v.date, `${path}.date`),
    updatedAt: stampOf(v.updatedAt, `${path}.updatedAt`),
  }
  return s
}

export interface ValidateOptions {
  /** Allow amountCents 0 (lib only). Stored/imported records need ≥ 1. */
  allowZeroAmounts?: boolean
}

export function validateGroup(v: unknown, path = 'group', opts: ValidateOptions = {}): Group {
  if (!isObj(v)) return fail(path, 'must be an object')
  const minAmount = opts.allowZeroAmounts ? 0 : 1
  if (!Array.isArray(v.people)) return fail(`${path}.people`, 'must be a list')
  if (!Array.isArray(v.expenses)) return fail(`${path}.expenses`, 'must be a list')
  if (!Array.isArray(v.settlements)) return fail(`${path}.settlements`, 'must be a list')
  const people = v.people.map((p, i) => person(p, `${path}.people[${i}]`))
  uniqueIds(people, `${path}.people`)
  const known = new Set(people.map((p) => p.id)) // tombstoned people count as known
  const expenses = v.expenses.map((e, i) => expense(e, `${path}.expenses[${i}]`, known, minAmount))
  uniqueIds(expenses, `${path}.expenses`)
  const settlements = v.settlements.map((s, i) => settlement(s, `${path}.settlements[${i}]`, known, minAmount))
  uniqueIds(settlements, `${path}.settlements`)

  const g: Group = {
    id: id(v.id, `${path}.id`),
    name: str(v.name, `${path}.name`, 1, LIMITS.groupName),
    currencySymbol: str(v.currencySymbol, `${path}.currencySymbol`, 0, LIMITS.currency),
    createdAt: stampOf(v.createdAt, `${path}.createdAt`),
    metaUpdatedAt: stampOf(v.metaUpdatedAt, `${path}.metaUpdatedAt`),
    people,
    expenses,
    settlements,
  }
  if (v.emoji !== undefined) {
    if (typeof v.emoji !== 'string' || !isOneGrapheme(v.emoji)) fail(`${path}.emoji`, 'must be exactly one emoji')
    g.emoji = v.emoji as string
  }
  // null and absent both mean "active"; normalise to absent so documents compare equal.
  if (v.settledAt !== undefined && v.settledAt !== null) g.settledAt = stampOf(v.settledAt, `${path}.settledAt`)
  if (v.isDemo !== undefined) {
    if (v.isDemo !== true) fail(`${path}.isDemo`, 'must be true when present')
    g.isDemo = true
  }
  return g
}

const THEMES: readonly Theme[] = ['system', 'light', 'dark']

export function validateSettings(v: unknown): Settings {
  if (!isObj(v)) return fail('settings', 'must be an object')
  const theme = typeof v.theme === 'string' && (THEMES as readonly string[]).includes(v.theme) ? (v.theme as Theme) : fail('settings.theme', 'unknown theme')
  const s: Settings = {
    theme,
    defaultCurrencySymbol: str(v.defaultCurrencySymbol, 'settings.defaultCurrencySymbol', 0, LIMITS.currency),
  }
  if (v.lastGroupId !== undefined) s.lastGroupId = id(v.lastGroupId, 'settings.lastGroupId')
  return s
}

export function validateGroups(v: unknown): Group[] {
  if (!Array.isArray(v)) return fail('groups', 'must be a list')
  const groups = v.map((g, i) => validateGroup(g, `groups[${i}]`))
  uniqueIds(groups, 'groups')
  return groups
}
