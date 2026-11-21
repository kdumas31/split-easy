import { useEffect, useState } from 'react'

/**
 * Registers the service worker (production builds only) and shows a polite banner when a
 * new build is waiting. Never auto-reloads, so nobody loses an expense mid-typing.
 */
export function UpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [update, setUpdate] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let cancelled = false
    void import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return
      const updateSW = registerSW({
        onNeedRefresh() {
          setNeedRefresh(true)
        },
      })
      setUpdate(() => updateSW)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!needRefresh) return null
  return (
    <div className="banner" role="status">
      <p>A fresh version of Split Easy is ready.</p>
      <button type="button" className="btn btn-primary btn-small" onClick={() => void update?.(true)}>
        Refresh
      </button>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  )
}
