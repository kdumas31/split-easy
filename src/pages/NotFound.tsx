import { Link } from 'wouter'
import { useTitle } from './common'

export function NotFound() {
  useTitle('Not found')
  return (
    <div className="empty">
      <div className="art" aria-hidden="true">
        🧭
      </div>
      <h1>Nothing here</h1>
      <p>That page doesn’t exist. Maybe the link was cut short?</p>
      <Link href="/" className="btn btn-primary">
        Go home
      </Link>
    </div>
  )
}
