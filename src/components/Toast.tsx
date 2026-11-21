import { useSyncExternalStore } from 'react'
import { useStore } from '../state/app'
import { dismissToast, getToast, subscribeToast } from './toastBus'

/** Polite live region for toasts. Always mounted so screen readers announce changes. */
export function Toast() {
  const t = useSyncExternalStore(subscribeToast, getToast)
  useStore() // re-render on store changes so isDisabled() (Undo expiry) stays current
  const disabled = t?.action?.isDisabled?.() ?? false
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
      {t && (
        <div className="toast" key={t.id}>
          <p>{t.message}</p>
          {t.action && (
            <button
              type="button"
              className="btn"
              disabled={disabled}
              onClick={() => {
                t.action?.onClick()
                dismissToast()
              }}
            >
              {disabled ? `${t.action.label} expired` : t.action.label}
            </button>
          )}
          <button type="button" className="btn icon-btn" aria-label="Dismiss" onClick={dismissToast}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
