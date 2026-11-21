import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  actions: ReactNode
}

/** Native <dialog> with showModal(): focus trap, Esc to close, inert background. */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="dialog-actions">{actions}</div>
    </dialog>
  )
}

interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
}

/** Promise-based confirm built on <Dialog>. Render `element` once in the page. */
export function useConfirm(): [ReactNode, (opts: ConfirmOptions) => Promise<boolean>] {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve })
      }),
    [],
  )
  const done = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const element = (
    <Dialog
      open={state !== null}
      title={state?.title ?? ''}
      onClose={() => done(false)}
      actions={
        <>
          <button type="button" className="btn" onClick={() => done(false)}>
            {state?.cancelLabel ?? 'Cancel'}
          </button>
          <button type="button" className={state?.danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => done(true)}>
            {state?.confirmLabel}
          </button>
        </>
      }
    >
      {typeof state?.body === 'string' ? <p>{state.body}</p> : state?.body}
    </Dialog>
  )
  return [element, confirm]
}
