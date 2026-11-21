// Step-by-step schema migrations. migrations[n] turns a v{n} document into v{n+1}.
// v1 is the baseline. v0 is a fake pre-release shape kept only to exercise the migration path:
// groups had no `metaUpdatedAt` or `currencySymbol`, and the theme lived at the top level.

import { CURRENT_SCHEMA } from './types'

type Raw = Record<string, unknown>

export const migrations: Record<number, (doc: Raw) => Raw> = {
  0: (doc) => {
    const groups = Array.isArray(doc.groups) ? doc.groups : []
    return {
      schemaVersion: 1,
      groups: groups.map((g: Raw) => ({
        ...g,
        currencySymbol: typeof g.currencySymbol === 'string' ? g.currencySymbol : '$',
        metaUpdatedAt: typeof g.metaUpdatedAt === 'number' ? g.metaUpdatedAt : g.createdAt,
      })),
      settings: {
        theme: typeof doc.theme === 'string' ? doc.theme : 'system',
        defaultCurrencySymbol: '$',
      },
      lastStamp: typeof doc.lastStamp === 'number' ? doc.lastStamp : 0,
    }
  },
}

export function schemaOf(doc: Raw): number {
  const v = doc.schemaVersion
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0
}

/** Runs migrations until CURRENT_SCHEMA. Throws if a step is missing. */
export function migrate(doc: Raw): Raw {
  let cur = doc
  let v = schemaOf(cur)
  while (v < CURRENT_SCHEMA) {
    const step = migrations[v]
    if (!step) throw new Error(`No migration from schema ${v}`)
    cur = step(cur)
    v = schemaOf(cur)
  }
  return cur
}
