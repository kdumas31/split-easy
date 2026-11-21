import { useId, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { toast } from '../components/toastBus'
import { getLastStamp } from '../lib/clock'
import { newId } from '../lib/ids'
import { DecodeError, decodeFragment, decodeGroupFile, type DecodeResult } from '../lib/share/codec'
import { copyWithNewIds, groupCounts, mergeGroup, type MergeReport, type ReportBucket } from '../lib/share/merge'
import { writeUndo } from '../lib/storage'
import type { Group } from '../lib/types'
import { act, store, useDoc } from '../state/app'
import { importAddGroup, importMergeGroup } from '../state/importActions'
import { pluralize, useTitle } from './common'

function Titles({ b }: { b: ReportBucket }) {
  if (b.count === 0) return null
  const shown = b.titles.slice(0, 5)
  const more = b.titles.length - shown.length
  return (
    <ul className="report-list">
      {shown.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
      {more > 0 && <li>and {more} more</li>}
    </ul>
  )
}

function summary(r: MergeReport): string {
  const parts = [`${r.added.count} new`, `${r.updated.count} updated`]
  if (r.removed.count) parts.push(`${r.removed.count} removed by them`)
  const tail = r.removed.count === 0 ? ' Nothing of yours was removed.' : ' Things only you had were kept.'
  return `Merged. ${parts.join(', ')}.${tail}`
}

export function ImportPage() {
  useTitle('Import')
  const id = useId()
  const doc = useDoc()
  const [, navigate] = useLocation()
  // Read the fragment raw, exactly once (never via URLSearchParams: it turns "+" into a space).
  const [decoded, setDecoded] = useState<DecodeResult | null>(() => (window.location.hash.length > 1 ? decodeFragment(window.location.hash) : null))

  const incoming = decoded?.ok ? decoded.group : null
  const local = incoming ? doc.groups.find((g) => g.id === incoming.id) : undefined
  const plan = useMemo(() => (incoming && local ? mergeGroup(local, incoming) : null), [incoming, local])

  // The share fragment stays in the URL until a save succeeds, so refreshing the preview keeps the link.
  const finish = (groupId: string, before: Group | null, message: string) => {
    if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search)
    writeUndo(store.storage, { groupId, before, afterStamp: getLastStamp() })
    store.setUndoAvailable(true)
    toast({ message })
    navigate(`/g/${groupId}`)
  }

  const saveNew = () => {
    if (!incoming) return
    const g = { ...incoming }
    if (!act((d) => importAddGroup(d, g))) return
    finish(g.id, null, `Saved ${g.name} to this device.`)
  }

  const merge = () => {
    if (!incoming || !local || !plan) return
    if (!act((d) => importMergeGroup(d, local, incoming, plan.merged))) return
    finish(local.id, local, summary(plan.report))
  }

  const saveCopy = () => {
    if (!incoming) return
    let copy: Group
    try {
      copy = copyWithNewIds(incoming, newId)
    } catch {
      toast({ message: 'Couldn’t make a copy of this group.' })
      return
    }
    if (!act((d) => importAddGroup(d, copy))) return
    finish(copy.id, null, `Saved as a separate copy: ${copy.name}.`)
  }

  const openFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 2_000_000) {
      setDecoded({ ok: false, error: new DecodeError('too-long', 'This file is too big to open.') })
      return
    }
    setDecoded(decodeGroupFile(await file.text()))
  }

  const filePicker = (
    <div className="field">
      <label htmlFor={`${id}-file`}>Open a group file (.splitEasy.json)</label>
      <input id={`${id}-file`} type="file" accept=".json,application/json" onChange={(e) => void openFile(e.target.files?.[0])} />
    </div>
  )

  if (!decoded) {
    return (
      <>
        <h1>Import a group</h1>
        <div className="card">
          <p>Open a share link someone sent you, or pick a group file they downloaded from Split Easy.</p>
          {filePicker}
        </div>
      </>
    )
  }

  if (!decoded.ok) {
    return (
      <>
        <h1>That didn’t work</h1>
        <div className="card" role="alert">
          <p>{decoded.error.message}</p>
          <p className="hint">Nothing was changed on this device.</p>
          <div className="row wrap">
            <Link href="/" className="btn btn-primary">
              Go home
            </Link>
          </div>
        </div>
        <div className="card">{filePicker}</div>
      </>
    )
  }

  const g = decoded.group
  const counts = groupCounts(g)

  if (!local || !plan) {
    return (
      <>
        <h1>Join {g.name}</h1>
        <div className="card">
          <p>
            {g.emoji ? `${g.emoji} ` : ''}
            <strong>{g.name}</strong>: {pluralize(counts.people, 'person', 'people')}, {pluralize(counts.expenses, 'expense')}
            {counts.payments ? `, ${pluralize(counts.payments, 'payment')}` : ''}.
          </p>
          <p className="hint">It’s saved only on this device. You can merge later links from the group into it.</p>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={saveNew}>
              Save to this device
            </button>
            <Link href="/" className="btn">
              Cancel
            </Link>
          </div>
        </div>
      </>
    )
  }

  const r = plan.report
  const rows: Array<[string, ReportBucket]> = [
    ['new', r.added],
    ['updated by them', r.updated],
    ['removed by them', r.removed],
    ['kept that only you have', r.keptLocal],
    ['where your newer edit wins', r.localWins],
  ]
  return (
    <>
      <h1>Update {local.name}?</h1>
      <div className="card">
        <p>You already have this group. Here’s what merging this link would do. Nothing changes until you choose.</p>
        <ul className="list" aria-label="Merge preview">
          {rows.map(([label, b]) => (
            <li key={label} style={{ padding: 'var(--space-2) 0' }}>
              <strong className="amt">{b.count}</strong> {label}
              <Titles b={b} />
            </li>
          ))}
          {r.revived.count > 0 && (
            <li style={{ padding: 'var(--space-2) 0' }}>
              <strong>{r.revived.count}</strong> {r.revived.count === 1 ? 'person' : 'people'} brought back because an expense still includes them
              <Titles b={r.revived} />
            </li>
          )}
          {r.metaChanged && <li style={{ padding: 'var(--space-2) 0' }}>Group name or details updated</li>}
        </ul>
        <div className="row wrap" style={{ marginTop: 'var(--space-4)' }}>
          <button type="button" className="btn btn-primary" onClick={merge}>
            Merge
          </button>
          <button type="button" className="btn" onClick={saveCopy}>
            Save as a separate copy
          </button>
          <Link href="/" className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </div>
    </>
  )
}
