// Split Easy data model (PLAN.md §4). Derived values (balances, transfers) are never stored.

export type Id = string // 12 chars, base62
export type Cents = number // ALWAYS a safe integer
export type Stamp = number // ms epoch, strictly increasing per device

export const MAX_CENTS = 1_000_000_000 // $10,000,000.00 — same cap in UI and validate
export const MAX_WEIGHT = 100

export interface Person {
  id: Id
  name: string
  updatedAt: Stamp
  deleted?: true
}

export type Split =
  | { mode: 'equal'; participants: Id[] }
  | { mode: 'shares'; weights: Record<Id, number> }
  | { mode: 'exact'; amounts: Record<Id, Cents> }

export type SplitMode = Split['mode']

export const CATEGORIES = [
  'food',
  'groceries',
  'lodging',
  'transport',
  'activities',
  'shopping',
  'utilities',
  'other',
] as const
export type Category = (typeof CATEGORIES)[number]

export interface Expense {
  id: Id
  title: string
  amountCents: Cents
  paidBy: Id
  split: Split
  category?: Category
  note?: string
  date: string // YYYY-MM-DD local
  createdAt: Stamp
  updatedAt: Stamp
}

/** A deleted record. Kept for the life of the group so old links can't resurrect it. */
export interface Tomb {
  id: Id
  updatedAt: Stamp
  deleted: true
}

export type ExpenseRec = Expense | Tomb

export interface Settlement {
  id: Id
  from: Id
  to: Id
  amountCents: Cents
  date: string
  updatedAt: Stamp
}

export type SettlementRec = Settlement | Tomb

export interface Group {
  id: Id
  name: string
  emoji?: string
  currencySymbol: string
  settledAt?: Stamp | null
  isDemo?: true
  createdAt: Stamp
  metaUpdatedAt: Stamp
  people: Person[]
  expenses: ExpenseRec[]
  settlements: SettlementRec[]
}

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  theme: Theme
  defaultCurrencySymbol: string
  lastGroupId?: Id
}

export const CURRENT_SCHEMA = 1

export interface DataDoc {
  schemaVersion: number
  groups: Group[]
  settings: Settings
  lastStamp: number
}

export interface Transfer {
  from: Id
  to: Id
  amountCents: Cents
}

export function assertCents(n: unknown, what = 'amount'): asserts n is Cents {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new TypeError(`${what} must be a safe integer number of cents, got ${String(n)}`)
  }
}

export function isTomb(r: ExpenseRec | SettlementRec): r is Tomb {
  return 'deleted' in r && r.deleted === true
}

export function liveExpenses(g: Group): Expense[] {
  return g.expenses.filter((e): e is Expense => !isTomb(e))
}

export function liveSettlements(g: Group): Settlement[] {
  return g.settlements.filter((s): s is Settlement => !isTomb(s))
}

export function livePeople(g: Group): Person[] {
  return g.people.filter((p) => !p.deleted)
}
