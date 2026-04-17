import { API_BASE_URL } from './config'

const STATUS_MESSAGES = {
  400: 'Bad request. Please review your input.',
  401: 'Session expired or unauthorized. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'Requested resource was not found.',
  409: 'Conflict detected. Data may already exist.',
  429: 'Too many requests. Please wait and try again.',
  500: 'Server error. Please try again later.',
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
    this.fieldErrors = extractFieldErrors(data)
  }
}

function extractFieldErrors(data) {
  if (!data || typeof data !== 'object' || !data.errors) {
    return null
  }

  const result = {}

  for (const [field, messages] of Object.entries(data.errors)) {
    result[field] = Array.isArray(messages) ? messages : [String(messages)]
  }

  return result
}

function buildQueryString(query) {
  if (!query) {
    return ''
  }

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item))
      }
      continue
    }

    params.append(key, String(value))
  }

  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

function getMessageFromPayload(payload, status) {
  if (typeof payload === 'string' && payload.trim() !== '') {
    return payload
  }

  if (payload && typeof payload === 'object') {
    if (typeof payload.error === 'string' && payload.error.trim() !== '') {
      return payload.error
    }

    if (typeof payload.message === 'string' && payload.message.trim() !== '') {
      return payload.message
    }

    if (typeof payload.title === 'string' && payload.title.trim() !== '') {
      return payload.title
    }

    if (typeof payload.detail === 'string' && payload.detail.trim() !== '') {
      return payload.detail
    }
  }

  return STATUS_MESSAGES[status] ?? 'Request failed.'
}

async function parseResponseBody(response, responseType) {
  if (response.status === 204) {
    return null
  }

  if (responseType === 'blob') {
    return response.blob()
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (responseType === 'text') {
    return response.text()
  }

  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function parseErrorBody(response) {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  try {
    const text = await response.text()
    return text || null
  } catch {
    return null
  }
}

export async function request(path, options = {}) {
  const {
    method = 'GET',
    token,
    query,
    body,
    headers = {},
    responseType = 'json',
    includeHeaders = false,
  } = options

  const url = `${API_BASE_URL}${path}${buildQueryString(query)}`
  const finalHeaders = {
    ...headers,
  }

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`
  }

  let payload = body
  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/json'
    payload = JSON.stringify(body)
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: payload,
  })

  if (!response.ok) {
    const errorPayload = await parseErrorBody(response)
    throw new ApiError(
      getMessageFromPayload(errorPayload, response.status),
      response.status,
      errorPayload
    )
  }

  const data = await parseResponseBody(response, responseType)

  if (includeHeaders) {
    return {
      data,
      headers: response.headers,
      status: response.status,
    }
  }

  return data
}
