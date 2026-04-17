import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="panel">
      <h1>Page Not Found</h1>
      <p className="muted">The route you requested does not exist.</p>
      <Link className="btn btn-primary" to="/">
        Return Home
      </Link>
    </section>
  )
}
