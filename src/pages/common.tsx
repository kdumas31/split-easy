import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { toast } from '../components/toastBus'
import { computeTotals, groupTotal, type PersonTotals } from '../lib/balances'
import { formatCents } from '../lib/money'
import { settleUp } from '../lib/settle'
import type { Group, Id, Transfer } from '../lib/types'
import { act } from '../state/app'
import { setSettled } from '../state/actions'

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Split Easy` : 'Split Easy'
  }, [title])
}

/** If the group (or other routed record) is gone, go Home with a toast. */
export function useMissingRedirect(missing: boolean, message: string) {
  const [, navigate] = useLocation()
  useEffect(() => {
    if (missing) {
      navigate('/', { replace: true })
      toast({ message })
    }
  }, [missing, message, navigate])
}

export interface GroupMath {
  totals: Map<Id, PersonTotals>
  balances: Map<Id, number>
  transfers: Transfer[]
  total: number
  nameOf: (id: Id) => string
}

export function groupMath(g: Group): GroupMath {
  const names = new Map(g.people.map((p) => [p.id, p.name]))
  const nameOf = (id: Id) => names.get(id) ?? 'Someone'
  const totals = computeTotals(g)
  const balances = new Map([...totals].map(([id, t]) => [id, t.balance]))
  return { totals, balances, transfers: settleUp(balances, nameOf), total: groupTotal(g), nameOf }
}

export function useGroupMath(g: Group | undefined): GroupMath | null {
  return useMemo(() => (g ? groupMath(g) : null), [g])
}

const TABS = [
  { path: '', label: 'Expenses' },
  { path: '/settle', label: 'Settle up' },
  { path: '/people', label: 'People' },
  { path: '/share', label: 'Share' },
  { path: '/print', label: 'Print' },
]

export function GroupChrome({ group, children, title }: { group: Group; children: ReactNode; title?: string }) {
  const [location] = useLocation()
  const base = `/g/${group.id}`
  const math = useGroupMath(group)
  return (
    <>
      <div className="group-head">
        <span className="group-emoji" aria-hidden="true">
          {group.emoji ?? '🧾'}
        </span>
        <div>
          <h1>{title ?? group.name}</h1>
          <div className="total">
            {title ? `${group.name} · ` : ''}
            <span className="amt">{formatCents(math?.total ?? 0, group.currencySymbol)}</span> spent
            {group.settledAt ? ' · Settled' : ''}
          </div>
        </div>
      </div>
      {group.isDemo && (
        <div className="banner demo" style={{ margin: '0 0 var(--space-3)' }}>
          <p>Sample data, delete anytime. Poke around: nothing here is real.</p>
        </div>
      )}
      {group.settledAt && (
        <div className="banner" style={{ margin: '0 0 var(--space-3)' }}>
          <p>This group is marked settled.</p>
          <button type="button" className="btn btn-small" onClick={() => act((d) => setSettled(d, group.id, false))}>
            Reopen
          </button>
        </div>
      )}
      <nav className="tabs" aria-label="Group sections">
        {TABS.map((t) => {
          const href = base + t.path
          return (
            <Link key={t.path} href={href} aria-current={location === href ? 'page' : undefined}>
              {t.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </>
  )
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function downloadBlob(blob: Blob, filename: string): Promise<'downloaded' | 'shared'> {
  const a = document.createElement('a')
  const supportsDownload = 'download' in a
  const standaloneIOS = (navigator as Navigator & { standalone?: boolean }).standalone === true
  if ((!supportsDownload || standaloneIOS) && typeof navigator.canShare === 'function') {
    const file = new File([blob], filename, { type: blob.type })
    if (navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: filename }).then(() => 'shared' as const)
    }
  }
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return Promise.resolve('downloaded')
}
