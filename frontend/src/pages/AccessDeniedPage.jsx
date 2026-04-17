import { Link } from 'react-router-dom'

export function AccessDeniedPage() {
  return (
    <section className="panel">
      <h1>Access Denied</h1>
      <p className="muted">Your account role does not have permission for this page.</p>
      <Link className="btn btn-primary" to="/">
        Go to Dashboard
      </Link>
    </section>
  )
}
