import { useId, useState, type FormEvent } from 'react'
import { Dialog } from '../components/Dialog'
import { toast } from '../components/toastBus'
import { livePeople, type Person } from '../lib/types'
import { LIMITS, charLength } from '../lib/validate'
import { act, useGroup } from '../state/app'
import { addPerson, personRefCount, removePerson, renamePerson } from '../state/actions'
import { GroupChrome, pluralize, useMissingRedirect, useTitle } from './common'

export function People({ params }: { params: { gid: string } }) {
  const group = useGroup(params.gid)
  const id = useId()
  const [name, setName] = useState('')
  const [tried, setTried] = useState(false)
  const [renaming, setRenaming] = useState<Person | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [blocked, setBlocked] = useState<{ p: Person; n: number } | null>(null)
  useTitle(group ? `People · ${group.name}` : '')
  useMissingRedirect(!group, 'That group isn’t on this device anymore.')
  if (!group) return null

  const people = livePeople(group)
  const validate = (v: string, except?: string) => {
    const t = v.trim()
    if (!t) return 'Type a name.'
    if (charLength(t) > LIMITS.personName) return `Keep it under ${LIMITS.personName} characters.`
    if (people.some((p) => p.id !== except && p.name.toLowerCase() === t.toLowerCase())) return 'Someone already has that name. Add an initial to tell them apart.'
    return null
  }
  const addErr = validate(name)
  const renameErr = renaming ? validate(renameValue, renaming.id) : null

  const add = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (addErr) return
    if (act((d) => addPerson(d, group.id, name))) {
      toast({ message: `${name.trim()} added.` })
      setName('')
      setTried(false)
    }
  }

  const remove = (p: Person) => {
    const n = personRefCount(group, p.id)
    if (n > 0) return setBlocked({ p, n })
    if (act((d) => removePerson(d, group.id, p.id))) toast({ message: `${p.name} removed.` })
  }

  return (
    <GroupChrome group={group} title="People">
      <div className="card">
        <ul className="list" aria-label="People in this group">
          {people.map((p) => (
            <li key={p.id} className="list-row">
              <span className="grow title">{p.name}</span>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                aria-label={`Rename ${p.name}`}
                onClick={() => {
                  setRenaming(p)
                  setRenameValue(p.name)
                }}
              >
                Rename
              </button>
              <button type="button" className="btn btn-ghost btn-small" aria-label={`Remove ${p.name}`} onClick={() => remove(p)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={add} noValidate className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`${id}-add`}>Add a person</label>
          <div className="row">
            <input
              id={`${id}-add`}
              value={name}
              maxLength={LIMITS.personName}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={(tried && !!addErr) || undefined}
              aria-describedby={tried && addErr ? `${id}-add-err` : undefined}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </div>
          {tried && addErr && (
            <span id={`${id}-add-err`} className="error">
              {addErr}
            </span>
          )}
        </div>
      </form>

      <Dialog
        open={renaming !== null}
        title={`Rename ${renaming?.name ?? ''}`}
        onClose={() => setRenaming(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button
              type="submit"
              form={`${id}-rename-form`}
              className="btn btn-primary"
              disabled={!!renameErr}
            >
              Save
            </button>
          </>
        }
      >
        <form
          id={`${id}-rename-form`}
          onSubmit={(e) => {
            e.preventDefault()
            if (renaming && !renameErr) act((d) => renamePerson(d, group.id, renaming.id, renameValue))
            setRenaming(null)
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-rn`}>Name</label>
            <input id={`${id}-rn`} value={renameValue} maxLength={LIMITS.personName} onChange={(e) => setRenameValue(e.target.value)} aria-describedby={`${id}-rn-err`} />
            <span id={`${id}-rn-err`} className="error">
              {renameErr ?? ''}
            </span>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={blocked !== null}
        title={`Can’t remove ${blocked?.p.name ?? ''} yet`}
        onClose={() => setBlocked(null)}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setBlocked(null)}>
            OK
          </button>
        }
      >
        <p>
          {blocked?.p.name} is in {pluralize(blocked?.n ?? 0, 'expense or payment', 'expenses or payments')}. Take them out of those first. Renaming is always fine.
        </p>
      </Dialog>
    </GroupChrome>
  )
}
