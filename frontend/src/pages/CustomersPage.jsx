import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { PaginationControls } from '../components/common/PaginationControls'
import { StatusBanner } from '../components/common/StatusBanner'
import { formatFieldErrors, getErrorMessage } from '../lib/errors'
import { field, normalizePagedResponse } from '../lib/normalize'
import { useAuth } from '../hooks/useAuth'
import { customersApi } from '../services/api'

function mapCustomer(raw) {
  return {
    id: field(raw, 'id'),
    name: field(raw, 'name') ?? '',
    email: field(raw, 'email') ?? '',
    phone: field(raw, 'phone') ?? '',
    shopkeeperUserId: field(raw, 'shopkeeperUserId') ?? null,
    shopkeeperName: field(raw, 'shopkeeperName') ?? '-',
  }
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  shopkeeperUserId: '',
}

export function CustomersPage() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Admin'

  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await customersApi.list(token, {
        page,
        pageSize,
        search,
      })

      const normalized = normalizePagedResponse(response)
      setCustomers((normalized.data || []).map(mapCustomer))
      setTotalPages(normalized.totalPages)
      setTotalCount(normalized.totalCount)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load customers.'))
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, search])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const rows = useMemo(() => customers, [customers])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId('')
  }

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
      }

      if (isAdmin) {
        payload.shopkeeperUserId = form.shopkeeperUserId || null
      }

      if (editingId) {
        await customersApi.update(token, editingId, payload)
        setSuccess('Customer updated successfully.')
      } else {
        await customersApi.create(token, payload)
        setSuccess('Customer created successfully.')
      }

      resetForm()
      await loadCustomers()
    } catch (err) {
      const fieldErrors = formatFieldErrors(err.fieldErrors)
      setError(fieldErrors[0] ?? getErrorMessage(err, 'Unable to save customer.'))
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (customer) => {
    setEditingId(customer.id)
    setForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      shopkeeperUserId: customer.shopkeeperUserId ?? '',
    })
  }

  const handleDelete = async (customerId) => {
    const confirmed = window.confirm('Delete this customer?')
    if (!confirmed) {
      return
    }

    setError('')
    setSuccess('')

    try {
      await customersApi.remove(token, customerId)
      setSuccess('Customer deleted successfully.')
      if (selectedCustomer?.id === customerId) {
        setSelectedCustomer(null)
      }
      await loadCustomers()
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to delete customer.'))
    }
  }

  const handleDetails = async (customerId) => {
    setError('')

    try {
      const response = await customersApi.getById(token, customerId)
      setSelectedCustomer(mapCustomer(response))
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load customer details.'))
    }
  }

  return (
    <section>
      <PageHeader
        title="Customers"
        description="Manage retail customers with role-based access controls."
      />

      <StatusBanner variant="error" message={error} />
      <StatusBanner variant="success" message={success} />

      <div className="panel">
        <h3>Filters</h3>
        <div className="grid-two">
          <div className="form-field">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Name or email"
            />
          </div>

          <div className="inline-actions align-end">
            <button type="button" className="btn btn-outline" onClick={loadCustomers}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <form className="panel form-grid" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Edit Customer' : 'Create Customer'}</h3>

        <div className="grid-two">
          <div className="form-field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" value={form.name} onChange={handleFormChange} required />
          </div>

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleFormChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" value={form.phone} onChange={handleFormChange} required />
          </div>

          {isAdmin ? (
            <div className="form-field">
              <label htmlFor="shopkeeperUserId">Shopkeeper User ID (optional)</label>
              <input
                id="shopkeeperUserId"
                name="shopkeeperUserId"
                value={form.shopkeeperUserId}
                onChange={handleFormChange}
                placeholder="GUID"
              />
            </div>
          ) : null}
        </div>

        <div className="inline-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Update Customer' : 'Create Customer'}
          </button>
          {editingId ? (
            <button type="button" className="btn btn-outline" onClick={resetForm}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="panel">
        <h3>Customer List</h3>
        {loading ? (
          <p>Loading customers...</p>
        ) : rows.length === 0 ? (
          <p className="empty-state">No customers found.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Shopkeeper</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.email}</td>
                      <td>{customer.phone}</td>
                      <td>{customer.shopkeeperName}</td>
                      <td>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleDetails(customer.id)}
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleEdit(customer)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleDelete(customer.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {selectedCustomer ? (
        <div className="panel">
          <h3>Customer Details</h3>
          <div className="meta-grid">
            <span>ID: {selectedCustomer.id}</span>
            <span>Name: {selectedCustomer.name}</span>
            <span>Email: {selectedCustomer.email}</span>
            <span>Phone: {selectedCustomer.phone}</span>
            <span>Shopkeeper User ID: {selectedCustomer.shopkeeperUserId || 'N/A'}</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
