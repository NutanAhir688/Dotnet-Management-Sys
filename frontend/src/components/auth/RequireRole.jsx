import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export function RequireRole({ roles, children }) {
  const { isAuthenticated, hasAnyRole } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!hasAnyRole(roles)) {
    return <Navigate to="/access-denied" replace />
  }

  return children
}
