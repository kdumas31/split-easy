import { useId, useState } from 'react'
import { useLocation } from 'wouter'
import { Dialog } from '../components/Dialog'
import { toast } from '../components/toastBus'
import { emptyDoc, KEY_DATA, KEY_THEME, KEY_UNDO } from '../lib/storage'
import type { Theme } from '../lib/types'
import { LIMITS, charLength } from '../lib/validate'
import { act, store, useStore } from '../state/app'
import { updateSettings } from '../state/actions'
import { useTitle } from './common'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function SettingsPage() {
  useTitle('Settings')
  const id = useId()
  const { doc, readOnly } = useStore()
  const [, navigate] = useLocation()
  const [currency, setCurrency] = useState(doc.settings.defaultCurrencySymbol)
  const [erase, setErase] = useState(false)
  const [typed, setTyped] = useState('')
  const curErr = charLength(currency.trim()) > LIMITS.currency ? 'Up to 3 characters.' : null

  const eraseAll = () => {
    // Read-only (newer data on this device): act shows the warning and nothing may be removed.
    if (!act(() => emptyDoc())) return
    store.flush()
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('split-easy:') && k !== KEY_DATA) localStorage.removeItem(k)
      localStorage.removeItem(KEY_UNDO)
      localStorage.removeItem(KEY_THEME)
    } catch {
      /* ignore */
    }
    setErase(false)
    setTyped('')
    navigate('/')
    toast({ message: 'Everything on this device was erased.' })
  }

  return (
    <>
      <h1>Settings</h1>
      <section className="card" aria-labelledby={`${id}-ap`}>
        <h2 id={`${id}-ap`}>Appearance</h2>
        <div className="seg" role="radiogroup" aria-labelledby={`${id}-ap`}>
          {THEMES.map((t) => (
            <label key={t.value}>
              <input type="radio" name={`${id}-theme`} value={t.value} checked={doc.settings.theme === t.value} onChange={() => act((d) => updateSettings(d, { theme: t.value }))} />
              {t.label}
            </label>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby={`${id}-cur-h`}>
        <h2 id={`${id}-cur-h`}>Default currency symbol</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (curErr) return
            if (act((d) => updateSettings(d, { defaultCurrencySymbol: currency.trim() }))) toast({ message: 'Saved. New groups will use it.' })
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-cur`}>Symbol for new groups</label>
            <div className="row">
              <input id={`${id}-cur`} value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} aria-describedby={`${id}-cur-hint`} style={{ maxWidth: '8rem' }} />
              <button type="submit" className="btn" disabled={!!curErr || currency.trim() === doc.settings.defaultCurrencySymbol}>
                Save
              </button>
            </div>
            <span id={`${id}-cur-hint`} className={curErr ? 'error' : 'hint'}>
              {curErr ?? 'Only for new groups. Display only: nothing is converted.'}
            </span>
          </div>
        </form>
      </section>

      <section className="card" aria-labelledby={`${id}-data`}>
        <h2 id={`${id}-data`}>Your data</h2>
        <p>Everything lives in this browser on this device. There’s no account and no server. To back up a group or move it to another phone, use its Share page.</p>
        <button type="button" className="btn btn-danger" disabled={readOnly} onClick={() => setErase(true)}>
          Erase all data on this device
        </button>
        {readOnly && <p className="hint">Erasing is paused until you refresh to the newer version of Split Easy.</p>}
      </section>

      <p className="muted">Split Easy version {__APP_VERSION__}</p>

      <Dialog
        open={erase}
        title="Erase everything?"
        onClose={() => {
          setErase(false)
          setTyped('')
        }}
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setErase(false)
                setTyped('')
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-danger" disabled={readOnly || typed.trim().toUpperCase() !== 'ERASE'} onClick={eraseAll}>
              Erase all data
            </button>
          </>
        }
      >
        <p>This deletes every group, expense, and payment on this device. It can’t be undone. Shared copies on other phones are not affected.</p>
        <div className="field">
          <label htmlFor={`${id}-confirm`}>Type ERASE to confirm</label>
          <input id={`${id}-confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      </Dialog>
    </>
  )
}
