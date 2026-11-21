import { useId, useState } from 'react'
import { AmountInput, amountError, prettyAmount } from '../components/AmountInput'
import { BalanceList } from '../components/BalanceList'
import { Dialog } from '../components/Dialog'
import { toast } from '../components/toastBus'
import { TransferList, transferLabel } from '../components/TransferList'
import { formatDateLong, isValidDate } from '../lib/dates'
import { formatCents, parseCents, plainCents } from '../lib/money'
import { liveSettlements, type Settlement, type Transfer } from '../lib/types'
import { act, actWith, useGroup } from '../state/app'
import { deleteSettlement, editSettlement, recordSettlement, setSettled } from '../state/actions'
import { GroupChrome, pluralize, useGroupMath, useMissingRedirect, useTitle } from './common'

export function SettleUp({ params }: { params: { gid: string } }) {
  const group = useGroup(params.gid)
  const math = useGroupMath(group)
  const id = useId()
  const [settleDialog, setSettleDialog] = useState(false)
  const [editing, setEditing] = useState<Settlement | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  useTitle(group ? `Settle up · ${group.name}` : '')
  useMissingRedirect(!group, 'That group isn’t on this device anymore.')
  if (!group || !math) return null

  const sym = group.currencySymbol
  const payments = liveSettlements(group).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt))

  const markPaid = (t: Transfer) => {
    const sid = actWith((d) => recordSettlement(d, group.id, t))
    if (!sid) return
    toast({
      message: `Recorded: ${transferLabel(t, math.nameOf, sym)}.`,
      durationMs: 5000,
      action: { label: 'Undo', onClick: () => act((d) => deleteSettlement(d, group.id, sid)) },
    })
  }

  const markGroupSettled = () => {
    if (math.transfers.length === 0) {
      if (act((d) => setSettled(d, group.id, true))) toast({ message: 'Marked settled. Nice work.' })
      return
    }
    setSettleDialog(true)
  }

  const editErr = amountError(editAmount) ?? (isValidDate(editDate) ? null : 'Pick a date.')

  return (
    <GroupChrome group={group} title="Settle up">
      <section aria-labelledby={`${id}-bal`}>
        <h2 id={`${id}-bal`}>Balances</h2>
        <div className="card">
          <BalanceList people={group.people} balances={math.balances} symbol={sym} />
        </div>
      </section>

      <section aria-labelledby={`${id}-tr`}>
        <h2 id={`${id}-tr`} className="section-title">
          <span>Suggested payments</span>
          {math.transfers.length > 0 && <span className="pill">{pluralize(math.transfers.length, 'payment')}</span>}
        </h2>
        <div className="card">
          {math.transfers.length === 0 ? (
            <p style={{ margin: 0 }}>All square. Nobody owes anybody. Enjoy it while it lasts.</p>
          ) : (
            <>
              <p className="hint">The fewest payments that get everyone to zero. Tap “Mark paid” once the money has actually moved.</p>
              <TransferList transfers={math.transfers} nameOf={math.nameOf} symbol={sym} onMarkPaid={markPaid} />
            </>
          )}
        </div>
      </section>

      <section aria-labelledby={`${id}-pay`}>
        <h2 id={`${id}-pay`} className="section-title">
          Payments
        </h2>
        <div className="card">
          {payments.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No payments recorded yet.
            </p>
          ) : (
            <ul className="list" aria-label="Recorded payments">
              {payments.map((s) => (
                <li key={s.id} className="list-row">
                  <span className="grow">
                    <span className="title">
                      {math.nameOf(s.from)} paid {math.nameOf(s.to)} <span className="amt">{formatCents(s.amountCents, sym)}</span>
                    </span>
                    <span className="sub" style={{ display: 'block' }}>
                      {formatDateLong(s.date)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    aria-label={`Edit payment: ${math.nameOf(s.from)} paid ${math.nameOf(s.to)}`}
                    onClick={() => {
                      setEditing(s)
                      setEditAmount(prettyAmount(plainCents(s.amountCents)))
                      setEditDate(s.date)
                    }}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="row wrap" style={{ marginTop: 'var(--space-5)' }}>
        {group.settledAt ? (
          <button type="button" className="btn" onClick={() => act((d) => setSettled(d, group.id, false))}>
            Reopen group
          </button>
        ) : (
          <button type="button" className="btn" onClick={markGroupSettled}>
            Mark group settled
          </button>
        )}
      </div>

      <Dialog
        open={settleDialog}
        title="Not everyone is square yet"
        onClose={() => setSettleDialog(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setSettleDialog(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const ok = act((d) => {
                  let next = d
                  for (const t of math.transfers) next = recordSettlement(next, group.id, t)[0]
                  return setSettled(next, group.id, true)
                })
                setSettleDialog(false)
                if (ok) toast({ message: 'Payments recorded and group marked settled.' })
              }}
            >
              Record the {pluralize(math.transfers.length, 'suggested payment')} and mark settled
            </button>
          </>
        }
      >
        <ul>
          {math.transfers.map((t) => (
            <li key={`${t.from}-${t.to}`}>{transferLabel(t, math.nameOf, sym)}</li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={editing !== null}
        title="Edit payment"
        onClose={() => setEditing(null)}
        actions={
          <>
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                const ok = editing !== null && act((d) => deleteSettlement(d, group.id, editing.id))
                setEditing(null)
                if (ok) toast({ message: 'Payment deleted.' })
              }}
            >
              Delete
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={editErr !== null}
              onClick={() => {
                const c = parseCents(editAmount)
                if (editing && c !== null) act((d) => editSettlement(d, group.id, editing.id, { amountCents: c, date: editDate }))
                setEditing(null)
              }}
            >
              Save
            </button>
          </>
        }
      >
        {editing && (
          <>
            <p>
              {math.nameOf(editing.from)} paid {math.nameOf(editing.to)}
            </p>
            <div className="field">
              <label htmlFor={`${id}-ea`}>Amount</label>
              <AmountInput id={`${id}-ea`} value={editAmount} onChange={setEditAmount} symbol={sym} describedBy={`${id}-ee`} invalid={editErr !== null} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-ed`}>Date</label>
              <input id={`${id}-ed`} type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <p id={`${id}-ee`} className="error" aria-live="polite">
              {editErr ?? ''}
            </p>
          </>
        )}
      </Dialog>
    </GroupChrome>
  )
}
