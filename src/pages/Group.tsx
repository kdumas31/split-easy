import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { categoryIcon, categoryLabel } from '../components/categories'
import { useConfirm } from '../components/Dialog'
import { GroupSheet } from '../components/GroupSheet'
import { toast } from '../components/toastBus'
import { groupToCsv, csvFilename } from '../lib/csv'
import { formatDateLong, todayLocal } from '../lib/dates'
import { formatCents } from '../lib/money'
import { liveExpenses, type Expense } from '../lib/types'
import { act, useDoc, useGroup } from '../state/app'
import { deleteGroup, updateGroupMeta } from '../state/actions'
import { GroupChrome, downloadBlob, useMissingRedirect, useTitle } from './common'

export function exportCsv(g: Parameters<typeof groupToCsv>[0]) {
  const blob = new Blob([groupToCsv(g)], { type: 'text/csv;charset=utf-8' })
  void downloadBlob(blob, csvFilename(g, todayLocal()))
    .then((how) => toast({ message: how === 'shared' ? 'CSV ready to share.' : 'CSV downloaded.' }))
    .catch(() => undefined)
}

export function GroupPage({ params }: { params: { gid: string } }) {
  const group = useGroup(params.gid)
  const doc = useDoc()
  const [, navigate] = useLocation()
  const [edit, setEdit] = useState(false)
  const [confirmEl, confirm] = useConfirm()
  useTitle(group?.name ?? '')
  useMissingRedirect(!group, 'That group isn’t on this device anymore.')
  if (!group) return null

  const expenses = liveExpenses(group).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
  const byDate = new Map<string, Expense[]>()
  for (const e of expenses) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
  const nameOf = (id: string) => group.people.find((p) => p.id === id)?.name ?? 'Someone'

  return (
    <GroupChrome group={group}>
      <div className="row wrap" style={{ marginBottom: 'var(--space-3)' }}>
        <Link href={`/g/${group.id}/settle`} className="btn btn-primary">
          Settle up
        </Link>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-small" onClick={() => exportCsv(group)}>
          Export CSV
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setEdit(true)}>
          Edit group
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="empty">
          <div className="art" aria-hidden="true">
            🧾
          </div>
          <p>Nothing spent yet. The first round’s on someone. Add it here.</p>
          <Link href={`/g/${group.id}/expense/new`} className="btn btn-primary">
            Add expense
          </Link>
        </div>
      ) : (
        <section aria-label="Expenses">
          {[...byDate].map(([date, list]) => (
            <div key={date}>
              <h2 className="date-heading">{formatDateLong(date)}</h2>
              <ul className="list">
                {list.map((e) => (
                  <li key={e.id}>
                    <Link href={`/g/${group.id}/expense/${e.id}`} className="list-row">
                      <span className="cat-icon" aria-hidden="true">
                        {categoryIcon(e.category)}
                      </span>
                      <span className="grow">
                        <span className="title">{e.title}</span>
                        <span className="sub" style={{ display: 'block' }}>
                          {categoryLabel(e.category)} · {nameOf(e.paidBy)} paid
                        </span>
                      </span>
                      <span className="amt" style={{ fontWeight: 700 }}>
                        {formatCents(e.amountCents, group.currencySymbol)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {expenses.length > 0 && (
        <Link href={`/g/${group.id}/expense/new`} className="btn btn-primary fab">
          <span aria-hidden="true">＋</span> Add expense
        </Link>
      )}

      <GroupSheet
        open={edit}
        mode="edit"
        group={group}
        defaultCurrency={doc.settings.defaultCurrencySymbol}
        onClose={() => setEdit(false)}
        onSubmit={(v) => {
          act((d) => updateGroupMeta(d, group.id, { name: v.name, emoji: v.emoji || null, currencySymbol: v.currencySymbol }))
          setEdit(false)
        }}
        onDelete={async () => {
          setEdit(false)
          const ok = await confirm({
            title: `Delete ${group.name}?`,
            body: 'This removes the group and all its expenses from this device. Anyone you shared it with keeps their copy.',
            confirmLabel: 'Delete group',
            danger: true,
          })
          if (!ok) return
          if (!act((d) => deleteGroup(d, group.id))) return
          navigate('/')
          toast({ message: 'Group deleted.' })
        }}
      />
      {confirmEl}
    </GroupChrome>
  )
}
