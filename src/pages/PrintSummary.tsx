import { categoryLabel } from '../components/categories'
import { formatDateLong, formatDateShort, todayLocal } from '../lib/dates'
import { formatCents } from '../lib/money'
import { liveExpenses, liveSettlements } from '../lib/types'
import { useGroup } from '../state/app'
import { exportCsv } from './Group'
import { GroupChrome, useGroupMath, useMissingRedirect, useTitle } from './common'

export function PrintSummary({ params }: { params: { gid: string } }) {
  const group = useGroup(params.gid)
  const math = useGroupMath(group)
  useTitle(group ? `Summary · ${group.name}` : '')
  useMissingRedirect(!group, 'That group isn’t on this device anymore.')
  if (!group || !math) return null

  const sym = group.currencySymbol
  const expenses = liveExpenses(group).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
  const payments = liveSettlements(group).sort((a, b) => (a.date < b.date ? -1 : 1))
  const dates = [...expenses.map((e) => e.date), ...payments.map((p) => p.date)].sort()
  const range = dates.length ? (dates[0] === dates[dates.length - 1] ? formatDateLong(dates[0] as string) : `${formatDateLong(dates[0] as string)} – ${formatDateLong(dates[dates.length - 1] as string)}`) : 'No dates yet'
  const people = group.people.filter((p) => !p.deleted)

  return (
    <GroupChrome group={group} title="Summary">
      <div className="row wrap no-print" style={{ marginBottom: 'var(--space-4)' }}>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" className="btn" onClick={() => exportCsv(group)}>
          Export CSV
        </button>
      </div>

      <article className="print-sheet">
        <header className="print-only">
          <h2 style={{ fontSize: '1.6rem' }}>
            {group.emoji ? `${group.emoji} ` : ''}
            {group.name}
          </h2>
        </header>
        <p>
          {range} · Total spent <strong className="amt">{formatCents(math.total, sym)}</strong>
        </p>

        <section>
          <h2>Who paid, who owes</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col" className="num">
                    Paid
                  </th>
                  <th scope="col" className="num">
                    Share
                  </th>
                  <th scope="col" className="num">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const t = math.totals.get(p.id) ?? { paid: 0, share: 0, sent: 0, received: 0, balance: 0 }
                  return (
                    <tr key={p.id}>
                      <th scope="row">{p.name}</th>
                      <td className="num amt">{formatCents(t.paid, sym)}</td>
                      <td className="num amt">{formatCents(t.share, sym)}</td>
                      <td className="num amt">
                        {t.balance > 0 ? `gets back ${formatCents(t.balance, sym)}` : t.balance < 0 ? `owes ${formatCents(-t.balance, sym)}` : 'square'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {payments.length > 0 && <p className="hint">Balances include {payments.length === 1 ? 'one recorded payment' : `${payments.length} recorded payments`}.</p>}
        </section>

        <section>
          <h2>To settle up</h2>
          {math.transfers.length === 0 ? (
            <p>All square. Nobody owes anybody.</p>
          ) : (
            <ul>
              {math.transfers.map((t) => (
                <li key={`${t.from}-${t.to}`}>
                  {math.nameOf(t.from)} pays {math.nameOf(t.to)} <strong className="amt">{formatCents(t.amountCents, sym)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>All expenses</h2>
          {expenses.length === 0 ? (
            <p>No expenses yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">What</th>
                    <th scope="col">Category</th>
                    <th scope="col">Paid by</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDateShort(e.date)}</td>
                      <td>
                        {e.title}
                        {e.note && <div className="hint">{e.note}</div>}
                      </td>
                      <td>{categoryLabel(e.category)}</td>
                      <td>{math.nameOf(e.paidBy)}</td>
                      <td className="num amt">{formatCents(e.amountCents, sym)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {payments.length > 0 && (
          <section>
            <h2>Recorded payments</h2>
            <ul>
              {payments.map((p) => (
                <li key={p.id}>
                  {formatDateShort(p.date)}: {math.nameOf(p.from)} paid {math.nameOf(p.to)} <span className="amt">{formatCents(p.amountCents, sym)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="print-footer">Printed {formatDateLong(todayLocal())} from Split Easy</footer>
      </article>
    </GroupChrome>
  )
}
