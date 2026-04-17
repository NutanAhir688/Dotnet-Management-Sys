export function getErrorMessage(error, fallback = 'Something went wrong.') {
  if (!error) {
    return fallback
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error.message === 'string' && error.message.trim() !== '') {
    return error.message
  }

  return fallback
}

export function formatFieldErrors(fieldErrors) {
  if (!fieldErrors || typeof fieldErrors !== 'object') {
    return []
  }

  const rows = []

  for (const [field, messages] of Object.entries(fieldErrors)) {
    const list = Array.isArray(messages) ? messages : [messages]
    for (const message of list) {
      rows.push(`${field}: ${message}`)
    }
  }

  return rows
}
