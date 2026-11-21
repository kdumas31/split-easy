import { useId, useMemo, useState, type FormEvent } from 'react'
import { useLocation } from 'wouter'
import { AmountInput, amountError, prettyAmount } from '../components/AmountInput'
import { categoryOptions } from '../components/categories'
import { useConfirm } from '../components/Dialog'
import { SplitEditor } from '../components/SplitEditor'
import { draftFromSplit, evaluateDraft, type SplitDraft } from '../components/splitDraft'
import { toast } from '../components/toastBus'
import { isValidDate, todayLocal } from '../lib/dates'
import { newId } from '../lib/ids'
import { parseCents, plainCents } from '../lib/money'
import { LIMITS, charLength } from '../lib/validate'
import { isTomb, livePeople, type Category, type Expense, type Group } from '../lib/types'
import { act, actWith, useGroup } from '../state/app'
import { deleteExpense, saveExpense } from '../state/actions'
import { useMissingRedirect, useTitle } from './common'

export function ExpenseEditor({ params }: { params: { gid: string; eid?: string } }) {
  const group = useGroup(params.gid)
  const existing = useMemo(() => {
    if (!group || !params.eid) return undefined
    const e = group.expenses.find((x) => x.id === params.eid)
    return e && !isTomb(e) ? e : undefined
  }, [group, params.eid])
  const missing = !group || (params.eid !== undefined && !existing)
  useMissingRedirect(missing, params.eid && group ? 'That expense was deleted.' : 'That group isn’t on this device anymore.')
  useTitle(existing ? `Edit ${existing.title}` : 'Add expense')
  if (missing || !group) return null
  return <EditorForm key={existing?.id ?? 'new'} group={group} existing={existing} />
}

