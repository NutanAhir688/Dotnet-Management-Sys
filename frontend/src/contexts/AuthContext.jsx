import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { TOKEN_STORAGE_KEY } from '../lib/config'
import { isTokenExpired, parseUserFromToken } from '../lib/jwt'
import { authApi } from '../services/api'

export const AuthContext = createContext(null)

function getInitialToken() {
  const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (!storedToken || isTokenExpired(storedToken)) {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    return ''
  }

  return storedToken
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getInitialToken)
  const [user, setUser] = useState(() => parseUserFromToken(getInitialToken()))

  useEffect(() => {
    if (!token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      setUser(null)
      return
    }

    if (isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      setToken('')
      setUser(null)
      return
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    setUser(parseUserFromToken(token))
  }, [token])

  const login = useCallback(async (credentials) => {
    const response = await authApi.login(credentials)
    setToken(response.token)
    return response
  }, [])

  const logout = useCallback(() => {
    setToken('')
    setUser(null)
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }, [])

  const hasRole = useCallback(
    (role) => {
      if (!user) {
        return false
      }

      return user.role === role
    },
    [user]
  )

  const hasAnyRole = useCallback(
    (roles) => {
      if (!user || !Array.isArray(roles)) {
        return false
      }

      return roles.includes(user.role)
    },
    [user]
  )

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      setToken,
      hasRole,
      hasAnyRole,
    }),
    [token, user, login, logout, hasRole, hasAnyRole]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
