import { useLocation } from 'wouter'
import { applyUndo, clearUndo, readUndo } from '../lib/storage'
import { act, store, useStore } from '../state/app'
import { toast } from './toastBus'

export function undoLastImport(navigate: (to: string) => void): void {
  const rec = readUndo(store.storage)
  if (!rec) {
    store.setUndoAvailable(false)
    toast({ message: 'Undo has expired.' })
    return
  }
  if (act((d) => ({ ...d, groups: applyUndo(d.groups, rec) }))) {
    clearUndo(store.storage)
    store.setUndoAvailable(false)
    toast({ message: rec.before ? 'Undone. The group is back the way it was.' : 'Undone. The group was removed from this device.' })
    navigate(rec.before ? `/g/${rec.groupId}` : '/')
  }
}

/** Stays on screen for as long as the last import can still be undone (until the next edit or import). */
export function UndoImportBanner() {
  const { undoAvailable, readOnly } = useStore()
  const [, navigate] = useLocation()
  if (!undoAvailable || readOnly) return null
  return (
    <div className="banner">
      <p>Group imported. Changed your mind? You can undo it until you make your next change.</p>
      <button type="button" className="btn btn-small" onClick={() => undoLastImport(navigate)}>
        Undo import
      </button>
    </div>
  )
}
