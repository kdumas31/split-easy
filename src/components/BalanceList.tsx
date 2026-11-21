import { formatCents } from '../lib/money'
import type { Cents, Id, Person } from '../lib/types'

/** Words + sign + colour, never colour alone: "Maya gets back $42.10". */
export function BalanceText({ name, cents, symbol }: { name: string; cents: Cents; symbol: string }) {
  if (cents > 0)
    return (
      <>
        {name} <span className="gets-back">gets back <span className="amt">{formatCents(cents, symbol)}</span></span>
      </>
    )
  if (cents < 0)
    return (
      <>
        {name} <span className="owes">owes <span className="amt">{formatCents(-cents, symbol)}</span></span>
      </>
    )
  return (
    <>
      {name} <span className="square">is square</span>
    </>
  )
}

export function BalanceList({ people, balances, symbol }: { people: Person[]; balances: Map<Id, Cents>; symbol: string }) {
  const rows = people
    .filter((p) => !p.deleted || (balances.get(p.id) ?? 0) !== 0)
    .map((p) => ({ p, c: balances.get(p.id) ?? 0 }))
    .sort((a, b) => b.c - a.c || a.p.name.localeCompare(b.p.name))
  return (
    <ul className="list" aria-label="Balances">
      {rows.map(({ p, c }) => (
        <li key={p.id} className="list-row" data-testid={`balance-${p.name}`}>
          <span className="grow">
            <BalanceText name={p.name} cents={c} symbol={symbol} />
          </span>
        </li>
      ))}
    </ul>
  )
}
