import { useEffect, useId, useState, type FormEvent } from 'react'
import { LIMITS, charLength, isOneGrapheme } from '../lib/validate'
import type { Group } from '../lib/types'
import { Dialog } from './Dialog'

export interface GroupSheetValues {
  name: string
  emoji: string
  currencySymbol: string
  people: string[]
}

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  group?: Group | undefined
  defaultCurrency: string
  onClose: () => void
  onSubmit: (v: GroupSheetValues) => void
  onDelete?: () => void
}

/** New group / edit group sheet: name + emoji + currency + people chips. */
export function GroupSheet({ open, mode, group, defaultCurrency, onClose, onSubmit, onDelete }: Props) {
  const id = useId()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [people, setPeople] = useState<string[]>([])
  const [personDraft, setPersonDraft] = useState('')
  const [tried, setTried] = useState(false)
  const [currencyConfirm, setCurrencyConfirm] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(group?.name ?? '')
    setEmoji(group?.emoji ?? '')
    setCurrency(group?.currencySymbol ?? defaultCurrency)
    setPeople([])
    setPersonDraft('')
    setTried(false)
    setCurrencyConfirm(false)
  }, [open, group, defaultCurrency])

  const trimmed = name.trim()
  const nameErr = trimmed.length === 0 ? 'Give the group a name.' : charLength(trimmed) > LIMITS.groupName ? `Keep it under ${LIMITS.groupName} characters.` : null
  const emojiErr = emoji.trim() !== '' && !isOneGrapheme(emoji.trim()) ? 'Just one emoji, please.' : null
  const currencyErr = charLength(currency.trim()) > LIMITS.currency ? 'Up to 3 characters, like $, €, or CHF.' : null
  const draftName = personDraft.trim()
  const allPeople = draftName ? [...people, draftName] : people
  const peopleErr = mode === 'create' && allPeople.length === 0 ? 'Add at least one person.' : null
  const dupErr = new Set(allPeople.map((p) => p.toLowerCase())).size !== allPeople.length ? 'Two people have the same name. Add an initial to tell them apart.' : null
  const invalid = !!(nameErr || emojiErr || currencyErr || peopleErr || dupErr)

  const addPerson = () => {
    if (!draftName) return
    if (charLength(draftName) > LIMITS.personName) return
    setPeople((p) => [...p, draftName])
    setPersonDraft('')
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (invalid) return
    if (mode === 'edit' && group && currency.trim() !== group.currencySymbol && !currencyConfirm) {
      setCurrencyConfirm(true)
      return
    }
    onSubmit({ name: trimmed, emoji: emoji.trim(), currencySymbol: currency.trim(), people: allPeople })
  }

  return (
    <Dialog
      open={open}
      title={mode === 'create' ? 'Start a group' : 'Edit group'}
      onClose={onClose}
      actions={
        <>
          {mode === 'edit' && onDelete && (
            <button type="button" className="btn btn-danger" onClick={onDelete} style={{ marginRight: 'auto' }}>
              Delete group
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={`${id}-form`} className="btn btn-primary">
            {currencyConfirm ? 'Yes, change symbol' : mode === 'create' ? 'Create group' : 'Save'}
          </button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${id}-name`}>Group name</label>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={LIMITS.groupName}
            placeholder="Lake trip, Maple St house…"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={(tried && !!nameErr) || undefined}
            aria-describedby={tried && nameErr ? `${id}-name-err` : undefined}
            autoComplete="off"
          />
          {tried && nameErr && (
            <span id={`${id}-name-err`} className="error">
              {nameErr}
            </span>
          )}
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${id}-emoji`}>Emoji (optional)</label>
            <input
              id={`${id}-emoji`}
              value={emoji}
              placeholder="🏕️"
              onChange={(e) => setEmoji(e.target.value)}
              aria-invalid={!!emojiErr || undefined}
              aria-describedby={emojiErr ? `${id}-emoji-err` : undefined}
              autoComplete="off"
            />
            {emojiErr && (
              <span id={`${id}-emoji-err`} className="error">
                {emojiErr}
              </span>
            )}
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${id}-cur`}>Currency symbol</label>
            <input
              id={`${id}-cur`}
              value={currency}
              maxLength={3}
              onChange={(e) => {
                setCurrency(e.target.value)
                setCurrencyConfirm(false)
              }}
              aria-invalid={!!currencyErr || undefined}
              aria-describedby={`${id}-cur-hint`}
              autoComplete="off"
            />
            <span id={`${id}-cur-hint`} className={currencyErr ? 'error' : 'hint'}>
              {currencyErr ?? 'Display only. No conversion.'}
            </span>
          </div>
        </div>
        {currencyConfirm && (
          <p className="remainder" role="alert">
            This only changes the symbol. Amounts stay the same numbers and are not converted.
          </p>
        )}

        {mode === 'create' && (
          <div className="field">
            <label htmlFor={`${id}-person`}>People</label>
            {people.length > 0 && (
              <ul className="chips" aria-label="People in this group">
                {people.map((p, i) => (
                  <li key={`${p}-${i}`} className="chip">
                    {p}
                    <button type="button" aria-label={`Remove ${p}`} onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              <input
                id={`${id}-person`}
                value={personDraft}
                maxLength={LIMITS.personName}
                placeholder="Type a name, press Enter"
                onChange={(e) => setPersonDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addPerson()
                  }
                }}
                aria-describedby={`${id}-people-hint`}
                autoComplete="off"
                enterKeyHint="enter"
              />
              <button type="button" className="btn" onClick={addPerson} disabled={!draftName}>
                Add
              </button>
            </div>
            <span id={`${id}-people-hint`} className={tried && (peopleErr || dupErr) ? 'error' : 'hint'}>
              {tried && (peopleErr || dupErr) ? (peopleErr ?? dupErr) : 'Include yourself. You can add more people later.'}
            </span>
          </div>
        )}
      </form>
    </Dialog>
  )
}
