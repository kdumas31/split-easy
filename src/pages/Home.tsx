import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { GroupSheet } from '../components/GroupSheet'
import { SplitCoin } from '../components/Wordmark'
import { formatCents } from '../lib/money'
import type { Group } from '../lib/types'
import { act, actWith, useDoc } from '../state/app'
import { addDemoGroup, createGroup } from '../state/actions'
import { groupMath, pluralize, useTitle } from './common'

function GroupCard({ g }: { g: Group }) {
  const m = useMemo(() => groupMath(g), [g])
  const people = g.people.filter((p) => !p.deleted).length
  const status = m.transfers.length === 0 ? 'All square' : `${pluralize(m.transfers.length, 'payment')} to settle`
  return (
    <li>
      <Link href={`/g/${g.id}`} className={`card card-link group-card${g.settledAt ? ' muted-card' : ''}`}>
        <span className="group-emoji" aria-hidden="true">
          {g.emoji ?? '🧾'}
        </span>
        <span>
          <h2>{g.name}</h2>
          <span className="meta">
            {pluralize(people, 'person', 'people')} · {status}
          </span>
        </span>
        <span className="amt" style={{ fontWeight: 700 }}>
          {formatCents(m.total, g.currencySymbol)}
          <span className="visually-hidden"> spent</span>
        </span>
      </Link>
    </li>
  )
}

export function Home() {
  useTitle('')
  const doc = useDoc()
  const [, navigate] = useLocation()
  const [sheet, setSheet] = useState(false)
  const active = doc.groups.filter((g) => !g.settledAt)
  const settled = doc.groups.filter((g) => g.settledAt)

  const tryDemo = () => {
    const existing = doc.groups.find((g) => g.isDemo)
    if (existing) return navigate(`/g/${existing.id}`)
    const id = actWith((d) => addDemoGroup(d))
    if (id) navigate(`/g/${id}`)
  }

  return (
    <>
      <h1 className={doc.groups.length ? '' : 'visually-hidden'}>Your groups</h1>
      {doc.groups.length === 0 ? (
        <section className="empty" aria-labelledby="welcome">
          <div className="art" aria-hidden="true">
            <SplitCoin size={64} />
          </div>
          <h2 id="welcome" style={{ fontSize: '1.7rem' }}>
            Fair shares, no fuss.
          </h2>
          <p className="muted">Trips, rent, dinners: we keep the math honest so you can keep the friends.</p>
          <p>No groups yet. Start one for a trip, a house, or tonight’s dinner.</p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => setSheet(true)}>
              Start a group
            </button>
            <button type="button" className="btn" onClick={tryDemo}>
              Try the demo trip
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 'var(--space-4)' }}>
            <button type="button" className="btn btn-primary" onClick={() => setSheet(true)}>
              New group
            </button>
            <button type="button" className="btn" onClick={tryDemo}>
              Try the demo trip
            </button>
          </div>
          {active.length > 0 && (
            <ul className="list-plain stack" aria-label="Active groups" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {active.map((g) => (
                <GroupCard key={g.id} g={g} />
              ))}
            </ul>
          )}
          {settled.length > 0 && (
            <section aria-labelledby="settled-h">
              <h2 id="settled-h" className="section-title">
                Settled
              </h2>
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {settled.map((g) => (
                  <GroupCard key={g.id} g={g} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <GroupSheet
        open={sheet}
        mode="create"
        defaultCurrency={doc.settings.defaultCurrencySymbol}
        onClose={() => setSheet(false)}
        onSubmit={(v) => {
          let id: string | undefined
          act((d) => {
            const input: Parameters<typeof createGroup>[1] = { name: v.name, currencySymbol: v.currencySymbol, people: v.people }
            if (v.emoji) input.emoji = v.emoji
            const [next, gid] = createGroup(d, input)
            id = gid
            return next
          })
          setSheet(false)
          if (id) navigate(`/g/${id}`)
        }}
      />
    </>
  )
}
