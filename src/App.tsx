import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, Route, Switch, useLocation } from 'wouter'
import { Toast } from './components/Toast'
import { UndoImportBanner } from './components/UndoImportBanner'
import { UpdateBanner } from './components/UpdateBanner'
import { Wordmark } from './components/Wordmark'
import { KEY_THEME } from './lib/storage'
import type { Theme } from './lib/types'
import { ExpenseEditor } from './pages/ExpenseEditor'
import { GroupPage } from './pages/Group'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { People } from './pages/People'
import { SettleUp } from './pages/SettleUp'
import { store, useStore } from './state/app'

// Less-used pages load on demand (the service worker still precaches them for offline use).
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))
const ImportPage = lazy(() => import('./pages/Import').then((m) => ({ default: m.ImportPage })))
const PrintSummary = lazy(() => import('./pages/PrintSummary').then((m) => ({ default: m.PrintSummary })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))
const SharePage = lazy(() => import('./pages/Share').then((m) => ({ default: m.SharePage })))

const THEME_COLORS = { light: '#FBF5EC', dark: '#1C1410' }

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light)
}

function ThemeSync() {
  const theme = useStore().doc.settings.theme
  useEffect(() => {
    applyTheme(theme)
    try {
      if (!store.getState().readOnly) localStorage.setItem(KEY_THEME, theme)
    } catch {
      /* storage unavailable */
    }
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])
  return null
}

/** Move focus to the page's h1 after client-side navigation (not on first load). */
function useRouteFocus() {
  const [location] = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const id = requestAnimationFrame(() => {
      const h1 = document.querySelector<HTMLElement>('main h1')
      if (h1) {
        if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
        h1.focus({ preventScroll: false })
      }
      window.scrollTo({ top: 0 })
    })
    return () => cancelAnimationFrame(id)
  }, [location])
}

function Banners() {
  const { readOnly, loadNotice, corruptKey } = useStore()
  const [otherTab, setOtherTab] = useState(false)
  useEffect(() => {
    const on = () => setOtherTab(true)
    window.addEventListener('split-easy:other-tab', on)
    return () => window.removeEventListener('split-easy:other-tab', on)
  }, [])

  const downloadCorrupt = () => {
    if (!corruptKey) return
    const raw = localStorage.getItem(corruptKey) ?? ''
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    a.download = 'split-easy-unreadable-data.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div aria-live="polite">
      {readOnly && (
        <div className="banner" role="alert">
          <p>This device has data from a newer Split Easy. You can look, but changes are paused until you refresh to update.</p>
          <button type="button" className="btn btn-primary btn-small" onClick={() => location.reload()}>
            Refresh
          </button>
        </div>
      )}
      {loadNotice === 'corrupt' && (
        <div className="banner" role="alert">
          <p>We couldn’t read the saved data on this device, so Split Easy started fresh. Your old data was kept aside, not deleted.</p>
          <button type="button" className="btn btn-small" onClick={downloadCorrupt}>
            Download it
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => store.dismissLoadNotice()}>
            Dismiss
          </button>
        </div>
      )}
      {otherTab && (
        <div className="banner">
          <p>Updated in another tab. You’re seeing the latest saved version.</p>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setOtherTab(false)}>
            OK
          </button>
        </div>
      )}
      <UndoImportBanner />
      <UpdateBanner />
    </div>
  )
}

export default function App() {
  useRouteFocus()
  return (
    <>
      <ThemeSync />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <Link href="/" className="wordmark-link">
          <Wordmark />
        </Link>
        <nav aria-label="App">
          <Link href="/settings" className="btn btn-ghost btn-small">
            Settings
          </Link>
          <Link href="/about" className="btn btn-ghost btn-small">
            About
          </Link>
        </nav>
      </header>
      <Banners />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<p className="muted">Loading…</p>}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/g/:gid" component={GroupPage} />
          <Route path="/g/:gid/people" component={People} />
          <Route path="/g/:gid/expense/new" component={ExpenseEditor} />
          <Route path="/g/:gid/expense/:eid" component={ExpenseEditor} />
          <Route path="/g/:gid/settle" component={SettleUp} />
          <Route path="/g/:gid/share" component={SharePage} />
          <Route path="/g/:gid/print" component={PrintSummary} />
          <Route path="/import" component={ImportPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/about" component={About} />
          <Route component={NotFound} />
        </Switch>
        </Suspense>
      </main>
      <footer className="app-footer">
        <p>
          Split Easy · <em>Fair shares, no fuss.</em> · Your data stays on this device.
        </p>
      </footer>
      <Toast />
    </>
  )
}
