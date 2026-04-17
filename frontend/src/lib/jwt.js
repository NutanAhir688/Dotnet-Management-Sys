const ROLE_CLAIMS = [
  'role',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
]

const NAME_CLAIMS = [
  'name',
  'unique_name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
]

const ID_CLAIMS = [
  'sub',
  'nameid',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
]

function firstString(payload, keys) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim() !== '') {
      return value
    }
  }

  return null
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return atob(padded)
}

export function getTokenPayload(token) {
  if (!token || typeof token !== 'string') {
    return null
  }

  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const decoded = decodeBase64Url(parts[1])
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export function parseUserFromToken(token) {
  const payload = getTokenPayload(token)
  if (!payload) {
    return null
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : null
  if (exp && Date.now() >= exp * 1000) {
    return null
  }

  const role = firstString(payload, ROLE_CLAIMS)
  if (!role) {
    return null
  }

  const id = firstString(payload, ID_CLAIMS)
  const username = firstString(payload, NAME_CLAIMS) ?? 'User'
  const agencyRaw = payload.agency_id
  const agencyId =
    typeof agencyRaw === 'string' && agencyRaw.trim() !== '' ? agencyRaw : null

  return {
    id,
    username,
    role,
    agencyId,
    exp,
    payload,
  }
}

export function isTokenExpired(token) {
  const payload = getTokenPayload(token)
  if (!payload || typeof payload.exp !== 'number') {
    return true
  }

  return Date.now() >= payload.exp * 1000
}
