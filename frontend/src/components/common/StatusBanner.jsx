export function StatusBanner({ variant = 'info', message }) {
  if (!message) {
    return null
  }

  return <div className={`alert alert-${variant}`}>{message}</div>
}
