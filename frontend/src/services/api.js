import { request } from '../lib/http'

function parseFilenameFromDisposition(contentDisposition, fallback) {
  if (!contentDisposition || typeof contentDisposition !== 'string') {
    return fallback
  }

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ''))
    } catch {
      return utf8Match[1].replace(/^"|"$/g, '')
    }
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*("?)([^";]+)\1/i)
  if (plainMatch?.[2]) {
    return plainMatch[2]
  }

  return fallback
}

export const authApi = {
  login(credentials) {
    return request('/auth/login', {
      method: 'POST',
      body: credentials,
    })
  },
  register(token, payload) {
    return request('/auth/register', {
      method: 'POST',
      token,
      body: payload,
    })
  },
}

export const profileApi = {
  get(token) {
    return request('/profile', { token })
  },
  update(token, payload) {
    return request('/profile', {
      method: 'PUT',
      token,
      body: payload,
    })
  },
}

export const agenciesApi = {
  list(token) {
    return request('/agencies', { token })
  },
  discover(token) {
    return request('/agencies/discover', { token })
  },
  getById(token, id) {
    return request(`/agencies/${id}`, { token })
  },
  create(token, payload) {
    return request('/agencies', {
      method: 'POST',
      token,
      body: payload,
    })
  },
  update(token, id, payload) {
    return request(`/agencies/${id}`, {
      method: 'PUT',
      token,
      body: payload,
    })
  },
  remove(token, id) {
    return request(`/agencies/${id}`, {
      method: 'DELETE',
      token,
    })
  },
  attach(token, agencyId) {
    return request(`/agencies/attach/${agencyId}`, {
      method: 'POST',
      token,
    })
  },
  detach(token, agencyId) {
    return request(`/agencies/detach/${agencyId}`, {
      method: 'DELETE',
      token,
    })
  },
}

export const productsApi = {
  list(token, query) {
    return request('/products', { token, query })
  },
  getById(token, id) {
    return request(`/products/${id}`, { token })
  },
  create(token, payload) {
    return request('/products', {
      method: 'POST',
      token,
      body: payload,
    })
  },
  update(token, id, payload) {
    return request(`/products/${id}`, {
      method: 'PUT',
      token,
      body: payload,
    })
  },
  remove(token, id) {
    return request(`/products/${id}`, {
      method: 'DELETE',
      token,
    })
  },
}

export const customersApi = {
  list(token, query) {
    return request('/customers', { token, query })
  },
  getById(token, id) {
    return request(`/customers/${id}`, { token })
  },
  create(token, payload) {
    return request('/customers', {
      method: 'POST',
      token,
      body: payload,
    })
  },
  update(token, id, payload) {
    return request(`/customers/${id}`, {
      method: 'PUT',
      token,
      body: payload,
    })
  },
  remove(token, id) {
    return request(`/customers/${id}`, {
      method: 'DELETE',
      token,
    })
  },
}

export const ordersApi = {
  list(token, query) {
    return request('/orders', { token, query })
  },
  getById(token, id) {
    return request(`/orders/${id}`, { token })
  },
  createSale(token, payload) {
    return request('/orders/sale', {
      method: 'POST',
      token,
      body: payload,
    })
  },
  createRestock(token, payload) {
    return request('/orders/restock', {
      method: 'POST',
      token,
      body: payload,
    })
  },
  updateStatus(token, id, payload) {
    return request(`/orders/${id}/status`, {
      method: 'PUT',
      token,
      body: payload,
    })
  },
}

export const billsApi = {
  list(token, query) {
    return request('/bills', { token, query })
  },
  getById(token, id) {
    return request(`/bills/${id}`, { token })
  },
  generate(token, payload) {
    return request('/bills', {
      method: 'POST',
      token,
      body: payload,
    })
  },
  updateStatus(token, id, payload) {
    return request(`/bills/${id}/status`, {
      method: 'PUT',
      token,
      body: payload,
    })
  },
  recordPayment(token, id, payload) {
    return request(`/bills/${id}/payment`, {
      method: 'PUT',
      token,
      body: payload,
    })
  },
  async download(token, id) {
    const response = await request(`/bills/${id}/download`, {
      token,
      responseType: 'blob',
      includeHeaders: true,
    })
    const contentDisposition = response.headers.get('content-disposition')
    const filename = parseFilenameFromDisposition(contentDisposition, `bill-${id}.txt`)
    return {
      blob: response.data,
      filename,
    }
  },
}