function EditorForm({ group, existing }: { group: Group; existing: Expense | undefined }) {
  const id = useId()
  const [, navigate] = useLocation()
  const [confirmEl, confirm] = useConfirm()
  // Everyone live, plus anyone the existing expense still refers to.
  const people = useMemo(() => livePeople(group), [group])
  const sym = group.currencySymbol
  // One real id for the whole form: the preview and the saved expense hash the same id,
  // so the extra cent never moves after Save.
  const [draftId] = useState(() => existing?.id ?? newId())

  const [title, setTitle] = useState(existing?.title ?? '')
  const [amount, setAmount] = useState(existing ? prettyAmount(plainCents(existing.amountCents)) : '')
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? people[0]?.id ?? '')
  const [date, setDate] = useState(existing?.date ?? todayLocal())
  const [category, setCategory] = useState<Category | ''>(existing?.category ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [draft, setDraft] = useState<SplitDraft>(() => draftFromSplit(existing?.split ?? null, people))
  const [tried, setTried] = useState(false)

  const total = parseCents(amount)
  const totalOk = amountError(amount) === null ? total : null
  const result = evaluateDraft(draft, totalOk, people, draftId, sym)

  const errors = {
    title: title.trim() === '' ? 'Give it a short name, like “Groceries”.' : charLength(title.trim()) > LIMITS.title ? `Keep it under ${LIMITS.title} characters.` : null,
    amount: amountError(amount),
    paidBy: paidBy && people.some((p) => p.id === paidBy) ? null : 'Pick who paid.',
    date: isValidDate(date) ? null : 'Pick a date.',
    note: charLength(note.trim()) > LIMITS.note ? `Keep notes under ${LIMITS.note} characters.` : null,
  }
  const firstError = Object.values(errors).find((e) => e !== null) ?? (result.ok ? null : result.message)
  const canSave = firstError === null

  const save = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!canSave || !result.ok || totalOk === null) return
    const saved = actWith((d) =>
      saveExpense(d, group.id, draftId, {
        title,
        amountCents: totalOk,
        paidBy,
        split: result.split,
        category: category || undefined,
        note,
        date,
      }),
    )
    if (saved) {
      toast({ message: existing ? 'Expense updated.' : 'Expense added.' })
      navigate(`/g/${group.id}`)
    }
  }

  const remove = async () => {
    if (!existing) return
    const ok = await confirm({ title: `Delete “${existing.title}”?`, body: 'Balances will be recalculated without it.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    if (!act((d) => deleteExpense(d, group.id, existing.id))) return
    navigate(`/g/${group.id}`)
    toast({ message: 'Expense deleted.' })
  }

  const err = (k: keyof typeof errors) => (tried || k === 'amount' ? errors[k] : null)

  return (
    <>
      <p className="muted" style={{ marginBottom: 'var(--space-1)' }}>
        {group.emoji ? `${group.emoji} ` : ''}
        {group.name}
      </p>
      <h1>{existing ? 'Edit expense' : 'Add expense'}</h1>
      <form onSubmit={save} noValidate className="card">
        <div className="field">
          <label htmlFor={`${id}-title`}>What was it?</label>
          <input
            id={`${id}-title`}
            value={title}
            maxLength={LIMITS.title}
            placeholder="Groceries, gas, dinner…"
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!err('title') || undefined}
            aria-describedby={err('title') ? `${id}-title-err` : undefined}
            autoComplete="off"
          />
          {err('title') && (
            <span id={`${id}-title-err`} className="error">
              {err('title')}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor={`${id}-amount`}>Amount</label>
          <AmountInput
            id={`${id}-amount`}
            className="amount-input"
            value={amount}
            onChange={setAmount}
            symbol={sym}
            required
            invalid={amount !== '' && !!errors.amount}
            describedBy={amount !== '' && errors.amount ? `${id}-amount-err` : undefined}
          />
          {(amount !== '' || tried) && errors.amount && (
            <span id={`${id}-amount-err`} className="error">
              {errors.amount}
            </span>
          )}
        </div>

        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label htmlFor={`${id}-paid`}>Paid by</label>
            <select id={`${id}-paid`} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 160px' }}>
            <label htmlFor={`${id}-date`}>Date</label>
            <input
              id={`${id}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!err('date') || undefined}
              aria-describedby={err('date') ? `${id}-date-err` : undefined}
            />
            {err('date') && (
              <span id={`${id}-date-err`} className="error">
                {err('date')}
              </span>
            )}
          </div>
        </div>

        <SplitEditor people={people} draft={draft} onChange={setDraft} result={result} total={totalOk} symbol={sym} resultId={`${id}-split-result`} />

        <div className="field">
          <label htmlFor={`${id}-cat`}>Category</label>
          <select id={`${id}-cat`} value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
            <option value="">No category</option>
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${id}-note`}>Note (optional)</label>
          <textarea
            id={`${id}-note`}
            value={note}
            maxLength={LIMITS.note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={!!errors.note || undefined}
            aria-describedby={`${id}-note-hint`}
          />
          <span id={`${id}-note-hint`} className={errors.note ? 'error' : 'hint'}>
            {errors.note ?? `${charLength(note.trim())}/${LIMITS.note}`}
          </span>
        </div>

        <div className="row wrap">
          <button type="submit" className="btn btn-primary" aria-disabled={!canSave} disabled={!canSave} aria-describedby={`${id}-save-reason`}>
            {existing ? 'Save changes' : 'Save expense'}
          </button>
          <button type="button" className="btn" onClick={() => navigate(`/g/${group.id}`)}>
            Cancel
          </button>
          <span className="spacer" />
          {existing && (
            <button type="button" className="btn btn-danger" onClick={() => void remove()}>
              Delete
            </button>
          )}
        </div>
        <p id={`${id}-save-reason`} className="hint" aria-live="polite" style={{ marginTop: 'var(--space-2)' }}>
          {canSave ? '' : `Can’t save yet: ${firstError}`}
        </p>
      </form>
      {confirmEl}
    </>
  )
}
